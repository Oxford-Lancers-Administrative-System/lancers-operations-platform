# M-ONBOARDING-AND-INFORMATION-COMPLETION v1

**Status:** `ready` — awaiting Brian's merge. No execution is authorized before that merge.

## Outcome

The club can take a squad from "they're in" to playing, without anybody chasing people by
hand. An operator imports last season's players, adds one by hand, or flips a recruit at
Monday. Either way the person gets one identical message — _"Welcome to the team, 2026–27"_ —
carrying one link. Behind that link is one questionnaire in five steps: their details, the
Code of Conduct, the photo release, BUCS Play, Hudl. From then on the club knows exactly what
is still outstanding for that person, asks them for it on a bounded schedule without anybody
typing a message, stops permanently when it has asked enough and puts the name in front of a
human instead. When the committee decides somebody is properly part of the team, a person
flips them to active.

The system's job throughout is to **show what is outstanding and make chasing it nearly
free**. It is a tracker, not a gatekeeper.

Mission 6 stops at the words "onboarding opens". This mission is what those words mean.

## Locked operating model

- **Three doors, one path after them.** Import, hand-add, or a flipped recruit. What happens
  next is identical: a membership at `onboarding`, the checklist generated in full, one
  welcome.
- **One link, one open ask, ever.** `person_access_tokens` already permits exactly one live
  durable credential per person per season, enforced by a partial unique index. Every
  follow-up and every nudge re-sends that same link, compiled to what is still outstanding.
  **There are no player logins, in any form.**
- **The form is the consent board.** The tick is its first field. Consent is season-scoped
  and re-asked every season; within a season a recruit-door grant carries. It is one-way on
  the player's side — an operator can switch it off at any point, on request.
- **Nothing gates.** No onboarding item blocks any action anywhere, for anybody. An active
  player with an unfinished checklist is the normal case. Activation is the only gate this
  mission has, and it gates squad membership alone.
- **Required means required — of the form, never of the player.** The player tier from
  `person-required.ts`: ten facts, plus an emergency contact in four fields. The form will not
  advance until they are filled; nothing about training, selection or travel changes, and
  whatever a step saved stays saved. **Declining a required fact is not offered anywhere.**
- **The checklist is fixed.** It is the approved item-and-ask inventory. Nobody configures
  which items exist, and no item has an owner other than the four-role group.
- **A player's answer never silently overwrites the club's.** It raises `disputed`, both
  values are kept, and a four-role operator decides.
- **The chase is three values**: how long after joining the first one goes, how many times it
  asks, how far apart. It counts only messages that arrived. When the count runs out it stops
  permanently and tells a human — carrying a count and a link, **never names**.

## What this mission found already built

Three times, the substrate was waiting and the specification says so rather than proposing a
duplicate:

- **`person_access_tokens`** already is "one open ask, ever" — a database index, not a
  convention.
- **`person-record.ts`** already derives who supplied each person fact from `audit_events`,
  which was Brian's own choice at the LAN-184 walkthrough. This mission adds no provenance
  columns.
- **The messaging schedule already has an Onboarding section**, whose heading renders over the
  words "Not built yet."

## What it obliges

- **A forward-only migration unwinding `onboarding_items_waiver_is_justified`**, which today
  refuses a reason-free waiver and so contradicts an approved decision.
- **`claimed` added to `onboarding_item_status`**, per-item history, and the sectioned
  activity log — none of which exists.
- **The player-facing collection surface**, which does not exist at all.

## Workflows

Eleven, all approved in Brian's own words and recorded per workflow in
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/acceptance/`.

| ID    | Workflow                              | Actor                 |
| ----- | ------------------------------------- | --------------------- |
| `W1`  | Bring last season's squad in          | Four-role operator    |
| `W2`  | Add one player by hand                | Operator              |
| `W3`  | A flipped recruit lands in onboarding | — (consequence only)  |
| `W4`  | Say yes and fill in your details      | **The player**        |
| `W5`  | Fix something the club has wrong      | **The player**        |
| `W6`  | One player's onboarding record        | Four-role operator    |
| `W7`  | Settle a disputed fact                | Four-role operator    |
| `W8`  | Work the queue and nudge              | Four-role operator    |
| `W9`  | Pick up a chase that ran out          | The configured office |
| `W10` | Activate a player                     | Four-role operator    |
| `W11` | Set onboarding's chase                | Four-role operator    |

The inventory was amended on 2026-09-02 from twelve workflows to eleven: the
checklist-configuration workflow had the wrong target and folded into the chase. That
amendment, and Brian's words for it, are recorded in `02-workflows.md`.

## Evidence

Thirty-one screens, every one photographed on both sides against the running application at a
measured 1280 and 375 — none is a drawing. The review pages are generated and live in the
intake ledger under `mockups/`; see `mockups/README.md` here for how to open them.

## Open gates

Three, all with Brian, all tracked as **LAN-213**: Clint's wording for the Code of Conduct,
the photo release and the consent line; whether the photo release needs a real signature; and
the BUCS Play and Hudl instruction copy this mission owes and nobody has written. **None
blocks building or walking. All three block sending anything to a real person.**
