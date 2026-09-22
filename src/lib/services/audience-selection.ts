// Audience selection vocabulary, derived groups and resolution rules (LAN-77). Pure — split out of
// event-audience.ts for the client builder component. See relocations.md.

import {
  COACHING_GROUP_VALUES,
  DEFENSIVE_POSITION_GROUP_VALUES,
  OFFENSIVE_POSITION_GROUP_VALUES,
  SPECIAL_TEAMS_SQUADS,
  WARMUP_SMALL_GROUP_VALUES,
} from "./roster-board/vocabulary";

// The capacities an audience can be built from; `recruit` (D46) anchors to the Person, not a membership.
export type AudienceCapacity = "player" | "coach" | "committee" | "recruit";

export const RECRUITMENT_EVENT_TYPE = "recruitment"; // public.event_type class, never a template name (LAN-265)

// Which capacity wins when one person qualifies under several — player first, the common collision.
const CAPACITY_PRECEDENCE: readonly AudienceCapacity[] = Object.freeze([
  "player",
  "coach",
  "committee",
  "recruit", // last, and costs nothing — a prospect who joins stops being offered by the catalogue at all
]);

/** One selectable person, in one capacity, with everything UX-40 lists. */
export interface AudienceCandidate {
  key: string; // capacity:anchorId — the only token that crosses the network
  capacity: AudienceCapacity;
  anchorId: string; // season_memberships.id for a player, people.id otherwise — invariant P8
  personId: string;
  displayName: string; // the name as the roster shows it
  standing: string; // UX-40 Membership column: status, or seats held
  unit: string | null; // UX-40 Unit column: playing unit for a player, null otherwise
  contact: string | null; // UX-40 Contact column: phone where there is one, else email
  isBps?: boolean; // WP-operator-record (LAN-217) R2#7 — narrows a player row; see relocations.md
  isOnboarding?: boolean; // LAN-388: a player-capacity row whose membership is mid-onboarding, not active
  /**
   * LAN-414. The roster assignments this candidate holds this season, verbatim
   * as the roster stores them, so a sub-group can be matched by the same pure
   * `groupSelectionKeys` every General group already uses. Player capacity
   * only: an assignment hangs off a season membership, which is why no recruit,
   * coach seat or committee seat ever carries one — and why an assignment
   * sub-group can never reach a recruit (LAN-416's other half).
   */
  coachingValues?: readonly string[]; // coaching groups and both sides' position groups, one flat list
  warmupGroup?: string | null; // at most one; the roster keeps one cell
  specialTeamsSquads?: readonly string[]; // every squad they hold any slot in, starter or backup
  /**
   * LAN-416. An open recruit's own status — `identified`, `engaged` or
   * `committed`. Recruit capacity only, and null everywhere else. Declined,
   * disengaged, voided and joined never reach the catalogue at all.
   */
  recruitStatus?: string | null;
}

// ---------------------------------------------------------------------------
// Categories — LAN-414
// ---------------------------------------------------------------------------

/**
 * `public.audience_group_category`. Which family a chosen audience group comes
 * from. Closed, and closed for the same reason `audience_group` is: a category
 * is a structural fact about where an audience is derived from, not a club
 * vocabulary anybody edits.
 */
export type AudienceGroupCategory =
  "general" | "coaching" | "warmup" | "special_teams" | "recruits";

/** The order the picker shows the categories in — State of the App call, 2026-09-22. */
const AUDIENCE_GROUP_CATEGORY_ORDER: readonly AudienceGroupCategory[] = Object.freeze([
  "general",
  "coaching",
  "warmup",
  "special_teams",
  "recruits",
]);

const AUDIENCE_GROUP_CATEGORY_LABELS: Readonly<Record<AudienceGroupCategory, string>> =
  Object.freeze({
    general: "General",
    coaching: "Coaching assignments",
    warmup: "Warmup assignments",
    special_teams: "Special teams",
    recruits: "Recruits",
  });

