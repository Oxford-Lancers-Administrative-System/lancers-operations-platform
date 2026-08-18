import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { recordAudit } from "./audit";
import { readCurrentSeasonIn, type Season } from "./seasons";
import { escapeLikePattern } from "./sql-text";

/**
 * The season membership aggregate — the roster, one membership's record, its
 * onboarding items, and the status changes this slice owns. LAN-75.
 *
 * ## Why this is a separate module from `roster.ts`
 *
 * `roster.ts` is intake: one operator entering one returning player, and the
 * dedupe decision that precedes it. This is what happens to a membership
 * afterwards — reading the season's roster, resolving onboarding, and declaring
 * a player operationally ready. Two different questions, two different sets of
 * rules, and only one of them is privileged.
 *
 * ## The transitions, and where the model puts each one
 *
 * Frozen model §2.1 gives activation two steps, and they have different
 * authors:
 *
 *   * `confirmed → onboarding` is **created by the system on confirmation** —
 *     "onboarding items generated for the season". No operator chooses it.
 *   * `onboarding → active` is triggered by an **operator declaring the player
 *     operationally ready (required item set met or consciously waived)**, and
 *     the permitted actor is **Exec/GM only**.
 *
 * `docs/architecture/data-model.md` § _Rules deliberately left to TypeScript_
 * puts legal transitions and who may trigger them above the database, so the
 * table below is data rather than a chain of `if`s, exactly as `events.ts`
 * does it. A pair not in the table is refused.
 *
 * ## The one interpretation this module makes, and why
 *
 * The approved wireframes decide where onboarding items come into existence.
 * UX-20 lists two memberships whose status reads **Confirmed** and whose
 * onboarding column reads "2 outstanding" and "3 outstanding"; UX-21 shows a
 * **Confirmed** membership with four of five items resolved and
 * "Activate membership" as its primary action. So in the approved interface a
 * membership carries its items while it is still `confirmed`, and activation
 * starts from there.
 *
 * That is what is built:
 *
 *   1. **Items are generated at confirmation**, from the season's configured
 *      types — `generateOnboardingItems()`, called inside the intake
 *      transaction in `roster.ts`. LAN-75's first acceptance criterion is
 *      "confirming a membership generates its onboarding items ... once,
 *      idempotently", and this is that sentence, literally.
 *   2. **The status stays `confirmed`** until somebody activates, which is what
 *      the wireframes show and what LAN-74's already-accepted intake produces.
 *   3. **Activation from `confirmed` writes both transitions** — the system's
 *      `confirmed → onboarding` and then the operator's `onboarding → active`.
 *      No state is skipped, so the status history reads exactly as §2.1's
 *      machine says it must, and a membership already sitting in `onboarding`
 *      (the seed has two) activates through the same call with one row instead
 *      of two.
 *
 * The alternative — moving a membership to `onboarding` the instant it is
 * confirmed — would have contradicted the approved screens and changed the
 * terminal status LAN-74 shipped and had accepted. This reading satisfies both.
 *
 * ## Subscriptions are never a gate
 *
 * Register D10, and the frozen model's own emphasis: "subs are structurally
 * *not* a gate (invoices go out in second term; special arrangements exist)".
 * `outstandingRequiredItems()` therefore excludes any item type flagged
 * `is_subscription`, whatever its status and whatever `is_required` says about
 * it. There is deliberately no configuration that could turn that back on, and
 * a test proves an unpaid subscription does not appear in the outstanding set.
 */

// ---------------------------------------------------------------------------
// The transition table
// ---------------------------------------------------------------------------

/** `public.membership_status`, in the frozen model's own order. */
export type MembershipStatus =
  | "carried_forward"
  | "confirmed"
  | "onboarding"
  | "active"
  | "inactive"
  | "withdrawn"
  | "departed"
  | "archived";

/** The transitions this slice performs. Anything absent is refused. */
export interface MembershipTransition {
  from: MembershipStatus;
  to: MembershipStatus;
  /**
   * True when the frozen model attributes the step to the system rather than
   * to the operator who happened to trigger it. Recorded in the status event's
   * reason so the history says which of the two it was.
   */
  system: boolean;
}

export const MEMBERSHIP_TRANSITIONS: readonly MembershipTransition[] = Object.freeze([
  Object.freeze({ from: "confirmed", to: "onboarding", system: true }),
  Object.freeze({ from: "onboarding", to: "active", system: false }),
  // Register D1: the club's normal case. One membership whose history carries
  // the gap, never a second record.
  Object.freeze({ from: "active", to: "inactive", system: false }),
  Object.freeze({ from: "inactive", to: "active", system: false }),
]) as readonly MembershipTransition[];

/** The statuses activation may start from. Both end at `active`. */
const ACTIVATABLE_FROM: readonly MembershipStatus[] = Object.freeze([
  "confirmed",
  "onboarding",
]) as readonly MembershipStatus[];

