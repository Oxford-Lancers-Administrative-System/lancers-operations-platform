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

/**
 * The capacities an audience can be built from.
 *
 * `recruit` joined the other three with D46, and only ever appears on a
 * Recruitment event — see `AUDIENCE_GROUPS`. It anchors to the durable Person
 * like coach and committee do, because a prospect is deliberately not a
 * membership: `public.recruitment_prospects` exists so that the roster keeps
 * meaning "people on the team".
 */
export type AudienceCapacity = "player" | "coach" | "committee" | "recruit";

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
  // Last, and it costs nothing: a prospect who is also a member is not a
  // prospect any more — `recruitment_prospects.status` is `joined` and the
  // catalogue stops offering them. The rank exists so the ordering is total.
  "recruit",
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
  /**
   * `WP-operator-record` (LAN-217) correction round 2, item 7 — the BPS
   * audience group. `bps_selections.is_selected` for this season, `false`
   * for every non-player candidate. Not a fifth `AudienceCapacity`: the BPS
   * group is still a `player`-capacity row (the same
   * `event_audience_members.capacity` value every other player already
   * writes), narrowed by this one extra flag instead — nothing about BPS
   * gates anything else, so it must not touch the closed capacity
   * vocabulary a real approved event already persists. Optional — every
   * existing caller building a candidate for a non-BPS purpose leaves it
   * undeclared, which reads as `false`.
   */
  isBps?: boolean;
}

/**
 * `public.audience_group`, in full — the closed vocabulary a template's default
 * audience is stored in (D43, D46).
 *
 * Closed because D43 is explicit that there is no further roster-derived group
 * and no saved custom group, and D44 that there are no unit or kit groups: the
 * unit control on the builder filters who is on screen and creates nothing.
 */
export type AudienceGroupKey =
  "everyone_active" | "active_players" | "active_coaches" | "active_committee" | "recruits" | "bps";

/** A derived group offered on UX-40. Data, so the screen enumerates rather than hard-codes. */
export interface AudienceGroup {
  key: AudienceGroupKey;
  label: string;
  capacities: readonly AudienceCapacity[];
  /**
   * The event types this group is offered on. Absent means every type.
   *
   * D46 puts the recruits group on Recruitment alone, and
   * `event_template_audience_groups_recruits_are_recruitment_only` says the same
   * thing in the database. This field is what stops the builder and the template
   * editor each inventing their own copy of that rule.
   */
  eventTypes?: readonly string[];
  /** Correction round 2, item 7: narrows this group to candidates with `isBps`, on top of `capacities`. */
  requiresBps?: boolean;
  /**
   * `false` excludes this group from a template's own default-audience
   * picker (`templateGroupsForEventType`) even though the single-event
   * builder still offers it (`groupsForEventType`). Absent means eligible —
   * every existing group's own behaviour, unchanged. BPS is the one
   * exception: `public.audience_group`, the closed enum a template default
   * actually persists to, does not carry a `bps` value and this package adds
   * no migration, so BPS must never reach that write path.
   */
  templateEligible?: boolean;
}

/**
 * The system-derived groups the club has, and no others.
 *
 * Every one is backed by current authoritative domain data. There is no saved
 * custom group here and no seam for one: D43 is explicit that there is no
 * further roster-derived group, and D44 that there are no unit or kit groups —
 * the unit control on the builder filters who is on screen and creates nothing.
 *
 * The list is also the vocabulary a template's default audience is stored in
 * (D47), which is why the keys match `public.audience_group` exactly.
 */
export const AUDIENCE_GROUPS: readonly AudienceGroup[] = Object.freeze([
  // Everyone first, on Brian's instruction: it is the common case, and the
  // narrower groups then read as refinements of it rather than as a list you
  // have to assemble. The order here is the order on screen.
  Object.freeze({
    key: "everyone_active" as const,
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
  // D46. A recruitment event is the one occasion the club invites people who
  // are not on the roster, so this is the one type the group appears on.
  Object.freeze({
    key: "recruits" as const,
    label: "Recruits",
    capacities: Object.freeze(["recruit" as const]),
    eventTypes: Object.freeze(["recruitment"]),
  }),
  // Correction round 2, item 7 (`WP-operator-record`, LAN-217): the roster's
  // own BPS column, offered here too. Every event type, like every group
  // above except Recruits. Includes onboarding memberships, not only active
  // ones — `REQ-nothing-gates` in the packet states that onboarding
  // memberships count as players for event audiences from the moment they
  // are on the team, even though "active players" and "everyone active"
  // above stay active-only.
  Object.freeze({
    key: "bps" as const,
    label: "BPS",
    capacities: Object.freeze(["player" as const]),
    requiresBps: true,
    templateEligible: false,
  }),
]);

/**
 * The groups offered for one event type.
 *
 * The builder, the template editor and the approval review all ask this rather
 * than filtering for themselves, so "which groups does a Social have?" has one
 * answer — `docs/ux/standards.md` rule 7 over three surfaces.
 */
export function groupsForEventType(eventType: string): readonly AudienceGroup[] {
  return AUDIENCE_GROUPS.filter(
    (group) => group.eventTypes === undefined || group.eventTypes.includes(eventType),
  );
}

/**
 * The groups a template's own default-audience picker may offer — the same
 * as {@link groupsForEventType}, minus any group `templateEligible: false`
 * excludes. Correction round 2, item 7: BPS is offered on the single-event
 * builder but never here, because `public.audience_group` — the closed enum
 * a template default actually persists to — has no `bps` value and this
 * package adds no migration.
 */
export function templateGroupsForEventType(eventType: string): readonly AudienceGroup[] {
  return groupsForEventType(eventType).filter((group) => group.templateEligible !== false);
}

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
    .filter(
      (candidate) =>
        group.capacities.includes(candidate.capacity) && (!group.requiresBps || candidate.isBps),
    )
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
 * The selection after pressing a group button: add the group's keys, or remove
 * them.
 *
 * ## Removal is by key, and the first version got this wrong
 *
 * It removed every key belonging to a *person* in the group. That is
 * indistinguishable from key-wise removal for "Everyone active" — which is the
 * only group the test exercised — and destructive for every narrower one:
 *
 *   * Select **All active players** (Alice, Bob, Cara), then **All active
 *     committee** (adds Xena), then press committee again to undo. Alice also
 *     holds a committee seat, so person-wise removal took her out too — even
 *     though the players group put her there and is still lit.
 *   * Worse, with one press: after selecting players, **All active coaches** is
 *     already lit, because the only coach is a selected player. Pressing it to
 *     *add* coaches took the remove branch and deleted her. Fewer people than
 *     before, and no coach added.
 *
 * Ten people in the seeded club hold two capacities, so that was one mis-click
 * from an approval quietly missing somebody, with the audit recording the
 * already-shrunk count. Independent review found it; `npm run test` did not.
 *
 * Removing exactly the keys the group would add is the inverse of adding them,
 * which is what a toggle should be. A person held under another capacity keeps
 * that capacity and stays in the audience.
 *
 * ## Why a lit button can then do nothing
 *
 * `groupIsSelected` asks whether everybody in the group is invited, so it can
 * light up for a group whose own keys are not in the selection at all — the
 * coaches case above, and any group restored from a saved audience, which holds
 * one key per person rather than one per capacity.
 *
 * Pressing such a button removes its keys, finds none, and changes nothing. The
 * button stays lit, which is still true: those people are still all invited.
 * That is the honest outcome, and much better than the alternative, which was
 * to delete somebody the operator never asked to remove. Anyone genuinely
 * wanting them out can untick them individually or press **Clear selection**.
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

  const leaving = new Set(groupKeys);
  return new Set([...selected].filter((key) => !leaving.has(key)));
}

/**
 * The audience named by its groups before its people — W4, amendment W4-A1.
 *
 * Brian, 2026-08-21: "it should say at the very top what groups it would be ...
 * You don't have to show me how it's done." An approver checks a shape faster
 * than they check a list of thirty-five, so the review leads with **All active
 * players, all coaches** and a headcount, and the names follow underneath.
 *
 * ## The covering, and why it is greedy in the declared order
 *
 * `AUDIENCE_GROUPS` runs widest first, so the walk below names the broadest
 * group that is wholly present and then only names a narrower one if it adds
 * somebody not already covered. An audience of the whole club therefore reads
 * "Everyone active" rather than "Everyone active, all active players, all active
 * coaches, all active committee", which is the same fact said four times.
 *
 * ## What is left over is counted, never guessed at
 *
 * People chosen by hand belong to no group, and a group that is *partly*
 * selected is not named at all — naming it would tell the approver the whole
 * group is invited when it is not, which is the one thing this line must never
 * do. They come back as `others`, and the named list underneath is where they
 * are actually read.
 */
export interface AudienceGroupSummary {
  /** The labels of the groups wholly present, widest first. Possibly empty. */
  groups: string[];
  /** How many of the chosen people no named group accounts for. */
  others: number;
  /** How many people are chosen altogether. */
  total: number;
}

export function summariseAudienceGroups(
  candidates: readonly AudienceCandidate[],
  selected: readonly string[],
  eventType: string,
): AudienceGroupSummary {
  const chosen = peopleIn(candidates, selected);
  const covered = new Set<string>();
  const groups: string[] = [];

  for (const group of groupsForEventType(eventType)) {
    const wanted = peopleIn(candidates, groupSelectionKeys(candidates, group.key));
    if (wanted.size === 0) continue;
    if (![...wanted].every((personId) => chosen.has(personId))) continue;
    if ([...wanted].every((personId) => covered.has(personId))) continue;
    groups.push(group.label);
    for (const personId of wanted) covered.add(personId);
  }

  return {
    groups,
    others: [...chosen].filter((personId) => !covered.has(personId)).length,
    total: chosen.size,
  };
}