/**
 * One pill in the picker, and one stored audience row.
 *
 * `token` is the only string that crosses the network, the form and the
 * database read-back. A General group's token is its bare
 * `public.audience_group` key, unchanged from before LAN-414, so every stored
 * General row, every template default and every test that names a group by its
 * key still means exactly what it meant. Every other category's token is
 * `<category>:<value>`, where the value is the roster vocabulary's own word.
 */
export interface AudienceGroupOption {
  readonly token: string;
  readonly label: string;
  readonly category: AudienceGroupCategory;
  /** The `public.audience_group` value for a General option; null otherwise. */
  readonly audienceGroup: AudienceGroupKey | null;
  /** The roster value or recruit status for a non-General option; null for General. */
  readonly value: string | null;
}

export interface AudienceCategorySection {
  readonly category: AudienceGroupCategory;
  readonly label: string;
  readonly options: readonly AudienceGroupOption[];
}

const TOKEN_SEPARATOR = ":";

/** The stored pair a token names. `null` for a token no catalogue offers. */
export function parseAudienceGroupToken(token: string): {
  category: AudienceGroupCategory;
  audienceGroup: AudienceGroupKey | null;
  value: string | null;
} | null {
  const at = token.indexOf(TOKEN_SEPARATOR);
  if (at === -1) {
    const group = AUDIENCE_GROUPS.find((candidate) => candidate.key === token);
    return group ? { category: "general", audienceGroup: group.key, value: null } : null;
  }
  const category = token.slice(0, at) as AudienceGroupCategory;
  const value = token.slice(at + 1);
  if (category === "general" || !AUDIENCE_GROUP_CATEGORY_ORDER.includes(category)) return null;
  if (value === "") return null;
  return { category, audienceGroup: null, value };
}

/** The token a stored row is read back as — the inverse of {@link parseAudienceGroupToken}. */
export function audienceGroupTokenFor(
  category: string,
  audienceGroup: string | null,
  value: string | null,
): string | null {
  if (category === "general") return audienceGroup;
  if (value === null || value === "") return null;
  return `${category}${TOKEN_SEPARATOR}${value}`;
}

/**
 * The recruit sub-groups — LAN-416. `all` is identified + engaged + committed;
 * the other three are one status each. Declined, disengaged, voided and joined
 * are not here and are not in the catalogue, so they can never resolve.
 */
const OPEN_RECRUIT_STATUSES: readonly string[] = Object.freeze([
  "identified",
  "engaged",
  "committed",
]);

const RECRUIT_OPTIONS: readonly AudienceGroupOption[] = Object.freeze([
  Object.freeze({
    token: "recruits:all",
    label: "All active recruits",
    category: "recruits" as const,
    audienceGroup: null,
    value: "all",
  }),
  ...OPEN_RECRUIT_STATUSES.map((status) =>
    Object.freeze({
      token: `recruits:${status}`,
      label: `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`,
      category: "recruits" as const,
      audienceGroup: null,
      value: status,
    }),
  ),
]);

function valueOptions(
  category: AudienceGroupCategory,
  entries: readonly { value: string; label: string }[],
): readonly AudienceGroupOption[] {
  return Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        token: `${category}${TOKEN_SEPARATOR}${entry.value}`,
        label: entry.label,
        category,
        audienceGroup: null,
        value: entry.value,
      }),
    ),
  );
}

// One sub-group per value of the three Coaching Assignments columns, in the
// board's own order: coaching group, then offence, then defence. The three
// lists share no word, so one flat `coaching:` namespace holds all of them.
const COACHING_OPTIONS = valueOptions(
  "coaching",
  [
    ...COACHING_GROUP_VALUES,
    ...OFFENSIVE_POSITION_GROUP_VALUES,
    ...DEFENSIVE_POSITION_GROUP_VALUES,
  ].map((value) => ({ value, label: value })),
);

const WARMUP_OPTIONS = valueOptions(
  "warmup",
  WARMUP_SMALL_GROUP_VALUES.map((value) => ({ value, label: value })),
);