/**
 * How a refusal names the state the membership is actually in.
 *
 * The acceptance criterion asks for "a message naming the current state", so
 * every one of these is a sentence an operator can act on rather than an enum
 * value leaking onto the screen.
 */
const STATE_NAMES: Readonly<Record<MembershipStatus, string>> = Object.freeze({
  carried_forward: "carried forward from last season and not yet confirmed",
  confirmed: "confirmed",
  onboarding: "working through onboarding",
  active: "already active",
  inactive: "inactive",
  withdrawn: "withdrawn",
  departed: "departed",
  archived: "archived",
});

/** "This membership is departed." — the half of a refusal that says why. */
export function describeMembershipState(status: MembershipStatus | string): string {
  const name = STATE_NAMES[status as MembershipStatus] ?? status;
  return `This membership is ${name}.`;
}

// ---------------------------------------------------------------------------
// Onboarding items
// ---------------------------------------------------------------------------

/** `public.onboarding_item_status`. */
export type OnboardingItemStatus = "pending" | "invited" | "complete" | "waived" | "not_applicable";

/** The statuses that mean an item needs nothing further from anybody. */
export const RESOLVED_ITEM_STATUSES: readonly OnboardingItemStatus[] = Object.freeze([
  "complete",
  "waived",
  "not_applicable",
]) as readonly OnboardingItemStatus[];

/**
 * The club's words for an item's state, for refusals the operator reads.
 *
 * Deliberately here rather than imported from the presentation layer: a service
 * refusal has to be readable wherever it surfaces, including in a log or a test
 * name, and the service must not depend on a screen.
 */
const ONBOARDING_STATUS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  pending: "pending",
  invited: "invited",
  complete: "complete",
  waived: "waived",
  not_applicable: "not applicable",
});

/** The resolutions an operator may set from the membership detail screen. */
export const OPERATOR_ITEM_RESOLUTIONS: readonly OnboardingItemStatus[] = Object.freeze([
  "complete",
  "waived",
  "not_applicable",
]) as readonly OnboardingItemStatus[];

export interface OnboardingItem {
  id: string;
  code: string;
  label: string;
  isRequired: boolean;
  isSubscription: boolean;
  sortOrder: number;
  status: OnboardingItemStatus;
  completedOn: string | null;
  waivedReason: string | null;
  waivedByName: string | null;
  updatedAt: Date;
}

/**
 * Creates the season's onboarding items for one membership, once.
 *
 * Idempotent by the schema's own `onboarding_items_one_per_type` unique
 * constraint rather than by a preceding `select` — `on conflict do nothing`
 * cannot lose a race with a concurrent call, and a check-then-insert can.
 * Calling it a second time inserts nothing and is not an error, which is what
 * lets it sit safely on the confirmation path *and* be re-run for a membership
 * confirmed before this issue existed.
 *
 * A season with no configured item types yields no items. That is a real
 * configuration state, not a failure: the club has not decided what onboarding
 * means for that season yet.
 *
 * Returns how many rows this call actually created.
 */
export async function generateOnboardingItems(
  tx: Tx,
  membershipId: string,
  seasonId: string,
): Promise<number> {
  const result = await tx.query(
    `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
     select $1::uuid, t.season_id, t.id, 'pending'::public.onboarding_item_status
       from public.onboarding_item_types t
      where t.season_id = $2::uuid
     on conflict (season_membership_id, item_type_id) do nothing`,
    [membershipId, seasonId],
  );
  return result.rowCount ?? 0;
}

/**
 * The required items still outstanding — the set activation asks about.
 *
 * Two exclusions, both deliberate:
 *
 *   * **Anything flagged `is_subscription`.** Register D10 and frozen model
 *     §2.1. Subs are tracked and waivable and are never a gate on `active`.
 *   * **Anything not `is_required`.** An optional item is information, not a
 *     condition; blocking on one would make "required" meaningless.
 *
 * `waived` and `not_applicable` count as resolved because that is exactly what
 * the model means by "required item set met **or consciously waived**".
 */
function outstandingFrom(items: readonly OnboardingItem[]): OnboardingItem[] {
  return items.filter(
    (item) =>
      item.isRequired && !item.isSubscription && !RESOLVED_ITEM_STATUSES.includes(item.status),
  );
}

/**
 * The same rule, in SQL, for the roster list's `required_outstanding` count.
 *
 * It has to exist twice — once in TypeScript for the record, once in SQL so the
 * roster can count across 42 memberships in one query rather than reading every
 * item of every one of them. Two copies of a rule is how a rule rots, and
 * independent review demonstrated exactly that: deleting `and not
 * t.is_subscription` from the SQL copy left the whole suite green while UX-20's
 * Onboarding column began reporting an unpaid subscription as "1 outstanding" —
 * the precise lesson about this club that register D10 says must never be
 * taught, on the screen an operator scans first.
 *
 * So the SQL is a named constant rather than inline text, and
 * `membership.test.ts` asserts the two copies **agree** against a membership
 * whose only unresolved item is the subscription. Editing one and not the other
 * now fails.
 */
