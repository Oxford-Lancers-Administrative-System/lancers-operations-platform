# Overview — M-ONBOARDING-AND-INFORMATION-COMPLETION

## Designed outcome

At the end of this mission the club can take a squad from "they're in" to
playing, without anyone chasing people by hand.

An operator imports last season's players into this season's roster, or flips a
recruit at Monday. Either way the person gets one identical message —
_"Welcome to the team, 2026–27"_ — carrying one link. Behind the link is a
single screen that is simultaneously the consent board and the personal-details
check: they tick their agreement to be messaged, confirm what the club already
holds, and fill what it doesn't. From then on the club knows exactly what is
still outstanding for that person, asks them for it on a bounded schedule
without anybody typing a message, stops permanently when it has asked enough,
and puts the name in front of a human instead. When the committee decides
someone is properly part of the team, a person flips them to active.

The system's job throughout is to **show what is outstanding and make chasing
it nearly free**. It is a tracker, not a gatekeeper: no onboarding item ever
blocks anything, anywhere, for anyone.

## Why now

Mission 6 · Recruitment is executing and fills the top of the funnel. Mission 5
· People & Roster shipped the record and the board that display all of this and
is deliberately not yet deployed — LAN-196 holds Missions 5, 6 and 7 for one
release window, so this mission is the last of a set that ships together. Until
it exists there is no path from a recruit or a spreadsheet to a season's squad
except an operator typing, and no consent capture at all outside the recruit
door, which means the club cannot lawfully message anybody it did not meet at a
recruiting event.

Two shipped things also depend on this mission to become coherent. Mission 5's
operator correction path was accepted only as the interim answer until a person
can fix their own record here. And the missing-data queue Mission 5 built has,
today, nothing that acts on it.

## In scope

Everything that happens to a **player** between the moment somebody decides they
are in and the day the club stops chasing them, in eight groups.

1. **Three doors, one path after them.** A recruit flipped to joined; a returner
   arriving in the import; a person added by hand on the roster, which ships
   today as `/operate/roster/new`. However they arrived, what happens next is
   identical. **Mission 6 stops at the word "opens"** — its W14 creates the
   membership, puts them on the roster and says onboarding opens. What opens it,
   what generates, what gets sent and what the form shows is defined in no
   mission today. It is defined here.
2. **What the recruit brings with them.** The form arrives already filled with
   what recruitment collected, so nobody is asked twice for what they answered
   at the door. A recruit who consented at the door _this_ season does not
   re-tick until next season. Their open recruit link is superseded, audited, by
   the onboarding ask, so nobody holds two live links.
3. **The import, built like the event import.** The same shape the club already
   knows: upload, then a page showing exactly who is about to be added, with
   potential duplicates listed underneath so the check sits in front of the
   operator rather than hidden. Rows that fail are explained without losing the
   ones that worked. Always into the season the roster is already in.
4. **The welcome** — one identical template for every door; the
   refuse-without-basis check with the welcome as its single exception; and
   onboarding memberships counting as players for event audiences.
5. **The form that is the consent board** — what it asks, how it adapts to what
   is already recorded, the seasonal consent tick as its first step, one-way on
   the player's side while an operator can switch it off at any point.
6. **The checklist, and the signals it feeds.** The twelve items, the `claimed`
   state and provenance, per-item history, reason-free waive and reopen,
   formalwear reasked each season. Its generation guards: an empty configuration
   reads as "season not configured", never "everyone complete", and an item type
   added mid-season backfills as pending onto everyone. And the signals other
   surfaces read from it — derived completeness, who is ready to activate,
   onboarding yellow against active green, roster filtering by item status, and
   the subscription item that constitutional membership derives from.
7. **Asking, and chasing.** One compiled ask per person, ever. Onboarding's own
   messaging cadence. The operator's own chase-and-flag surface for members,
   extending the one Mission 6 builds for recruits, so chasing somebody for
   personal details or onboarding items is one action in one place. Exhaustion
   into human follow-up.
8. **What comes back, activation, and leaving.** Ingestion that never silently
   overwrites; which consent record wins when two people merge; a player
   correcting their own record; activation as a human declaration — the gate to
   managing them as a player, and the only gate this mission has; a sectioned
   activity log; and leaving mid-onboarding — the ask simply stops, nothing more
   is asked, and whatever records exist stay as they are. Plus the per-season
   configuration operators set.

## Out of scope

**Anyone who is not a player.** Coaches and committee members get their own
flows in their own missions — their onboarding, their chasing and their
self-service alike (owner direction, 2026-09-01). Somebody who is both a coach
and a player is a player here, and that interferes with nothing.

Consent wording, versioning, retention, correction policy, subject-access
export, erasure and under-18 handling (Mission 8; wording is Clint's) · creating
a season, and season rollover and the season-boundary checklist reset
(Mission 11) · the recruitment funnel, its doors and its ladder up to the flip
(Mission 6) · **any chase of a recruit at all** · the event-RSVP reminder stream
(Mission 4) · the Monday report's own evolution (Mission 10) · real data, hosted
cutover and production activation (Tracks A and B) · player logins, in any form.

## Cross-cutting invariants

- **Privacy and capability boundary:** No player logins. Every player-facing
  interaction rides a signed, revocable, no-login link scoped to one person,
  carrying no session and exposing nobody else's information; an invalid link
  shows a uniform page that leaks nothing about why. The four-role group
  (President, Vice President, Secretary, General Manager) sees the queue,
  records and resolves; coaches and players never see another person's consent
  record or details. The collection loop itself is players only. Free text — refusal notes, correction reasons — is
  restricted to the four-role group and never reaches a report verbatim. Date of
  birth is restricted and never appears on a list, board or queue; only the
  derived under-18 flag does, and a flagged person is not messaged at all until
  a fresh owner decision defines under-18 handling. Every player-facing screen
  shows the club's privacy policy at the point of collection.

- **State vocabulary:**
  - _Membership_ — `onboarding · active · inactive · departed · archived`, as
    rebuilt 2026-08-26. Recruit is not one of these and lives on the recruitment
    record. `confirmed` is an action, never a resting state.
  - _Checklist item_ — `pending → invited → claimed → complete | waived | not_applicable`,
    plus reopen from any terminal state. **`claimed` is new** and means "the
    player says done, awaiting confirmation"; trust-class items skip it and
    complete on the player's word, carrying player-claimed provenance.
  - _Verification class_ — `trust · verify · derived · operator`, per-season
    configuration rather than code.
  - _Consent_ — `never_asked · asked · granted · refused · withdrawn`,
    season-scoped, one record per person per season.
  - _The ask_ — `invited · opened · submitted · corrected · already-complete · refused · expired/revoked · error`,
    with `refused` recorded per fact.
  - _The person's request state_ — `none · open · exhausted — human follow-up · unmessageable`.
  - _A fact in dispute_ — `disputed — awaiting verification`.

- **Audit posture:** Every state transition records actor, date and the state
  pair. Item history is append-only; a superseded value is retained, never
  overwritten. The per-player activity log is counted by section, so the record
  answers how often somebody was asked about a thing, not merely whether they
  were messaged. Audit events are retained six years and survive redaction.

- **Safety, consent, and recovery:** Nothing gates — no onboarding item blocks
  any action anywhere, and even a nonsensical state (active player, empty
  checklist) is legal. No automated timeout ever removes anyone; the chase stops
  and a human takes over. At most one open ask per person, ever, so nobody
  receives parallel nag threads. Nothing is ever sent by hand: every message
  rides Mission 4's pipeline, template-only in production. Consent is
  season-scoped and re-ticked every season; within a season the recruit-door
  grant carries, so nobody is asked twice in the same year; the player's own
  form cannot untick it, while an operator can switch it off at any point on
  request. Nothing but the welcome message may be dispatched without a recorded
  basis. The collection stream and the RSVP stream never carry each other's
  asks. Read-back applies on every mobile-capture path.

- **Rollout constraints:** This mission ships in one release window with
  Missions 5 and 6 (LAN-196) and is not deployed alone. Delivery callbacks
  (LAN-93) are a stated dependency, because the chase counts only messages known
  to have arrived. Real recipients are gated behind Clint's approved wording and
  LAN-86; until then the flow is built and walked with placeholder wording in a
  real versioned slot. Cadence values are provisional defaults restated at
  implementation, structured so a future committee-editable surface is a UI over
  them rather than a rework. A surface renders a field only where its substrate
  exists on `main` at build time.

## Sources

Pinned in `sources.md`. Controlling: the Task 10 brief (approved 2026-08-15,
amended 2026-08-26) and the Task 11 brief (approved 2026-08-15, amended
2026-08-26), together the primary coverage of Scope 5. Policy layer: the Task 07
brief, which assigns this mission the consent capture mechanics and the
refuse-without-basis check while retaining the policy itself. Portfolio row 7,
Portfolio v2. Brian's direction of 2026-09-01, recorded in `00-boundary.md`.

## Brian approval

- Exact words: "This mission seems roughly correct. I still want to get into the weeds about how the exact onboarding works, but as long as we understand this is about: how we intake players, how we get them through onboarding, what happens after they onboard, what's the gate to go and manage the team. I think we're good. So, as long as we think that's handled, I'm good to continue."
- Date: 2026-09-01