// Stewart: "If you have an assignment in kick return, you need to get a
// message… even if they're backup three." One pill per squad, never per slot.
const SPECIAL_TEAMS_OPTIONS = valueOptions(
  "special_teams",
  SPECIAL_TEAMS_SQUADS.map((squad) => ({ value: squad.squad, label: squad.label })),
);

// public.audience_group, in full — the closed vocabulary a template's default audience is stored in (D43, D46).
export type AudienceGroupKey =
  | "everyone_active"
  | "active_players"
  | "active_coaches"
  | "active_committee"
  | "onboarding"
  | "recruits"
  | "bps";

/** A derived group offered on UX-40. Data, so the screen enumerates rather than hard-codes. */
export interface AudienceGroup {
  key: AudienceGroupKey;
  label: string;
  capacities: readonly AudienceCapacity[];
  eventTypes?: readonly string[]; // absent means every type; D46 puts recruits on Recruitment alone
  requiresBps?: boolean; // correction round 2 item 7: narrows to isBps candidates, on top of capacities
  templateEligible?: boolean; // false excludes from a template's default-audience picker; see relocations.md
  /**
   * How this group treats a mid-onboarding membership.
   *
   * LAN-388 (Clint, confirmed by Brian, 2026-09-17) made Onboarding a group of
   * its own and kept it out of Active. **LAN-415 (Brian and Stewart,
   * 2026-09-22) reverses the second half of that.** Stewart: "I think active
   * personally should include onboarding because when I hit all active players
   * that should include the onboarding player." Brian: "I agree. Onboarding is
   * an administrative status internally… it's more of a marker to Clint." The
   * cost of the old reading was the costliest miss the club has — a rookie
   * still finishing their items, left off a practice invitation by an operator
   * who pressed Everyone active and assumed it meant everyone active.
   *
   * So `"include"` is now what the two player-wide groups carry, absent still
   * excludes, and `"only"` is still the Onboarding group itself, which stays
   * exactly as it was for an onboarding-only event.
   */
  onboarding?: "only" | "include";
}

// The system-derived groups the club has, and no others (D43, D44, D47) — keys match public.audience_group exactly.
export const AUDIENCE_GROUPS: readonly AudienceGroup[] = Object.freeze([
  // LAN-415 — the two player-wide groups reach a membership whether its
  // onboarding is finished or not. The label is unchanged (Brian: the picker's
  // resolved count is what makes the inclusion visible), and so is the
  // Onboarding group below it, for an onboarding-only event.
  Object.freeze({
    key: "everyone_active" as const, // first (Brian): the common case
    label: "Everyone active",
    capacities: Object.freeze(["player" as const, "coach" as const, "committee" as const]),
    onboarding: "include" as const,
  }),
  Object.freeze({
    key: "active_players" as const,
    label: "All active players",
    capacities: Object.freeze(["player" as const]),
    onboarding: "include" as const,
  }),
  // Unchanged by LAN-415: onboarding is a player fact, and a coach or a
  // committee seat never carries one.
  Object.freeze({
    key: "active_coaches" as const,
    label: "All active coaches",
    capacities: Object.freeze(["coach" as const]),
  }),
  Object.freeze({
    key: "active_committee" as const,
    label: "All active committee",
    capacities: Object.freeze(["committee" as const]),
  }),
  // LAN-388. Clint: an Onboarding person was in neither the active group nor
  // the recruits group, so there was no way to invite them to anything. Their
  // own group, on every event class an Active player is offered on; they hold
  // the player capacity and are invited on the player ladder, exactly as an
  // Active player is.
  //
  // LAN-415 keeps this group and changes nothing about it. It is no longer the
  // only way to reach those people — the two groups above now include them —
  // but it is still the only way to reach *only* them, which is what Brian
  // named it for: "here's a social for everyone who's onboarding".
  Object.freeze({
    key: "onboarding" as const,
    label: "Onboarding",
    capacities: Object.freeze(["player" as const]),
    onboarding: "only" as const,
  }),
  // D46/LAN-295 put a single `recruits` group here, offered on Recruitment
  // events alone. **LAN-416 (Brian, Stewart and Clint, 2026-09-22) replaces it
  // with the Recruits *category*** — four pills, offered on every event type,
  // and the only door to a recruit there is. Clint: "the type of an event
  // pertains to what's actually going to happen at the event, not who's
  // invited." Brian: "no one on the recruit list is ever going to be
  // \[included\] if you click all onboarding and all \[active\]" — which is why
  // the group is gone from here rather than widened: no General group carries
  // the `recruit` capacity at all, so none of them can reach one.
  //
  // The `recruits` value of `public.audience_group` is not dropped (an enum
  // value cannot be, and rows held it): the migration rewrites every stored row
  // to the new pair and the table refuses it as a General group from here on.
  //
  // Correction round 2 item 7 (WP-operator-record, LAN-217); D-003/D-004 round 3 — see relocations.md.
  Object.freeze({
    key: "bps" as const,
    label: "All Active BPS",
    capacities: Object.freeze(["player" as const]),
    requiresBps: true,
    // REQ-nothing-gates (WP-operator-record): an onboarding membership counts
    // as a player for event audiences from the moment they are on the team, so
    // a BPS selection on one has always reached this group. LAN-388 makes the
    // catalogue carry every onboarding membership rather than only the
    // selected ones, and this keeps that group answering the same way.
    onboarding: "include" as const,
  }),
]);