const GATING_ITEM_PREDICATE = `t.is_required and not t.is_subscription
      and i.status not in ('complete', 'waived', 'not_applicable')`;

async function readOnboardingItems(tx: Tx, membershipId: string): Promise<OnboardingItem[]> {
  const result = await tx.query<{
    id: string;
    code: string;
    label: string;
    is_required: boolean;
    is_subscription: boolean;
    sort_order: number;
    status: OnboardingItemStatus;
    completed_on: string | null;
    waived_reason: string | null;
    waived_by_name: string | null;
    updated_at: Date;
  }>(
    `select i.id, t.code, t.label, t.is_required, t.is_subscription, t.sort_order,
            i.status::text as status,
            to_char(i.completed_on, 'YYYY-MM-DD') as completed_on,
            i.waived_reason,
            w.given_name || coalesce(' ' || w.family_name, '') as waived_by_name,
            i.updated_at
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
       left join public.people w on w.id = i.waived_by_person_id
      where i.season_membership_id = $1::uuid
      order by t.sort_order, t.label`,
    [membershipId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    isRequired: row.is_required,
    isSubscription: row.is_subscription,
    sortOrder: row.sort_order,
    status: row.status,
    completedOn: row.completed_on,
    waivedReason: row.waived_reason,
    waivedByName: row.waived_by_name,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Reading the roster — UX-20 and UX-23
// ---------------------------------------------------------------------------

export interface RosterEntry {
  membershipId: string;
  personId: string;
  givenName: string;
  familyName: string | null;
  knownAs: string | null;
  /** The name as the roster shows it: known-as where there is one. */
  displayName: string;
  status: MembershipStatus;
  entry: string;
  email: string | null;
  phone: string | null;
  /** Every onboarding item this membership has. */
  itemsTotal: number;
  /** Those in `complete`, `waived` or `not_applicable`. */
  itemsResolved: number;
  /** Required, non-subscription, unresolved — what activation asks about. */
  requiredOutstanding: number;
}

export interface RosterFilters {
  /** Free text over names and raw contact values. */
  search?: string | null;
  /** A `membership_status` value, or `null` for all. */
  status?: string | null;
  /** An `membership_entry` value, or `null` for all. */
  entry?: string | null;
  /** One of `ROSTER_SORT_COLUMNS`. Anything else falls back to the default. */
  sort?: string | null;
  /** `"asc"` or `"desc"`. Anything else falls back to the column's default. */
  direction?: string | null;
}

/**
 * The columns an operator may sort by, and the SQL each one means.
 *
 * A whitelist, for the same reason `events.ts` keeps one: `sort` arrives in the
 * query string and the only safe way to put a caller's word in an `order by` is
 * to look it up in a list written here. An unrecognised value is the default,
 * never an error and never the caller's text.
 *
 * `status` sorts by the enum's own declaration order rather than
 * alphabetically, so the roster reads carried-forward, confirmed, onboarding,
 * active — the order a season actually moves through — instead of "active,
 * carried_forward, confirmed".
 */
export const ROSTER_SORT_COLUMNS: Readonly<
  Record<string, { sql: string; default: "asc" | "desc" }>
> = Object.freeze({
  name: Object.freeze({
    sql: "coalesce(p.family_name, p.given_name), p.given_name",
    default: "asc" as const,
  }),
  status: Object.freeze({ sql: "m.status", default: "asc" as const }),
  entry: Object.freeze({ sql: "m.entry", default: "asc" as const }),
  onboarding: Object.freeze({ sql: "required_outstanding", default: "desc" as const }),
});

export const DEFAULT_ROSTER_SORT = "name";

function rosterOrderBy(sort: string | null, direction: string | null): string {
  // `Object.hasOwn`, not a plain lookup. `ROSTER_SORT_COLUMNS["toString"]`
  // resolves through `Object.prototype` to a function, which is truthy — so
  // `??` never falls back, `column.sql` is `undefined`, and the query becomes
  // `order by undefined`, which the database refuses and the screen renders as
  // "the roster is unavailable". `?sort=toString` is a URL anybody can type;
  // `constructor`, `valueOf` and `hasOwnProperty` do the same. Not injection —
  // the whitelist still holds and nothing of the caller's text reaches the SQL
  // — but a denial of service on a screen, found by independent review.
  const column = Object.hasOwn(ROSTER_SORT_COLUMNS, sort ?? "")
    ? ROSTER_SORT_COLUMNS[sort as string]
    : ROSTER_SORT_COLUMNS[DEFAULT_ROSTER_SORT];
  const dir = direction === "asc" || direction === "desc" ? direction : column.default;
  // A stable tie-break on the name, so two operators sorting by status see the
  // same list rather than whatever order the rows came back in.
  return `${column.sql} ${dir === "asc" ? "asc" : "desc"} nulls last, coalesce(p.family_name, p.given_name) asc, p.given_name asc`;
}

export interface Roster {
  season: Season;
  entries: RosterEntry[];
  /** Memberships in the season before any filter was applied. */
  totalInSeason: number;
}

function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function displayNameOf(row: {
  given_name: string;
  family_name: string | null;
  known_as: string | null;
}): string {
  const formal = row.family_name ? `${row.given_name} ${row.family_name}` : row.given_name;
  return formal;
}

/**
 * A current contact value of one kind, chosen the way UX-11 chooses one: the
 * preferred one where there is one, else the most recently recorded. Superseded
 * values (`valid_until` set) never appear.
 *
 * Written as a correlated sub-select rather than a join so that a person with
 * three emails still produces exactly one roster row.
 */
const CONTACT_COLUMNS = `
  (select c.raw_value from public.contact_points c
    where c.person_id = p.id and c.kind = 'email' and c.valid_until is null
    order by c.is_preferred desc, c.created_at desc limit 1) as email,
  (select c.raw_value from public.contact_points c
    where c.person_id = p.id and c.kind = 'phone' and c.valid_until is null
    order by c.is_preferred desc, c.created_at desc limit 1) as phone`;

const ITEM_COUNT_COLUMNS = `
  (select count(*) from public.onboarding_items i
    where i.season_membership_id = m.id) as items_total,
  (select count(*) from public.onboarding_items i
    where i.season_membership_id = m.id
      and i.status in ('complete', 'waived', 'not_applicable')) as items_resolved,
  (select count(*) from public.onboarding_items i
     join public.onboarding_item_types t on t.id = i.item_type_id
    where i.season_membership_id = m.id
      and ${GATING_ITEM_PREDICATE}) as required_outstanding`;

interface RosterRow {
  membership_id: string;
  person_id: string;
  given_name: string;
  family_name: string | null;
  known_as: string | null;
  status: MembershipStatus;
  entry: string;
  email: string | null;
  phone: string | null;
  items_total: string;
  items_resolved: string;
  required_outstanding: string;
}

function toRosterEntry(row: RosterRow): RosterEntry {
  return {
    membershipId: row.membership_id,
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    knownAs: row.known_as,
    displayName: displayNameOf(row),
    status: row.status,
    entry: row.entry,
    email: row.email,
    phone: row.phone,
    itemsTotal: Number(row.items_total),
    itemsResolved: Number(row.items_resolved),
    requiredOutstanding: Number(row.required_outstanding),
  };
}

/**
 * The current season's memberships, optionally filtered.
 *
 * `totalInSeason` comes back alongside so the screen can tell UX-23's
 * filter-empty state from a season that genuinely has nobody in it — the shared
 * state contract requires the two to be distinguished, and the recovery differs
 * (clear the filters, or enter the first returner). It is counted in the same
 * transaction as the list, so the two cannot disagree.
 *
 * The search matches names *and* raw contact values, because the wireframe's
 * box says "Search name or contact" and an operator with a phone number and no
 * name is the case that box exists for.
 */
export async function listCurrentSeasonRoster(filters: RosterFilters = {}): Promise<Roster> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const search = escapeLikePattern(optional(filters.search));
    const status = optional(filters.status);
    const entry = optional(filters.entry);

    const result = await tx.query<RosterRow>(
      `select m.id as membership_id, p.id as person_id,
              p.given_name, p.family_name, p.known_as,
              m.status::text as status, m.entry::text as entry,
              ${CONTACT_COLUMNS},
              ${ITEM_COUNT_COLUMNS}
         from public.season_memberships m
         join public.people p on p.id = m.person_id
        where m.season_id = $1
          and ($2::text is null
               or p.given_name ilike '%' || $2 || '%'
               or coalesce(p.family_name, '') ilike '%' || $2 || '%'
               or coalesce(p.known_as, '') ilike '%' || $2 || '%'
               or exists (select 1 from public.contact_points c
                           where c.person_id = p.id and c.valid_until is null
                             and c.raw_value ilike '%' || $2 || '%'))
          and ($3::text is null or m.status::text = $3)
          and ($4::text is null or m.entry::text = $4)
        order by ${rosterOrderBy(optional(filters.sort), optional(filters.direction))}`,
      [season.id, search, status, entry],
    );

    const total = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.season_memberships where season_id = $1",
      [season.id],
    );

    return {
      season,
      entries: result.rows.map(toRosterEntry),
      totalInSeason: Number(total.rows[0].count),
    };
  });
}

