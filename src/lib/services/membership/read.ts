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

// D-002 (correction round 6, WP-operator-record, LAN-217): the per-item state list lives in
// onboarding-item-shapes.ts, deliberately without server-only, since client components need the
// same answer this write path uses.
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

// The required items still outstanding — what activation asks about. Excludes is_subscription
// (D10, model §2.1: never a gate) and anything not is_required. waived/not_applicable count as
// resolved — "required item set met or consciously waived".
function outstandingFrom(items: readonly OnboardingItem[]): OnboardingItem[] {
  return items.filter(
    (item) =>
      item.isRequired && !item.isSubscription && !RESOLVED_ITEM_STATUSES.includes(item.status),
  );
}

// The same rule, in SQL, for the roster's required_outstanding count — exists twice so the roster
// can count across 42 memberships in one query; membership.test.ts asserts the two copies agree.
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
  displayAlias: string | null; // the alias flagged as this person's display name, if they have one
  displayName: string; // the name as the roster shows it
  status: MembershipStatus;
  entry: string;
  email: string | null;
  phone: string | null;
  itemsTotal: number;
  itemsResolved: number; // complete, waived or not_applicable
  requiredOutstanding: number; // required, non-subscription, unresolved — what activation asks about
}

export interface RosterFilters {
  search?: string | null; // free text over names and raw contact values
  status?: string | null; // a membership_status value, or null for all
  entry?: string | null; // a membership_entry value, or null for all
  sort?: string | null; // one of ROSTER_SORT_COLUMNS; anything else falls back to the default
  direction?: string | null; // "asc" or "desc"; anything else falls back to the column's default
}

// A whitelist (as events.ts keeps one): sort arrives in the query string. status sorts by the
// enum's own declaration order (onboarding, active, inactive, departed, archived) — the order a
// season actually moves through — not alphabetically.
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
  // Object.hasOwn, not a plain lookup — a plain {}[sort] resolves prototype props like "toString"
  // to a truthy function, defeating ??, and the query becomes `order by undefined` (independent
  // review finding; see relocations.md).
  const column = Object.hasOwn(ROSTER_SORT_COLUMNS, sort ?? "")
    ? ROSTER_SORT_COLUMNS[sort as string]
    : ROSTER_SORT_COLUMNS[DEFAULT_ROSTER_SORT];
  const dir = direction === "asc" || direction === "desc" ? direction : column.default;
  return `${column.sql} ${dir === "asc" ? "asc" : "desc"} nulls last, coalesce(p.family_name, p.given_name) asc, p.given_name asc`; // stable name tie-break
}

export interface Roster {
  season: Season;
  entries: RosterEntry[];
  totalInSeason: number; // memberships in the season before any filter was applied
}

function displayNameOf(row: {
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
}): string {
  const formal = row.family_name ? `${row.given_name} ${row.family_name}` : row.given_name;
  return formal;
}

// A current contact value, chosen as UX-11 chooses one: preferred, else most recent. A correlated
// sub-select, not a join, so a person with three emails still produces one roster row.
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

// totalInSeason distinguishes UX-23's filter-empty state from a genuinely empty season (shared
// state contract), counted in the same transaction as the list. Search matches names and raw
// contact values (wireframe: "Search name or contact").
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
          -- Invariant I6, and not a theoretical row: Q-16 deliberately leaves
          -- an archived overlap season on the merged-away record rather than
          -- re-pointing it onto the survivor, so a merge puts a duplicate on
          -- the roster unless this says otherwise. The people directory and
          -- the recruitment board already draw the same line.
          and p.merged_into_person_id is null
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

    // The same merged-away exclusion: this count is "the season before any
    // filter", and a row the list can never show is not part of that season.
    const total = await tx.query<{ count: string }>(
      `select count(*)::text as count
         from public.season_memberships m
         join public.people p on p.id = m.person_id
        where m.season_id = $1 and p.merged_into_person_id is null`,
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
  outstandingRequired: OnboardingItem[]; // required, non-subscription and unresolved — what activation asks about
  statusHistory: MembershipStatusEvent[];
}

// Exported so write-status.ts and write-items.ts can return the fresh record after a write without opening a second transaction.
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