// The groups offered for one event type — one answer across builder, template editor and approval review (docs/ux/standards.md rule 7).
export function groupsForEventType(eventType: string): readonly AudienceGroup[] {
  return AUDIENCE_GROUPS.filter(
    (group) => group.eventTypes === undefined || group.eventTypes.includes(eventType),
  );
}

/**
 * The whole catalogue for one event, by category — LAN-414. One answer, read by
 * the event form, the template editor, the approval review and the event's own
 * audience panel (docs/ux/standards.md rule 7).
 *
 * Every category is offered on every event type. `eventTypes` survives on the
 * General groups as the mechanism it always was, but after LAN-416 nothing uses
 * it: the one group that narrowed by type was `recruits`, and recruits are a
 * category now.
 */
export function audienceCategoriesForEventType(
  eventType: string,
  options?: { readonly templateOnly?: boolean },
): AudienceCategorySection[] {
  const general = options?.templateOnly
    ? templateGroupsForEventType(eventType)
    : groupsForEventType(eventType);

  const byCategory: Record<AudienceGroupCategory, readonly AudienceGroupOption[]> = {
    general: general.map((group) => ({
      token: group.key,
      label: group.label,
      category: "general" as const,
      audienceGroup: group.key,
      value: null,
    })),
    coaching: COACHING_OPTIONS,
    warmup: WARMUP_OPTIONS,
    special_teams: SPECIAL_TEAMS_OPTIONS,
    recruits: RECRUIT_OPTIONS,
  };

  return AUDIENCE_GROUP_CATEGORY_ORDER.map((category) => ({
    category,
    label: AUDIENCE_GROUP_CATEGORY_LABELS[category],
    options: byCategory[category],
  })).filter((section) => section.options.length > 0);
}

/** The same catalogue flattened, in the same order — for the places that only need the list. */
export function audienceOptionsForEventType(
  eventType: string,
  options?: { readonly templateOnly?: boolean },
): AudienceGroupOption[] {
  return audienceCategoriesForEventType(eventType, options).flatMap((section) => section.options);
}

/** The one option a stored token names, or `null` for a token no catalogue offers. */
export function audienceOptionFor(
  eventType: string,
  token: string,
  options?: { readonly templateOnly?: boolean },
): AudienceGroupOption | null {
  return (
    audienceOptionsForEventType(eventType, options).find((option) => option.token === token) ?? null
  );
}

/**
 * The capacities any group offers for this event type — the audience *class*,
 * as opposed to the audience. LAN-391 needs it: when a draft's type changes,
 * the rows the new class cannot offer (a recruit on anything but Recruitment,
 * D46) have to leave with the old type.
 */
