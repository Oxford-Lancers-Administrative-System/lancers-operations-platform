# W5 — Capture a walk-up as a recruit

- Purpose/intended outcome: somebody turns up at an event and an operator or coach
  writes them down in seconds, at the touchline, without leaving attendance — and
  that person is a recruit from that moment.
- Primary actor: whoever is taking attendance — an operator, or a coach holding
  one of the ten fixed coaching roles.
- Trigger: a person nobody expected is standing there.
- Entry point: the attendance sheet for any event, of any type.
- Route/placement: `/operate/events/[id]/attendance`, unchanged.
- Controlling source: Task 04 D-1, D-2, D-4, D-5 and D-7; Task 09 D2 and
  amendment 4; Brian's 2026-08-28 decision that every walk-up is a recruit and
  that capture stays on every event type for anyone taking attendance.
- User-visible result: the person exists, they are on the recruit board, and `W3`
  has begun.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: the real thing.
  `/operate/events/[id]/attendance` at `main@e669331`, photographed as `W5-01`
  against the seeded Freshers' Fair event. This is the only recruitment door that
  exists today.
- Reused component, language, interaction, and permission patterns: the shipped
  attendance sheet, its one-touch states with immediate save and no Submit, its
  walk-up capture form, and the LAN-110 coach grant.
- Desktop and 375px evidence: `W5-01` through `W5-05`, both sides, measured —
  the sheet, the capture form opening, the duplicate check answering on it, the
  read-back step, and the row landing back on the sheet. The
  375px frame matters more here than anywhere else in the mission: this is the
  one workflow performed on a phone, at a touchline, in the cold.
- Reason for any departure from the implemented application: Brian, 2026-08-31:
  _"We need to go through that entire flow, and there's probably going to be some
  significant rework from how we did this before, just for clarity purposes."_
  Departure is expected and does not need justifying screen by screen. Three
  specific defects at the baseline justify it on their own:

  1. **No read-back step.** Task 04 D-4 requires the number be read back before
     save, because saving fires a message. Not implemented.
  2. **No interactive duplicate check.** `attendance.ts` mints a person with no
     check, wider than Task 09 §3's coach-only exception. Recorded as drift by
     Task 09 amendment 4; reconciled here.
  3. ~~**Nothing tells the operator this creates a recruit.**~~ **Struck
     2026-08-31 — this was wrong.** Building the screens against the running page
     showed the shipped form already says it, in an alert above the fields:
     _"They are added to recruitment as somebody to follow up, and recorded at
     this event. This does not put them on the roster or create a membership."_
     The claim was written from the code's shape rather than from the screen, and
     it should not have survived into a specification. What the form still does
     not say is that saving **sends that person a message**, which is the part an
     operator most needs to know before reading a number back.

**Vocabulary drift found at the same time, and settled 2026-08-31.** The shipped
surface calls this three things: the button says **Add walk-up**, the page
headline says **Add a walk-on**, and the chip on the row says **Walk-on · in
recruitment**. The approved briefs say **walk-up** throughout.

Brian chose **walk-up**. Three user-visible constants in
`src/app/operate/events/[id]/attendance/presentation.ts` are corrected by this
mission and nothing else moves:

| Constant           | Today                      | Becomes                    |
| ------------------ | -------------------------- | -------------------------- |
| `ADD_WALK_UP`      | `Add walk-up`              | unchanged                  |
| `WALK_UP_HEADLINE` | `Add a walk-on`            | `Add a walk-up`            |
| `WALK_UP_SUBMIT`   | `Add walk-on`              | `Add walk-up`              |
| `WALK_UP_CHIP`     | `Walk-on · in recruitment` | `Walk-up · in recruitment` |

This is a change to shipped copy, so it is the Mission Lead's to make under an
approved decision rather than intake's to make here.

## The flow, and only the flow

Brian, 2026-08-31, cutting this workflow back:

> "This flow should be identical to the way the roster works right now... There
> are basically needless extensions on this and narration, particularly on
> `W5-02`. It should just be the normal workflow: 1. If somebody gets added, they
> get added into the thing. 2. They get the WhatsApp approval. 3. They get the
> first questionnaire to ask a few more details about them. That's it."

Three screens, matching those three steps:

| Screen  | What it is                                                                    |
| ------- | ----------------------------------------------------------------------------- |
| `W5-01` | The shipped attendance sheet and its own `ADD WALK-UP` control.               |
| `W5-02` | The shipped walk-up form, filled in. Nothing added to it.                     |
| `W5-03` | Saved — she is in the sheet's **Walk-ups** section, and a short line says so. |

Steps 2 and 3 are **not screens of this workflow**. The WhatsApp exchange happens
inside WhatsApp, which this product does not render, and the questionnaire is
`W4`'s. `W10` fires both.

### What was cut

- **A proposed read-back step on `W5-02`** — an addition to a shipped form, and
  the thing Brian named directly.
