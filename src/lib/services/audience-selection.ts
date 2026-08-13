/**
 * What an audience selection *means* — the vocabulary, the derived groups and
 * the resolution rules. LAN-77.
 *
 * Split out of `event-audience.ts` for the same structural reason
 * `event-input.ts` is split out of `events.ts`, and the header there explains
 * it: this module is imported by the **client** component that renders the
 * audience builder, and `event-audience.ts` reaches the database. A client
 * component importing that would drag `pg` into the browser bundle, which does
 * not build.
 *
 * So everything here is pure — no database, no `server-only`, no framework — and
 * `event-audience.ts` re-exports it so a server caller has one import and does
 * not have to know the split exists.
 *
 * The rules living here rather than in the component is the point. The screen
 * has to show the approver **exactly** the list that approval will write, names
 * and count and capacity, because the confirmed list is the approval subject
 * rather than the group labels that produced it. A component that re-implemented
 * de-duplication would eventually disagree with the transaction by one person,
 * and the operator would never know which of the two was lying.
 */

/** The capacities an audience can be built from in this slice. */
export type AudienceCapacity = "player" | "coach" | "committee";

/**
 * Which capacity wins when one person qualifies under several.
 *
 * Player first because the overwhelmingly common collision is a committee
 * member or a coach who also plays, and the event being approved is a playing
 * event. The resolved capacity is shown on screen, so a wrong guess is visible
 * and correctable before approval rather than discovered afterwards.
 */
export const CAPACITY_PRECEDENCE: readonly AudienceCapacity[] = Object.freeze([
  "player",
  "coach",
  "committee",
]);

/** One selectable person, in one capacity, with everything UX-40 lists. */
export interface AudienceCandidate {
  /** `capacity:anchorId` — the only token that crosses the network. */
  key: string;
  capacity: AudienceCapacity;
  /** `season_memberships.id` for a player; `people.id` otherwise. Invariant P8. */
  anchorId: string;
  personId: string;
  /** The name as the roster shows it. */
  displayName: string;
  /** UX-40's Membership column: the membership status, or the seats held. */
  standing: string;
  /** UX-40's Unit column. Playing unit for a player; null for everyone else. */
  unit: string | null;
  /** UX-40's Contact column: phone where there is one, else email. */
  contact: string | null;
}

/** A derived group offered on UX-40. Data, so the screen enumerates rather than hard-codes. */
export interface AudienceGroup {
  key: string;
  label: string;
  capacities: readonly AudienceCapacity[];
}

/**
 * The system-derived groups Brian's clarification names, and no others.
 *
 * Every one is backed by current authoritative domain data. There is no saved
 * custom group here and no seam for one: custom group creation and
 * administration are explicitly not part of LAN-77 and "require later shaping if
 * the derived groups prove insufficient".
 */
export const AUDIENCE_GROUPS: readonly AudienceGroup[] = Object.freeze([
  // Everyone first, on Brian's instruction: it is the common case, and the
  // narrower groups then read as refinements of it rather than as a list you
  // have to assemble. The order here is the order on screen.
  Object.freeze({
    key: "everyone_active",
    label: "Everyone active",
    capacities: Object.freeze(["player" as const, "coach" as const, "committee" as const]),
  }),
  Object.freeze({
    key: "active_players",
    label: "All active players",
    capacities: Object.freeze(["player" as const]),
  }),
  Object.freeze({
    key: "active_coaches",
    label: "All active coaches",
    capacities: Object.freeze(["coach" as const]),
  }),
  Object.freeze({
    key: "active_committee",
    label: "All active committee",
    capacities: Object.freeze(["committee" as const]),
  }),
]);

/** The full selectable catalogue for one event. */
export interface AudienceCatalogue {
  candidates: AudienceCandidate[];
  /** Counts per capacity, so a group button can say how many it offers. */
  counts: Record<AudienceCapacity, number>;
}

export function selectionKey(capacity: AudienceCapacity, anchorId: string): string {
  return `${capacity}:${anchorId}`;
}

/** One resolved audience member — exactly what a row and an invitation need. */
export interface ResolvedAudienceMember {
  capacity: AudienceCapacity;
  /** `season_memberships.id` for a player, `people.id` otherwise. Invariant P8. */
  anchorId: string;
  personId: string;
  displayName: string;
  standing: string;
}

export const EMPTY_AUDIENCE_RULE = "event_audience_is_non_empty";