// ---------------------------------------------------------------------------
// Reading one membership — UX-21
// ---------------------------------------------------------------------------

export interface MembershipContact {
  kind: string;
  rawValue: string;
  isPreferred: boolean;
}

export interface MembershipStatusEvent {
  fromStatus: MembershipStatus | null;
  toStatus: MembershipStatus;
  occurredAt: Date;
  actorName: string | null;
  actorLabel: string | null;
  reason: string | null;
}

export interface MembershipRecord {
  membershipId: string;
  personId: string;
  givenName: string;
  familyName: string | null;
  knownAs: string | null;
  displayName: string;
  status: MembershipStatus;
  entry: string;
  seasonId: string;
  seasonLabel: string;
  confirmedOn: string | null;
  activatedOn: string | null;
  inactivityLabel: string | null;
  contacts: MembershipContact[];
  onboardingItems: OnboardingItem[];
  /** Required, non-subscription and unresolved. What activation asks about. */
  outstandingRequired: OnboardingItem[];
  statusHistory: MembershipStatusEvent[];
}

export const MEMBERSHIP_NOT_FOUND_MESSAGE = "That membership no longer exists.";

async function readMembershipIn(tx: Tx, membershipId: string): Promise<MembershipRecord> {
  const result = await tx.query<{
    membership_id: string;
    person_id: string;
    given_name: string;
    family_name: string | null;
    known_as: string | null;
    status: MembershipStatus;
    entry: string;
    season_id: string;
    season_label: string;
    confirmed_on: string | null;
    activated_on: string | null;
    inactivity_label: string | null;
  }>(
    `select m.id as membership_id, p.id as person_id,
            p.given_name, p.family_name, p.known_as,
            m.status::text as status, m.entry::text as entry,
            s.id as season_id, s.label as season_label,
            to_char(m.confirmed_on, 'YYYY-MM-DD') as confirmed_on,
            to_char(m.activated_on, 'YYYY-MM-DD') as activated_on,
            m.inactivity_label
       from public.season_memberships m
       join public.people p on p.id = m.person_id
       join public.seasons s on s.id = m.season_id
      where m.id = $1::uuid`,
    [membershipId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(MEMBERSHIP_NOT_FOUND_MESSAGE, { rule: "season_memberships_not_found" });
  }

  const contacts = await tx.query<{ kind: string; raw_value: string; is_preferred: boolean }>(
    `select kind::text as kind, raw_value, is_preferred
       from public.contact_points
      where person_id = $1::uuid and valid_until is null
      order by kind, is_preferred desc, created_at`,
    [row.person_id],
  );

  const history = await tx.query<{
    from_status: MembershipStatus | null;
    to_status: MembershipStatus;
    occurred_at: Date;
    actor_name: string | null;
    actor_label: string | null;
    reason: string | null;
  }>(
    `select e.from_status::text as from_status, e.to_status::text as to_status,
            e.occurred_at, e.actor_label, e.reason,
            a.given_name || coalesce(' ' || a.family_name, '') as actor_name
       from public.season_membership_status_events e
       left join public.people a on a.id = e.actor_person_id
      where e.season_membership_id = $1::uuid
      order by e.occurred_at asc, e.from_status nulls first`,
    [membershipId],
  );

  const onboardingItems = await readOnboardingItems(tx, membershipId);

  return {
    membershipId: row.membership_id,
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    knownAs: row.known_as,
    displayName: displayNameOf(row),
    status: row.status,
    entry: row.entry,
    seasonId: row.season_id,
    seasonLabel: row.season_label,
    confirmedOn: row.confirmed_on,
    activatedOn: row.activated_on,
    inactivityLabel: row.inactivity_label,
    contacts: contacts.rows.map((contact) => ({
      kind: contact.kind,
      rawValue: contact.raw_value,
      isPreferred: contact.is_preferred,
    })),
    onboardingItems,
    outstandingRequired: outstandingFrom(onboardingItems),
    statusHistory: history.rows.map((event) => ({
      fromStatus: event.from_status,
      toStatus: event.to_status,
      occurredAt: event.occurred_at,
      actorName: event.actor_name,
      actorLabel: event.actor_label,
      reason: event.reason,
    })),
  };
}

/** One membership, with everything UX-21 states as fact. */
export async function readMembership(membershipId: string): Promise<MembershipRecord> {
  return withTransaction(async (tx) => readMembershipIn(tx, membershipId));
}

// ---------------------------------------------------------------------------
// Writing — the transitions
// ---------------------------------------------------------------------------

function requireActor(actorPersonId: string): void {
  if (typeof actorPersonId !== "string" || actorPersonId.trim() === "") {
    throw new ConstraintViolated("A membership change has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }
}

/**
 * Locks the membership row for the rest of the transaction and returns its
 * current status.
 *
 * `for update` rather than a plain read: two operators pressing Activate at the
 * same moment would otherwise both see `onboarding`, both pass the transition
 * check and both write an `onboarding → active` event, leaving a history that
 * claims the same transition happened twice. The lock makes the second one read
 * `active` and be refused by the rule that already exists.
 */
async function lockMembership(
  tx: Tx,
  membershipId: string,
): Promise<{ status: MembershipStatus; seasonId: string }> {
  const result = await tx.query<{ status: MembershipStatus; season_id: string }>(
    `select status::text as status, season_id
       from public.season_memberships
      where id = $1::uuid
      for update`,
    [membershipId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFound(MEMBERSHIP_NOT_FOUND_MESSAGE, { rule: "season_memberships_not_found" });
  }
  return { status: row.status, seasonId: row.season_id };
}

function transitionIsLegal(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_TRANSITIONS.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

async function recordStatusEvent(
  tx: Tx,
  params: {
    membershipId: string;
    from: MembershipStatus;
    to: MembershipStatus;
    actorPersonId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.membership_status, $3::public.membership_status, $4::uuid, $5)`,
    [params.membershipId, params.from, params.to, params.actorPersonId, params.reason ?? null],
  );
}

/** The reason recorded on the system's own step, so history says who authored it. */
const ONBOARDING_STARTED_REASON =
  "Onboarding started by the system; items generated for the season.";

export interface ActivationOutcome {
  membership: MembershipRecord;
  /** The required items that were outstanding when the operator proceeded. */
  proceededOver: OnboardingItem[];
  /** True when this call also wrote the system's `confirmed → onboarding` step. */
  startedOnboarding: boolean;
}

/**
 * Thrown when required items are outstanding and the operator has not yet said
 * to proceed. UX-22 is the screen that answers it.
 *
 * A distinct `rule` rather than a message match, so the screen can tell "you
 * need to confirm an override" apart from "this membership cannot be activated
 * at all" without reading English.
 */
export const ACTIVATION_NEEDS_OVERRIDE_RULE = "activation_requires_override_reason";

/**
 * `onboarding → active` — the operator declaring a player operationally ready.
 *
 * **Authorization is not here.** It is `requireCapability("membership_activation")`
 * in the server action, which resolves the actor from the verified session; a
 * service that took "who am I" as an argument would believe whatever it was
 * told. `actorPersonId` is the already-verified operator, and this function's
 * job is the domain rule, not the boundary. `src/lib/services/README.md` rule 1.
 *
 * Everything below commits together: the system's `confirmed → onboarding` step
 * where one is needed, the operator's `onboarding → active` step, the
 * membership row itself and the audit record. A failure at any statement leaves
 * the membership exactly as it was, with no half-written history.
 *
 * ## Outstanding required items do not block, they ask
 *
 * The frozen model's activation trigger is "required item set met **or
 * consciously waived**", and the acceptance criterion is explicit that
 * activation with outstanding items "is possible and records that the operator
 * proceeded". So an outstanding required item is refused *once*, with
 * `ACTIVATION_NEEDS_OVERRIDE_RULE`, and accepted as soon as the operator
 * supplies a reason — which is written to both the status event and the audit
 * row. It is a confirmation step, never a veto.
 *
 * An unpaid subscription is not in the outstanding set at all. See
 * `outstandingFrom()`.
 */
export async function activateMembership(params: {
  actorPersonId: string;
  membershipId: string;
  /** Required only when required items are outstanding. */
  overrideReason?: string | null;
}): Promise<ActivationOutcome> {
  const { actorPersonId, membershipId } = params;
  requireActor(actorPersonId);
  const overrideReason = optional(params.overrideReason);

  return withTransaction(async (tx) => {
    const { status, seasonId } = await lockMembership(tx, membershipId);

    if (!ACTIVATABLE_FROM.includes(status)) {
      throw new InvalidTransition(
        `${describeMembershipState(status)} Only a confirmed membership, or one working ` +
          "through onboarding, can be activated.",
        { rule: "membership_activation_illegal_from_state" },
      );
    }

    // Belt and braces for a membership confirmed before this issue shipped, or
    // by any path that did not generate them. Idempotent, so the ordinary case
    // — items already generated at confirmation — inserts nothing.
    await generateOnboardingItems(tx, membershipId, seasonId);

    const items = await readOnboardingItems(tx, membershipId);
    const outstanding = outstandingFrom(items);

    if (outstanding.length > 0 && overrideReason === null) {
      throw new ConstraintViolated(
        `${outstanding.length === 1 ? "One required onboarding item is" : `${outstanding.length} required onboarding items are`} ` +
          `still outstanding: ${outstanding.map((item) => item.label).join(", ")}. ` +
          "Activation is still allowed — give a reason for proceeding and it will be recorded.",
        { rule: ACTIVATION_NEEDS_OVERRIDE_RULE },
      );
    }

    const startedOnboarding = status === "confirmed";
    if (startedOnboarding) {
      // The frozen model's system step. Written rather than skipped so the
      // history is §2.1's machine and not a shortcut through it.
      if (!transitionIsLegal("confirmed", "onboarding")) {
        throw new InvalidTransition(describeMembershipState(status), {
          rule: "membership_transition_not_permitted",
        });
      }
      await recordStatusEvent(tx, {
        membershipId,
        from: "confirmed",
        to: "onboarding",
        actorPersonId,
        reason: ONBOARDING_STARTED_REASON,
      });
    }

    if (!transitionIsLegal("onboarding", "active")) {
      throw new InvalidTransition(describeMembershipState(status), {
        rule: "membership_transition_not_permitted",
      });
    }

    // Keyed on what was actually outstanding, not on whether a reason arrived.
    // The dialog only appears when something is outstanding, but a direct POST
    // can carry a reason regardless — and a history that says "activated with
    // outstanding required onboarding" beside an empty
    // `proceeded_over_outstanding` is a record asserting something that did not
    // happen. Found by independent review.
    const reason =
      outstanding.length === 0
        ? overrideReason === null
          ? "Operator declared the player operationally ready."
          : `Operator declared the player operationally ready: ${overrideReason}`
        : `Activated with outstanding required onboarding: ${overrideReason}`;

    await recordStatusEvent(tx, {
      membershipId,
      from: "onboarding",
      to: "active",
      actorPersonId,
      reason,
    });

    // `season_memberships_activation_is_dated` requires the date, and
    // `current_date` comes from the database so every date in one transaction
    // agrees. `coalesce` keeps the original activation date if this membership
    // has ever been active before.
    await tx.query(
      `update public.season_memberships
          set status = 'active',
              activated_on = coalesce(activated_on, current_date),
              inactivity_label = null,
              updated_at = now()
        where id = $1::uuid`,
      [membershipId],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "season_membership_activated",
      entityTable: "season_memberships",
      entityId: membershipId,
      fromState: status,
      toState: "active",
      reason,
      context: {
        issue: "LAN-75",
        started_onboarding: startedOnboarding,
        proceeded_over_outstanding: outstanding.map((item) => item.code),
        override_reason: overrideReason,
        // Register D9: the transitions live in the typed table. This names
        // where to read them rather than restating them.
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return {
      membership: await readMembershipIn(tx, membershipId),
      proceededOver: outstanding,
      startedOnboarding,
    };
  });
}

/**
 * `active → inactive` and `inactive → active` — register D1's normal case.
 *
 * "He was out from November to February" is one membership whose status history
 * carries the gap, never two records, so both directions write their own status
 * event and neither rewrites the other. `inactivity_label` is the schema's own
 * optional, non-medical home for why; *why somebody cannot play* is
 * availability's job and is not recorded here.
 */
export async function setMembershipInactive(params: {
  actorPersonId: string;
  membershipId: string;
  reason: string;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason);

  if (reason === null) {
    throw new ConstraintViolated("Say why this membership is going inactive.", {
      rule: "membership_inactivity_reason_required",
    });
  }

  return withTransaction(async (tx) => {
    const { status } = await lockMembership(tx, membershipId);

    if (!transitionIsLegal(status, "inactive")) {
      throw new InvalidTransition(
        `${describeMembershipState(status)} Only an active membership can be made inactive.`,
        { rule: "membership_transition_not_permitted" },
      );
    }

    await recordStatusEvent(tx, {
      membershipId,
      from: status,
      to: "inactive",
      actorPersonId,
      reason,
    });

    await tx.query(
      `update public.season_memberships
          set status = 'inactive', inactivity_label = $2, updated_at = now()
        where id = $1::uuid`,
      [membershipId, reason],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "season_membership_made_inactive",
      entityTable: "season_memberships",
      entityId: membershipId,
      fromState: status,
      toState: "inactive",
      reason,
      context: {
        issue: "LAN-75",
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return readMembershipIn(tx, membershipId);
  });
}

/**
 * `inactive → active`. Deliberately not `activateMembership()`: returning after
 * a break is not a fresh declaration of operational readiness, and re-asking
 * about onboarding items that were settled in September would be noise.
 */
export async function reactivateMembership(params: {
  actorPersonId: string;
  membershipId: string;
  reason?: string | null;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason) ?? "Back from a period of inactivity.";

  return withTransaction(async (tx) => {
    const { status } = await lockMembership(tx, membershipId);

    if (status !== "inactive" || !transitionIsLegal(status, "active")) {
      throw new InvalidTransition(
        `${describeMembershipState(status)} Only an inactive membership can be brought back.`,
        { rule: "membership_transition_not_permitted" },
      );
    }

    await recordStatusEvent(tx, {
      membershipId,
      from: "inactive",
      to: "active",
      actorPersonId,
      reason,
    });

    await tx.query(
      `update public.season_memberships
          set status = 'active',
              activated_on = coalesce(activated_on, current_date),
              inactivity_label = null,
              updated_at = now()
        where id = $1::uuid`,
      [membershipId],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "season_membership_reactivated",
      entityTable: "season_memberships",
      entityId: membershipId,
      fromState: "inactive",
      toState: "active",
      reason,
      context: {
        issue: "LAN-75",
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return readMembershipIn(tx, membershipId);
  });
}

// ---------------------------------------------------------------------------
// Writing — one onboarding item
// ---------------------------------------------------------------------------

/**
 * Marks one onboarding item complete, waived or not applicable.
 *
 * An onboarding item has no typed history table of its own — `onboarding_items`
 * carries only its current state — so unlike a membership transition this one
 * *does* write an `audit_events` row for the change itself. Register D9 refuses
 * duplication where a typed home exists; here there is none, so this is the
 * only record that the item moved, and it names the operator who moved it.
 *
 * The schema's `onboarding_items_waiver_is_justified` constraint requires a
 * waiver to carry both an author and a reason. Both are supplied here, and the
 * missing-reason case is refused before it reaches the database so the operator
 * gets a sentence rather than an integrity error.
 */
export async function resolveOnboardingItem(params: {
  actorPersonId: string;
  membershipId: string;
  itemId: string;
  status: OnboardingItemStatus;
  reason?: string | null;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId, itemId } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason);

  if (!OPERATOR_ITEM_RESOLUTIONS.includes(params.status)) {
    throw new ConstraintViolated("That is not a resolution this screen can record.", {
      rule: "onboarding_item_resolution_not_offered",
    });
  }
  if (params.status === "waived" && reason === null) {
    throw new ConstraintViolated("A waiver has to say why it was granted.", {
      rule: "onboarding_items_waiver_is_justified",
    });
  }

  return withTransaction(async (tx) => {
    // Scoped to the membership as well as the item: the item id arrives from a
    // form, and reading it alone would let a crafted request resolve an item
    // belonging to somebody else's membership.
    const existing = await tx.query<{
      status: OnboardingItemStatus;
      label: string;
      code: string;
      waived_reason: string | null;
    }>(
      `select i.status::text as status, t.label, t.code, i.waived_reason
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.id = $1::uuid and i.season_membership_id = $2::uuid
        for update of i`,
      [itemId, membershipId],
    );

    const item = existing.rows[0];
    if (!item) {
      throw new NotFound("That onboarding item is not on this membership.", {
        rule: "onboarding_items_not_found",
      });
    }

    /**
     * Saving the status an item already has is not a change, and must not be
     * recorded as one.
     *
     * Without this it wrote a fresh audit row whose `from_state` and
     * `to_state` were identical, and re-dated `completed_on` to today — so an
     * item completed in September silently claimed to have been completed
     * again in August, and the history filled with events in which nothing
     * happened. Owner review caught it: "if I change to say it's completed and
     * the status didn't change, it should not change again."
     *
     * Refused rather than silently ignored, so the operator learns why the
     * screen did not move. The message names the item and the state it is
     * already in, which is the same shape every other refusal here uses.
     */
    // A waiver whose *reason* changed is a real correction, not a no-op — an
    // operator who typo'd one has to be able to fix it without routing through
    // another status and writing audit rows for changes that did not happen.
    const sameReason =
      params.status !== "waived" || (item.waived_reason ?? null) === (reason ?? null);
    if (item.status === params.status && sameReason) {
      throw new InvalidTransition(
        `${item.label} is already ${ONBOARDING_STATUS_WORDS[params.status] ?? params.status}.`,
        { rule: "onboarding_item_already_in_that_state" },
      );
    }

    await tx.query(
      `update public.onboarding_items
          set status = $2::public.onboarding_item_status,
              completed_on = case when $2 = 'complete' then current_date else null end,
              waived_reason = case when $2 = 'waived' then $3 else null end,
              waived_by_person_id = case when $2 = 'waived' then $4::uuid else null end,
              updated_at = now()
        where id = $1::uuid`,
      [itemId, params.status, reason, actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "onboarding_item_resolved",
      entityTable: "onboarding_items",
      entityId: itemId,
      fromState: item.status,
      toState: params.status,
      reason,
      context: {
        issue: "LAN-75",
        season_membership_id: membershipId,
        item_code: item.code,
        item_label: item.label,
      },
    });

    return readMembershipIn(tx, membershipId);
  });
}