- **A duplicate-check screen** — `W8` owns duplicates.
- **A "refused: no mobile" screen** — an edge case is not a step in a flow.
- **A relabelled control** — an earlier draft renamed `ADD WALK-UP` to
  `ADD A WALK-ON`. The flow is identical to what ships, so the control is too.

### The walk-ups section is shipped, and it is the confirmation

Brian: _"I should see the walk-ons, and they should have their own section that's
there."_ They do — `attendance-groups.tsx` renders a **Walk-ups** group, open by
default and drawn only when it holds somebody. Its own comment gives the reason
it opens: closing it would close _"the only confirmation that the walk-up was
recorded"_. The seeded event has none, so `W5-03` puts Marguerite in it by
cloning the sheet's own group and row markup.

Because that section says what happened, the shipped green line above it —
_"Walk-on recorded. They are in recruitment as somebody to follow up, and were
not put on the roster."_ — shrinks to **"Walk-up added"**. Brian: _"I don't like
the extra text. I think a smaller text box that says 'Walkup added' is perfectly
fine, as long as it disappears if multiple walkups get added."_ It is about the
last add rather than a running tally; the section below carries the record.

## Required actions

1. Add a walk-up from the attendance sheet without leaving it.
2. Enter first name, last name and mobile; email optional.
3. **Read the number back** — the screen presents it for verbal confirmation
   before save, because save sends a message.
4. **See a possible duplicate before saving**, and choose: this is them, or this
   is somebody new.
5. Save, and see that they are now a recruit.

## State transitions

Person minted if new. Prospect created at `identified`. Attendance recorded as
present. `W3` fires. All four are one action from the operator's point of view.

## Handoffs

- To `W3` on save — the welcome and the group invite.
- To `W8` when the duplicate cannot be resolved at the touchline.
- To `W1` and `W2`, where the recruit appears.
- To Mission 2's attendance machinery, which owns the sheet itself.

## Dependencies and mission boundaries

- **Mission 5 / dedup:** this mission's side is running the check at this door and
  showing it on a phone; Mission 5's side is the matching machinery, which ships.
  Independently walkable.
- **Mission 2 / attendance:** this mission's side is the walk-up capture path and
  what it creates; Mission 2's side is the sheet, occurrence and the four
  attendance states. Independently walkable.
- **Mission 1 / the coach grant:** unchanged. This mission mints no capability;
  the coach recording a walk-up is doing attendance, not recruitment, and never
  sees the recruit board.

## Exceptions and recovery

- **No mobile.** The person is not captured. Owner-accepted limitation, stated
  knowingly by Brian in Task 04 D-1: _"a walk-up we can't reach isn't in the
  pipeline."_ Do not soften it into an optional field without a new decision.
- **A rostered member mis-added as a walk-up.** The match check runs before any
  message sends, so a current member never receives a welcome.
- **A likely duplicate, no time to resolve.** Park it for `W8`; capture the
  attendance regardless. Attendance always stands.
- **Delivery down.** Capture stands; the welcome queues.
- **The coach path.** A coach captures and the message fires identically — a
  system action tied to the save, not a coach permission. No new authority.

## Safety, privacy, consent, and authority boundaries

- The read-back is the wrong-number mitigation and the opt-in moment; it is not
  optional, because the save sends a business message to a real phone.
- A walk-up captured by a coach exposes nothing else: no contact values, no RSVP
  reasons, no roster, no recruit board.
- Per-door opt-in evidence is recorded here. A walk-up's is the verbal read-back.

## Acceptance evidence

- `grounding: photograph`. Both sides from the running application at measured
  1280px and 375px, against the seeded Freshers' Fair event.

## Core decisions

| Decision                                                         | Classification                | Governing evidence or recommended default                                                             | Status  |
| ---------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| Every walk-up is a recruit                                       | `locked`                      | Brian, 2026-08-28                                                                                     | Settled |
| Capture stays on every event type, for anyone taking attendance  | `locked`                      | Brian, 2026-08-28                                                                                     | Settled |
| Name plus mobile required, email optional                        | `locked`                      | Task 04 D-1                                                                                           | Settled |
| The read-back step is built                                      | `locked`                      | Task 04 D-4; unimplemented at the baseline                                                            | Settled |
| An interactive duplicate check at this door                      | `proposed for owner approval` | Task 09 amendment 4 records the drift and sends it here. Recommendation: check and offer, never block | Open    |
| The form says plainly that this creates a recruit                | `proposed for owner approval` | Nothing on the shipped screen says so                                                                 | Open    |
| The flow is reworked for clarity rather than patched             | `locked`                      | Brian, 2026-08-31                                                                                     | Settled |
| The word is **walk-up**, and three shipped strings are corrected | `locked`                      | Brian, 2026-08-31. The briefs say walk-up throughout and it is the fewest strings to change           | Settled |

## Brian approval

- Exact words:
- Date:
