# W3 — Add or link a person who holds no membership

- Purpose/intended outcome: a human the club deals with who is not a player —
  a coach, a committee member, somebody's parent, a contact at another club —
  gets a record, and the club does not end up holding them twice.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: a new Head Coach arrives; the AGM elects a Treasurer who has never
  played; somebody needs to be reachable and there is nowhere to put them.
- Entry point: **Add a person** on the People list (`W1-01`).
- Route/placement: `/operate/people/new`. Neither the route nor its parent exists
  on `main`; nothing occupies the path.
- Controlling source: Task 08 §2 (a Person is minted at first identity; an
  unassigned Person is permitted), §4 (the minimum to mint), §6 (authority);
  Task 09 D7 (dedup before create at every door); LAN-146 A1.
- User-visible result: a Person exists — either newly minted, or the existing
  record the duplicate check surfaced — and it was never silently created and
  never silently merged.

## Required actions

- Take a first name, a last name and one contact point. Those are the minimum to
  mint, and they are also the required set for somebody who is not a player.
- **Run the duplicate check before creating anything.** Match on first name,
  last name, aliases, every email and every phone — the same rule the operator
  invitation path and the returner intake already use.
- Show what the check found: each candidate with enough to tell them apart, and
  what matched. Never a bare "possible duplicate".
- Offer three answers, and require one: **this is them** — link and stop;
  **this is somebody new** — mint; **stop** — neither.
- Land on the new or linked record.

**No role is recorded here.** Brian, 2026-08-27: _"This is where people get
created. If we want to create a role later for them, there is a place called
Roles where roles get assigned. The purpose of this is to add people independent
of roles."_ The Roles surface already exists under Administration and is
Mission 1's.

## State transitions

- A Person row is created, or none is and an existing one is opened.
- One audit event records the creation, the duplicate candidates that were shown,
  and which answer the operator gave.
- **No membership is created.** This path never puts anybody on the roster.

## Handoffs

- To `W1` on the resulting record.
- To `W2` to fill anything beyond the minimum.
- To `W4` when the operator recognises the duplicate only after minting.
- To Mission 1 to grant a login or a club role that carries authority — this
  surface records what somebody is, and grants nothing.
- To the returner intake on the roster when the person being added is a player;
  that door already exists and is not rebuilt here.
- To Mission 6's recruitment doors, which call the same matching and decide their
  own per-door behaviour.

## Dependencies and mission boundaries

- **The matching rule already exists, three times**, and the code records that
  duplication as deliberate: the operator invitation path, the returner intake in
  `roster.ts`, and now this. Each door checks the fact that decides whether it may
  proceed. Whether the three are later consolidated is implementation detail.
- **LAN-146 A1: the member-facing duplicate check is unbound by tests.** It is
  absorbed here because the check is this mission's core machinery, and it is
  bound by this workflow's acceptance.
- A person given no role at all appears in no season's list and is reachable only
  through `W1-04` or a direct link. Task 08 §2 permits it.
- **Everybody created here lands outside the season.** With roles out of this
  workflow, a new person has no membership and no role, so they have no tie to
  any season and the season-scoped People list does not hold them. They are
  reachable through _see people outside this season_ or a direct link. Task 08 §2
  permits exactly this, and `W3-07` draws it.

  It is the cost of the 2026-08-27 decision, recorded rather than smoothed over:
  an operator adds somebody and does not find them where they just were. Whether
  creation should offer to open Roles straight afterwards is an open question on
  `W3-07`.

- Recruitment doors, their fields and their stages are Mission 6's.

## Exceptions and recovery

- **An exact match on a contact point.** Treated as a near-certainty: the
  candidate is shown first, and minting anyway requires the operator to say so
  explicitly.
- **A merged-away record matches.** It is never offered. The survivor is offered
  in its place, which is what the shipped matching already does.
- **A match that is a different human.** Minting proceeds and the fact that the
  operator was shown the candidate and rejected it is audited, so a later merge
  can see the decision was deliberate.
- **Nothing typed but a first name.** The save is refused, naming what is
  missing. The minimum is not negotiable at the door even though the queue will
  chase the rest.
- **The person already holds a membership.** The check surfaces them, linking
  opens their existing record, and nothing is created.

## Safety, privacy, consent, and authority boundaries

- Four-role only.
- **The duplicate check discloses other people's names and contact details**, to
  an operator who has typed a name that might not be theirs. That is why the
  capability is asserted on the query and not on the screen, and why the
  candidate list shows only what distinguishes one person from another.
- Nothing here sends a message, records a lawful basis, or grants any access.
- No login and no club role is created by this path, whatever role is recorded.
- Creation is audited with actor, timestamp, the candidates shown and the answer
  given.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. mint a person and find them **outside this season**, with no role and no
   membership, and reach them from there;
2. type a name that already exists and be **shown the existing record before
   anything is created**;
3. choose **this is them** and land on the existing record with nothing created;
4. choose **this is somebody new** over a near match, and find both records
   present and the decision audited;
5. be **refused** on a first name alone;
6. confirm a **merged-away record is never offered** and its survivor is;
7. confirm **no role assignment was created** by any path through this workflow;
8. confirm **no membership was created** by any path through this workflow.

## Core decisions

| Decision                                                                                  | Classification                | Governing evidence or recommended default                                                                                 | Status        |
| ----------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| One primary action, top right, on every screen; row choices sit on their row              | `locked`                      | Brian, 2026-08-27                                                                                                         | Settled       |
| The minimum to mint is first name, last name and one contact point                        | `locked`                      | Task 08 §4 as amended 2026-08-26; last name became required at every rung the same day                                    | Settled       |
| The duplicate check runs before creation and its result must be answered                  | `locked`                      | Task 09 D7                                                                                                                | Settled       |
| A role — season or committee year — is captured at creation rather than on a second visit | `proposed for owner approval` | Without it a coach lands outside every season, which contradicts the 2026-08-26 ruling that a coach is part of the season | Recommend yes |
| Minting over an exact contact-point match requires an explicit override                   | `proposed for owner approval` | A shared email is the strongest duplicate signal the club has                                                             | Recommend yes |
| Rejected duplicate candidates are audited, not discarded                                  | `proposed for owner approval` | It is what lets a later merge see the decision was deliberate rather than careless                                        | Recommend yes |
| This path never creates a membership                                                      | `locked`                      | The frozen model: the roster means people on the team                                                                     | Settled       |
| No login or club role with authority is granted here                                      | `locked`                      | Task 08 §6; Mission 1 owns the seat                                                                                       | Settled       |
| Whether the three duplicate-check implementations are consolidated                        | `delegated to Mission Lead`   | Recorded as deliberate duplication at inventory freeze; no product meaning either way                                     | Delegated     |
| Candidate ordering and how many are shown                                                 | `delegated to Mission Lead`   | The club holds hundreds of people, not millions                                                                           | Delegated     |

## Brian approval

- Exact words:
- Date:

## Amendment W1-A3 raised 2026-08-27 — nothing opens this surface

`W1-01`'s People list carries no **Add a person** control, so
`/operate/people/new` is reachable from nowhere. The same shape of gap as the
missing-data queue's, found the same way: asserted in a specification, never
drawn on a screen.

Proposed: an **Add a person** button in the People list header, where the roster
already puts **Add player**. It amends approved `W1` and is recorded rather than
slipped into a mockup already approved.