export function capacitiesForEventType(eventType: string): AudienceCapacity[] {
  const offered = new Set<AudienceCapacity>();
  for (const group of groupsForEventType(eventType)) {
    for (const capacity of group.capacities) offered.add(capacity);
  }
  // LAN-416: a recruit can be invited to any event type, so no type change ever
  // prunes one out of a draft's audience again. The assignment categories add
  // no capacity of their own — every person they can reach already holds the
  // player capacity that put the assignment on their membership.
  offered.add("recruit");
  return [...offered];
}

// The groups a template's default-audience picker may offer — groupsForEventType minus templateEligible: false.
export function templateGroupsForEventType(eventType: string): readonly AudienceGroup[] {
  return groupsForEventType(eventType).filter((group) => group.templateEligible !== false);
}

/** The full selectable catalogue for one event. */
export interface AudienceCatalogue {
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>; // per capacity, so a group button can say how many it offers
}

export function selectionKey(capacity: AudienceCapacity, anchorId: string): string {
  return `${capacity}:${anchorId}`;
}

// One selectable **human** (LAN-294) — a view over AudienceCandidate's per-capacity rows (see relocations.md).
export interface AudiencePerson {
  personId: string; // people.id — the row is the person; the memberships hang off it
  keys: string[]; // every selection key this human holds, in CAPACITY_PRECEDENCE order
  capacity: AudienceCapacity; // the capacity a write resolves them to — the first of capacities
  capacities: AudienceCapacity[]; // every capacity they qualify under, in CAPACITY_PRECEDENCE order
  standings: string[]; // their standing in each of capacities, same order
  displayName: string;
  unit: string | null;
  contact: string | null;
  isBps: boolean;
}

