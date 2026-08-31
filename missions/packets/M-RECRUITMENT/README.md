# M-RECRUITMENT v1

**Status:** `approved` — owner-authorized packet awaiting Brian's merge. No execution is
authorized before merge.

## Outcome

The club can run a recruitment season out of the application instead of out of one person's
head and a WhatsApp group. An operator holding the core four authority can capture a recruit
at any of the four doors without creating a duplicate; read every recruit on one board as one
line; keep notes and see who wrote them; ask a recruit about themselves and about their
football background; schedule a recruitment event, invite recruits and players together, and
take attendance on the day; and — when leadership decides somebody is in — flip them onto the
roster with one audited action that creates the season membership and opens onboarding.

Mission 5 gives recruitment the person. Mission 7 takes the member. Everything between the
first contact and the flip is this mission's, including the administration of it.

## Locked operating model

- **Authority is the core four**: President, Vice President, Secretary, General Manager. No
  new capability is minted. The one carve-out is the coach at the touchline, who records a
  walk-up as _attendance_ and never sees the board.
- **One status, seven values**: `identified`, `engaged`, `committed`, `joined`, `declined`,
  `disengaged`, `void`. Not tiered, not split into on-board and off-board sets. Whether a
  recruit appears on the board is a display rule read off this one field.
- **Every walk-up is a recruit**, and walk-up capture stays on every event type for anyone
  taking attendance.
- **Never harsh**: no player-grade escalation rung, no collection cadence, and no message
  telling a recruit they are required to be somewhere. Polite reminders and operator
  follow-ups are expected, and making one easy and good to send is this mission's work.
- **Dedup before create at every door, never at the flip.** The three operator-facing doors
  hold three deliberate postures — the touchline checks nothing, the manual add runs the full
  check, the self-entry door asks one question.
- **Templates only.** Every message a recruit receives is a Meta-approved WhatsApp template.
  No composer, no free text, no two-way chat, anywhere, because
  `src/lib/delivery/config.ts` permits nothing else in production.
- **A recruit sees an event's public details and nothing else** — never attendance, never who
  else was invited or answered, never roster or member data.
- **A recruit is never asked why they are not coming.** The
  `rsvp_responses_no_requires_a_reason` constraint stands; the system supplies the reason.
- **Leaving the board is a status change and nothing more.** No archive, no delete. Erasure
  is Mission 8's, never recruitment's.
- **The flip is one audited action** and never produces an active member.

## The two ladders

The defect this mission exists to close, as well as the gap:

- `scheduleEventLadder` inserts a reminder job for every invitation filtered only by
  `event_id`, so a recruit invited today receives the **player escalation**.
- `countByCapacity` omits recruits from the approval summary, so an operator approves a
  recruitment event **without being told how many recruits it reaches**.

The fix is not suppression. The player ladder stops reaching recruits, and recruitment's own
ladder is built beside it — an invitation and at most one polite follow-up, then silence.
They are configured as two named groups in the body of the messaging schedule's Recruitment
event row, so that _one row per event type_ and _one save per row_ — both laws of that page —
survive. An approver sees the same split on the event's own messaging plan the moment before
they approve.

## Application surfaces

| Surface                             | What it is                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `/operate/recruitment`              | The recruit board. A top-level destination under Roster, not an Administration entry |
| `/operate/recruitment/[prospectId]` | One recruit's record                                                                 |
| `/operate/recruitment/new`          | Add a recruit by hand                                                                |
| `/operate/recruitment/review`       | The parked-capture queue                                                             |
| `/operate/recruitment/qr`           | The season's sign-up QR, minted once                                                 |
| `/operate/admin/messaging`          | The recruitment cycle and both event ladders                                         |
| `/operate/events/[id]/attendance`   | Walk-up capture, and recruits first on a recruitment event                           |
| `/a/[token]`                        | Both questionnaires, on the shared signed-link substrate                             |
| `/rsvp/[token]`                     | What a recruit lands on after answering in WhatsApp                                  |
| the club's own domain               | The public sign-up page a QR points at                                               |

## Frozen workflow inventory

Fourteen workflows, `W1`–`W14`, frozen 2026-08-31 and approved one at a time in Brian's own
words. `W3` and `W9` are dead numbers, kept as empty slots and never reused, so `W4`–`W14`
hold the numbers they were frozen with. `W15` was added and removed the same day and is dead
for the same reason.

`packet.json`'s `workflow_matrix` matches `missions/intake/M-RECRUITMENT/02-workflows.md`
exactly, in order, and the validator enforces it.

## Evidence

- 39 screens, every one a photograph of the running application on **both** sides, at a
  browser-measured 1280px and a browser-measured 375px. See `mockups/README.md`.
- One acceptance record per workflow at `missions/intake/M-RECRUITMENT/acceptance/`, each
  carrying Brian's exact approval words and date.
- `missions/intake/M-RECRUITMENT/decision-coverage.md` and `subject-coverage.md` are
  generated from the ledger and give every controlling decision and every subject area
  exactly one disposition.

## Gates that remain with Brian

1. **Four WhatsApp templates must clear Meta** before the recruitment cycle can run:
   `recruit_welcome`, `recruit_details_ask`, `recruit_details_reminder`,
   `recruit_interest_ask`, plus the recruit event follow-up. Only `event_invitation` exists
   in Meta today. Externally timed, and outside the club's control.
2. **LAN-86 and LAN-101** stay open: no real recruit data and no real sends.
3. **The club's own domain** must serve the sign-up page before a QR is printed for a real
   recruiting moment.
4. **This packet's merge.** Nothing executes before it.

## What is deliberately not decided here

`packet.json`'s `delegated_to_mission_lead` and `nonblocking_unknowns` carry these in full.
The load-bearing ones: the WhatsApp community door's mechanism is genuinely open, because the
platform very probably cannot observe group membership; there is no shipped control for
turning a cycle step off, and this mission records the gap rather than drawing one; and
Brian's own copy for the declined page is not written.
