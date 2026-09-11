// Audience selection vocabulary, derived groups and resolution rules (LAN-77). Pure — split out of
// event-audience.ts for the client builder component. See relocations.md. Decision history: missions/intake/M-RECRUITMENT

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
}

// public.audience_group, in full — the closed vocabulary a template's default audience is stored in (D43, D46).
export type AudienceGroupKey =
  "everyone_active" | "active_players" | "active_coaches" | "active_committee" | "recruits" | "bps";

/** A derived group offered on UX-40. Data, so the screen enumerates rather than hard-codes. */
export interface AudienceGroup {
  key: AudienceGroupKey;
  label: string;
  capacities: readonly AudienceCapacity[];
  eventTypes?: readonly string[]; // absent means every type; D46 puts recruits on Recruitment alone
  requiresBps?: boolean; // correction round 2 item 7: narrows to isBps candidates, on top of capacities
  templateEligible?: boolean; // false excludes from a template's default-audience picker; see relocations.md
}

// The system-derived groups the club has, and no others (D43, D44, D47) — keys match public.audience_group exactly.
export const AUDIENCE_GROUPS: readonly AudienceGroup[] = Object.freeze([
  Object.freeze({
    key: "everyone_active" as const, // first (Brian): the common case
    label: "Everyone active",
    capacities: Object.freeze(["player" as const, "coach" as const, "committee" as const]),
  }),
  Object.freeze({
    key: "active_players" as const,
    label: "All active players",
    capacities: Object.freeze(["player" as const]),
  }),
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
  // D46/LAN-295: recruits are kept out of the catalogue entirely off Recruitment events — see relocations.md.
  Object.freeze({
    key: "recruits" as const,
    label: "Recruits",
    capacities: Object.freeze(["recruit" as const]),
    eventTypes: Object.freeze([RECRUITMENT_EVENT_TYPE]),
  }),
  // Correction round 2 item 7 (WP-operator-record, LAN-217); D-003/D-004 round 3 — see relocations.md.
  Object.freeze({
    key: "bps" as const,
    label: "All Active BPS",
    capacities: Object.freeze(["player" as const]),
    requiresBps: true,
  }),
]);

// The groups offered for one event type — one answer across builder, template editor and approval review (docs/ux/standards.md rule 7).
export function groupsForEventType(eventType: string): readonly AudienceGroup[] {
  return AUDIENCE_GROUPS.filter(
    (group) => group.eventTypes === undefined || group.eventTypes.includes(eventType),
  );
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

// The selection keys a derived group expands to; called only when an operator presses the group's button.
export function groupSelectionKeys(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
): string[] {
  const group = AUDIENCE_GROUPS.find((candidate) => candidate.key === groupKey);
  if (!group) return [];
  return candidates
    .filter(
      (candidate) =>
        group.capacities.includes(candidate.capacity) && (!group.requiresBps || candidate.isBps),
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

  for (const group of groupsForEventType(eventType)) {
    const wanted = peopleIn(candidates, groupSelectionKeys(candidates, group.key));
    if (wanted.size === 0) continue;
    if (![...wanted].every((personId) => known.has(personId))) continue;
    if ([...wanted].every((personId) => covered.has(personId))) continue;
    groups.push(group.label);
    for (const personId of wanted) covered.add(personId);
  }

  return {
    groups,
    others: [...known].filter((personId) => !covered.has(personId)).length,
    noLongerSelectable,
    total: known.size + noLongerSelectable,
  };
}
