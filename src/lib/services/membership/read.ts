import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { readCurrentSeasonIn, type Season } from "../seasons";
import { escapeLikePattern, personDisplayAliasSql } from "../sql-text";
import {
  MEMBERSHIP_NOT_FOUND_MESSAGE,
  optional,
  type MembershipStatus,
  type OnboardingItemStatus,
} from "./shared";

/**
 * The roster (UX-20/UX-23) and one membership's own record (UX-21). LAN-75.
 * See `relocations.md` for the module's design rationale.
 */

/** The statuses that mean an item needs nothing further from anybody. */
export const RESOLVED_ITEM_STATUSES: readonly OnboardingItemStatus[] = Object.freeze([
  "complete",
  "waived",
  "not_applicable",
]) as readonly OnboardingItemStatus[];

/**
 * D-002 (correction round 6, `WP-operator-record`, LAN-217) — one per-item
 * state list lives in `onboarding-item-shapes.ts`, a module deliberately
 * without `server-only`: the roster board and record page's client
 * components need the identical "what can this item be, and what can its
 * own control choose" answer this write path uses, and a client component
 * may not import a `server-only` module.
 */
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
 * item of every one of them. `membership.test.ts` asserts the two copies
 * **agree** against a membership whose only unresolved item is the
 * subscription. See `relocations.md` for why this is a named constant.
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

interface RosterEntry {
  membershipId: string;
  personId: string;
  givenName: string;
  familyName: string | null;
  /** The alias flagged as this person's display name, if they have one. */
  displayAlias: string | null;
  /** The name as the roster shows it. */
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
 * alphabetically, so the roster reads onboarding, active, inactive, departed,
 * archived — the order a season actually moves through — instead of "active,
 * archived, departed".
 */
const ROSTER_SORT_COLUMNS: Readonly<Record<string, { sql: string; default: "asc" | "desc" }>> =
  Object.freeze({
    name: Object.freeze({
      sql: "coalesce(p.family_name, p.given_name), p.given_name",
      default: "asc" as const,
    }),
    status: Object.freeze({ sql: "m.status", default: "asc" as const }),
    entry: Object.freeze({ sql: "m.entry", default: "asc" as const }),
    onboarding: Object.freeze({ sql: "required_outstanding", default: "desc" as const }),
  });

const DEFAULT_ROSTER_SORT = "name";

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

function displayNameOf(row: {
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
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
  display_alias: string | null;
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
    displayAlias: row.display_alias,
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
              p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
              m.status::text as status, m.entry::text as entry,
              ${CONTACT_COLUMNS},
              ${ITEM_COUNT_COLUMNS}
         from public.season_memberships m
         join public.people p on p.id = m.person_id
        where m.season_id = $1
          and ($2::text is null
               or p.given_name ilike '%' || $2 || '%'
               or coalesce(p.family_name, '') ilike '%' || $2 || '%'
               or exists (select 1 from public.person_aliases a
                           where a.person_id = p.id
                             and a.alias ilike '%' || $2 || '%')
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

interface MembershipContact {
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
  /** The alias flagged as this person's display name, if they have one. */
  displayAlias: string | null;
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

/**
 * Reads one membership inside an existing transaction. Exported so
 * `write-status.ts` and `write-items.ts` can return the fresh record after a
 * write without opening a second transaction.
 */
export async function readMembershipIn(tx: Tx, membershipId: string): Promise<MembershipRecord> {
  const result = await tx.query<{
    membership_id: string;
    person_id: string;
    given_name: string;
    family_name: string | null;
    display_alias: string | null;
    status: MembershipStatus;
    entry: string;
    season_id: string;
    season_label: string;
    confirmed_on: string | null;
    activated_on: string | null;
    inactivity_label: string | null;
  }>(
    `select m.id as membership_id, p.id as person_id,
            p.given_name, p.family_name,
            ${personDisplayAliasSql("p")} as display_alias,
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
    displayAlias: row.display_alias,
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