// The catalogue as people rather than capacities — the same collapse resolveSelection performs, so the ticked and written rows never disagree.
export function audiencePeople(candidates: readonly AudienceCandidate[]): AudiencePerson[] {
  const rank = (capacity: AudienceCapacity) => CAPACITY_PRECEDENCE.indexOf(capacity);
  const byPerson = new Map<string, AudiencePerson>();

  for (const candidate of [...candidates].sort((a, b) => rank(a.capacity) - rank(b.capacity))) {
    const held = byPerson.get(candidate.personId);

    if (!held) {
      byPerson.set(candidate.personId, {
        personId: candidate.personId,
        keys: [candidate.key],
        capacity: candidate.capacity,
        capacities: [candidate.capacity],
        standings: [candidate.standing],
        displayName: candidate.displayName,
        unit: candidate.unit,
        contact: candidate.contact,
        isBps: candidate.isBps ?? false,
      });
      continue;
    }

    held.keys.push(candidate.key);
    const at = held.capacities.indexOf(candidate.capacity); // one level up from the catalogue's own seat-join
    if (at === -1) {
      held.capacities.push(candidate.capacity);
      held.standings.push(candidate.standing);
    } else {
      held.standings[at] = `${held.standings[at]}, ${candidate.standing}`;
    }
    held.unit = held.unit ?? candidate.unit;
    held.contact = held.contact ?? candidate.contact;
    held.isBps = held.isBps || (candidate.isBps ?? false);
  }

  return [...byPerson.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

interface ResolvedAudienceMember {
  capacity: AudienceCapacity;
  anchorId: string; // season_memberships.id for a player, people.id otherwise — invariant P8
  personId: string;
  displayName: string;
  standing: string;
}

export const EMPTY_AUDIENCE_RULE = "event_audience_is_non_empty";

// Invariant E1b in the club's language — the database accepts an empty audience; this is the service-layer refusal.
export const EMPTY_AUDIENCE_MESSAGE =
  "Choose who this event is for before approving it. An approved event with nobody " +
  "in its audience would send no invitations and would look approved to everyone " +
  "looking at the calendar.";

export const UNKNOWN_SELECTION_RULE = "event_audience_selection_unknown";

const UNKNOWN_SELECTION_MESSAGE =
  "Some of the people chosen are no longer selectable for this event — a membership " +
  "or a role may have changed while the audience was being built. Rebuild the " +
  "audience and try again.";

/** Why a selection did not resolve. Two causes, two different recoveries. */
type SelectionFailure = "empty" | "unknown";

export type SelectionResolution =
  | { ok: true; members: ResolvedAudienceMember[] }
  | { ok: false; failure: SelectionFailure; message: string; rule: string };

// Turns selection keys into the audience that will be written; a result, not a throw (runs in the browser too).
export function resolveSelection(
  candidates: readonly AudienceCandidate[],
  keys: readonly string[],
): SelectionResolution {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));

  if (keys.some((key) => !byKey.has(key))) {
    return {
      ok: false,
      failure: "unknown",
      message: UNKNOWN_SELECTION_MESSAGE,
      rule: UNKNOWN_SELECTION_RULE,
    };
  }

  const rank = (capacity: AudienceCapacity) => CAPACITY_PRECEDENCE.indexOf(capacity);
  const byPerson = new Map<string, AudienceCandidate>();
  for (const key of keys) {
    const candidate = byKey.get(key);
    if (!candidate) continue;
    const held = byPerson.get(candidate.personId);
    if (!held || rank(candidate.capacity) < rank(held.capacity)) {
      byPerson.set(candidate.personId, candidate);
    }
  }

  const members = [...byPerson.values()]
    .map((candidate) => ({
      capacity: candidate.capacity,
      anchorId: candidate.anchorId,
      personId: candidate.personId,
      displayName: candidate.displayName,
      standing: candidate.standing,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (members.length === 0) {
    return {
      ok: false,
      failure: "empty",
      message: EMPTY_AUDIENCE_MESSAGE,
      rule: EMPTY_AUDIENCE_RULE,
    };
  }

  return { ok: true, members };
}

/**
 * LAN-388, amended by LAN-415 — whether one candidate's standing is what the
 * group is about. A candidate that is not a mid-onboarding membership (every
 * coach, every committee seat, every recruit, every active player) is only
 * ever excluded by the Onboarding group itself. The rule here is unchanged;
 * what changed on 2026-09-22 is which groups declare `"include"`.
 */
function matchesOnboarding(group: AudienceGroup, candidate: AudienceCandidate): boolean {
  if (candidate.isOnboarding !== true) return group.onboarding !== "only";
  return group.onboarding === "only" || group.onboarding === "include";
}

/**
 * Whether one candidate falls into one sub-group — LAN-414, LAN-416.
 *
 * The assignment categories read the roster values the candidate carries, which
 * only a player-capacity row ever does; the recruit category reads a recruit's
 * own status. Neither can cross into the other, which is the whole of "recruits
 * are reachable only through the Recruits pills, and no assignment sub-group
 * ever includes one".
 */
function matchesSubGroup(
  category: AudienceGroupCategory,
  value: string,
  candidate: AudienceCandidate,
): boolean {
  switch (category) {
    case "coaching":
      return (candidate.coachingValues ?? []).includes(value);
    case "warmup":
      return candidate.warmupGroup === value;
    case "special_teams":
      // Any slot in the squad, starter or any backup — Stewart's rule.
      return (candidate.specialTeamsSquads ?? []).includes(value);
    case "recruits":
      if (candidate.capacity !== "recruit") return false;
      // A status not in the open list never reached the catalogue, so `all`
      // cannot widen past identified/engaged/committed however it is read.
      if (candidate.recruitStatus === null || candidate.recruitStatus === undefined) return false;
      if (!OPEN_RECRUIT_STATUSES.includes(candidate.recruitStatus)) return false;
      return value === "all" || candidate.recruitStatus === value;
    case "general":
      return false;
  }
}

// The selection keys a derived group expands to; called only when an operator presses the group's pill.
export function groupSelectionKeys(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
): string[] {
  const parsed = parseAudienceGroupToken(groupKey);
  if (parsed === null) return [];

  if (parsed.category !== "general") {
    const value = parsed.value;
    if (value === null) return [];
    return candidates
      .filter((candidate) => matchesSubGroup(parsed.category, value, candidate))
      .map((candidate) => candidate.key);
  }

  const group = AUDIENCE_GROUPS.find((candidate) => candidate.key === parsed.audienceGroup);
  if (!group) return [];
  return candidates
    .filter(
      (candidate) =>
        group.capacities.includes(candidate.capacity) &&
        (!group.requiresBps || candidate.isBps) &&
        matchesOnboarding(group, candidate),
    )
    .map((candidate) => candidate.key);
}

// How many **people** a group invites, not how many rows it selects (see relocations.md).
export function groupSize(candidates: readonly AudienceCandidate[], groupKey: string): number {
  const resolution = resolveSelection(candidates, groupSelectionKeys(candidates, groupKey));
  return resolution.ok ? resolution.members.length : 0;
}

/** The people a set of selection keys resolves to, by person id. */
function peopleIn(
  candidates: readonly AudienceCandidate[],
  keys: readonly string[],
): ReadonlySet<string> {
  const resolution = resolveSelection(candidates, keys);
  return new Set(resolution.ok ? resolution.members.map((member) => member.personId) : []);
}

// Is everybody this group would invite already invited? Drives the group button's lit state.
// Compares **people**, not keys (see relocations.md).
export function groupIsSelected(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
  selected: ReadonlySet<string>,
): boolean {
  const wanted = peopleIn(candidates, groupSelectionKeys(candidates, groupKey));
  if (wanted.size === 0) return false;
  const held = peopleIn(candidates, [...selected]);
  return [...wanted].every((personId) => held.has(personId));
}

// The selection after pressing a group button: add the group's keys, or remove them. Removal is by
// key, not by person (see relocations.md for the bug person-wise removal caused).
export function toggleGroup(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
  selected: ReadonlySet<string>,
): Set<string> {
  const groupKeys = groupSelectionKeys(candidates, groupKey);

  if (!groupIsSelected(candidates, groupKey, selected)) {
    return new Set([...selected, ...groupKeys]);
  }

  const leaving = new Set(groupKeys);
  return new Set([...selected].filter((key) => !leaving.has(key)));
}

// The audience named by its groups before its people — W4, W4-A1. Widest group named first (LAN-242; see relocations.md).
export interface AudienceGroupSummary {
  groups: string[]; // labels of the groups wholly present, widest first — possibly empty
  others: number; // how many of the chosen people no named group accounts for
  noLongerSelectable: number; // chosen but the builder would no longer offer them; counted in total, never in others
  total: number; // how many people are chosen altogether
}

// The chosen selection, split into known people and no-longer-selectable keys. Tolerant where resolveSelection is strict.
function chosenIn(
  candidates: readonly AudienceCandidate[],
  selected: readonly string[],
): { known: ReadonlySet<string>; noLongerSelectable: number } {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const known = new Set<string>();
  const unknown = new Set<string>(); // by key, not count — the same key twice is one person

  for (const key of selected) {
    const candidate = byKey.get(key);
    if (candidate) known.add(candidate.personId);
    else unknown.add(key);
  }

  return { known, noLongerSelectable: unknown.size };
}

export function summariseAudienceGroups(
  candidates: readonly AudienceCandidate[],
  selected: readonly string[],
  eventType: string,
): AudienceGroupSummary {
  const { known, noLongerSelectable } = chosenIn(candidates, selected);
  const covered = new Set<string>();
  const groups: string[] = [];

  // LAN-414: every category, in the picker's own order, so the summary names a
  // sub-group the audience was actually built from instead of falling through
  // to "and N others".
  for (const option of audienceOptionsForEventType(eventType)) {
    const wanted = peopleIn(candidates, groupSelectionKeys(candidates, option.token));
    if (wanted.size === 0) continue;
    if (![...wanted].every((personId) => known.has(personId))) continue;
    if ([...wanted].every((personId) => covered.has(personId))) continue;
    groups.push(option.label);
    for (const personId of wanted) covered.add(personId);
  }

  return {
    groups,
    others: [...known].filter((personId) => !covered.has(personId)).length,
    noLongerSelectable,
    total: known.size + noLongerSelectable,
  };
}