/**
 * Invariant E1b, in the club's language.
 *
 * `docs/architecture/data-model.md` records that the database *accepts* an empty
 * audience and that refusing one is the service layer's job — and a test in
 * `tests/schema-event-audience.test.ts` asserts that acceptance so the boundary
 * cannot be misread. This sentence is the refusal that boundary is waiting for.
 */
export const EMPTY_AUDIENCE_MESSAGE =
  "Choose who this event is for before approving it. An approved event with nobody " +
  "in its audience would send no invitations and would look approved to everyone " +
  "looking at the calendar.";

export const UNKNOWN_SELECTION_RULE = "event_audience_selection_unknown";

export const UNKNOWN_SELECTION_MESSAGE =
  "Some of the people chosen are no longer selectable for this event — a membership " +
  "or a role may have changed while the audience was being built. Rebuild the " +
  "audience and try again.";

/** Why a selection did not resolve. Two causes, two different recoveries. */
export type SelectionFailure = "empty" | "unknown";

export type SelectionResolution =
  | { ok: true; members: ResolvedAudienceMember[] }
  | { ok: false; failure: SelectionFailure; message: string; rule: string };

/**
 * Turns a set of selection keys into the audience that will be written.
 *
 * Returns a result rather than throwing, because it runs in the browser as well
 * as on the server and the browser has no `ServiceError` to catch — the same
 * reason `validateEventDraft` returns one. `requireSelection` in
 * `event-audience.ts` is the server-side wrapper that turns a failure into the
 * refusal a service caller expects.
 *
 * Three properties, each of which the screen and the transaction both depend on:
 *
 *   * **The capacity and the anchor are looked up, never accepted.** A key is
 *     only a lookup token into the catalogue. A forged `player:<person-id>`
 *     matches no candidate and fails to resolve, which is why invariant P8
 *     cannot be violated through this path at all.
 *   * **Duplicates collapse**, both the same key twice and the same person under
 *     two capacities — one human receives one invitation.
 *   * **An unknown key is a failure, not something to skip.** A selection that
 *     silently shrank between the confirmation screen and the write would mean
 *     the approver confirmed a list the club never invited.
 */
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
 * The selection keys a derived group expands to.
 *
 * Called only when an operator presses the group's button. Nothing calls it to
 * establish a default, and there is no code path on which an unpressed group
 * contributes anybody — which is the whole of "selection begins empty".
 */
export function groupSelectionKeys(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
): string[] {
  const group = AUDIENCE_GROUPS.find((candidate) => candidate.key === groupKey);
  if (!group) return [];
  return candidates
    .filter((candidate) => group.capacities.includes(candidate.capacity))
    .map((candidate) => candidate.key);
}

/**
 * How many **people** a group invites — not how many rows it selects.
 *
 * "Everyone active" spans three capacities, and the club's coaches and committee
 * are mostly also players, so the row count and the human count differ by a
 * dozen. The first version showed the row count and explained the discrepancy in
 * a sentence under the button. Brian's response was that the club knows what
 * "everyone active" means and should not be taught arithmetic about its own
 * roster — so the button now says what it will actually do, and there is nothing
 * left to explain.
 */
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

/**
 * Is everybody this group would invite already invited?
 *
 * Drives the lit state of the group button, and therefore what pressing it does:
 * a lit group clears, an unlit one adds. Computed from the selection rather than
 * remembered as "which buttons were pressed", because the two disagree the
 * moment somebody unticks one person out of a group.
 *
 * It compares **people**, not keys, and that is not a refinement — it is the
 * difference between working and not. "Everyone active" spans 45 keys for 34
 * humans, and the audience saved on the draft holds one key each. Reloading the
 * builder therefore restores 34 keys, and a key-wise comparison would find 11
 * missing and leave the button dark while every one of its people was in.
 */
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

/**
 * The selection after pressing a group button.
 *
 * Adding is a union of keys. **Removing is by person**, for the same reason the
 * lit state is: somebody selected as a player is still in "everyone active", and
 * clearing that group has to remove them whichever capacity they are held under.
 * Dropping only the group's own keys would leave a lit button's people behind.
 */
export function toggleGroup(
  candidates: readonly AudienceCandidate[],
  groupKey: string,
  selected: ReadonlySet<string>,
): Set<string> {
  const groupKeys = groupSelectionKeys(candidates, groupKey);

  if (!groupIsSelected(candidates, groupKey, selected)) {
    return new Set([...selected, ...groupKeys]);
  }

  const leaving = peopleIn(candidates, groupKeys);
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate] as const));
  return new Set(
    [...selected].filter((key) => {
      const candidate = byKey.get(key);
      return candidate === undefined || !leaving.has(candidate.personId);
    }),
  );
}
