# W3 — Say yes to the club

- Purpose/intended outcome: a newly captured recruit hears from the club, agrees
  to be contacted on WhatsApp, joins the community group, and answers the standard
  recruit ask on the spot — so the club knows it can reach them and knows the one
  or two things it needs immediately.
- Primary actor: the recruit.
- Trigger: capture at any door — `W5`, `W6` or `W7`. Every door ends by firing
  this.
- Entry point: a WhatsApp message to the mobile captured at the door.
- Route/placement: the message itself, and the signed landing page it carries.
- Controlling source: Task 09 D3, which fires the welcome and the community-group
  invite at every door; Task 04 D-2 and D-3, which D3 extends; Brian's 2026-08-31
  direction that channel registration is handled here and is its own flow.
- User-visible result: the recruit is in the group, the club has recorded that it
  may message them, and `On WhatsApp` on their record stops reading `Not yet`.

## Why this is its own workflow

Brian, 2026-08-31: _"The initial WhatsApp registration, I think, needs to be
handled here… Even though it's rather small, it will define this for other steps
in this process. Recruits are the easiest place to handle this."_ It is the
smallest journey in the mission and the most load-bearing outside it: Missions 7
and 8 inherit its shape, and every door in this mission ends by firing it.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue:
  `/operate/events/[id]/delivery` at `main@e669331`, photographed as `W3-01` —
  the operator's existing view of what was sent to whom and what came back. The
  recruit-facing side has no analogue: no signed-link token exists in the seeded
  data and `person_access_tokens` is empty, so `W3-02` is **drawn on both sides**
  and labelled `New surface, nothing to compare`.
- Reused component, language, interaction, and permission patterns: Mission 4's
  transport, its template machinery and its five delivery states, used verbatim.
  Recruitment owns what is said and on what trigger; it builds no scheduler.
- Desktop and 375px evidence: `W3-01` photographed both sides; `W3-02` drawn at
  both widths.
- Reason for any departure: none. This workflow adds a ladder to machinery that
  exists.

## The ladder

Brian's own sequence, 2026-08-31: _"First notification goes out today to invite
them in. If they sign in, they get asked. If they accept, they get asked to fill
out some details immediately. They get a polite reminder or something like that.
There's a flow that asks for W-7."_

1. **The welcome**, on save at the door. It says who the club is, that they were
   just met, and carries the community-group link.
2. **They join the group.** Not observable through the Cloud API — the 2026-08-28
   research settled that group and community membership is not exposed at all — so
   this is recorded when the recruit tells us, or by an operator, and never
   watched for.
3. **The standard recruit ask**, immediately after acceptance. Short, answered in
   the message or on one tap. What it asks is open and is decided against the
   drawing.
4. **One polite reminder** if nothing comes back. Never an escalation, never a
   cadence — the never-harsh rule, whose whole point is that this reminder is
   allowed.
5. **The hand-off to `W4`**, which asks for the fuller detail on a form.

## Required actions

1. The club sends the welcome automatically on capture, from every door.
2. The recruit accepts, and the acceptance is recorded as opt-in evidence.
3. The recruit answers the standard ask.
4. One polite reminder fires if step 3 does not happen.
5. An operator can see, for any recruit, exactly where in this ladder they are.

## State transitions

`identified → engaged` on any recorded interaction — an answer, a group join told
to us, a tap. Nothing advances automatically on a computed value; a delivery
receipt is not an interaction.

## Handoffs

- From `W5`, `W6`, `W7` — every door fires this.
- To `W4` at the end of the ladder.
- To `W1` and `W2`, which display everything it records.
- To Mission 4 for transport; to Mission 8 for what the consent means.

## Dependencies and mission boundaries

- **Mission 4 / transport and scheduler:** this mission's side is the content, the
  trigger and the timing; Mission 4's side is dispatch, retry and delivery state.
  Independently walkable — the scheduler ships.
- **Mission 8 / consent:** this mission's side is recording per-door opt-in
  evidence and refusing to fire without it; Mission 8's side is the wording and
  the lawful basis. **Provisional but non-blocking:** the ladder is walkable with
  placeholder wording, and no real send happens before LAN-101 and LAN-86.
- **Mission 7 / onboarding:** inherits this shape for members. Independently
  walkable.

## Exceptions and recovery

- **Delivery fails.** Capture always stands. The operator sees the failure on the
  recruit's record and can resend.
- **Delivery is down at the moment of capture.** The recruit is captured and the
  welcome is queued; it is never lost and never blocks the door.
- **The number is wrong.** The read-back step at the door (`W5` D-4) is the
  mitigation. A wrong number surfaces as a delivery failure, not as a silent gap.
- **No opt-in evidence for the door.** The welcome does not fire. Task 09 §9.1 is
  explicit that operator manual add carries no natural opt-in, so `W6` must
  capture one.
- **The recruit says stop.** Recorded, all dispatch blocked, and the group removal
  follow-up is the Secretary's — Task 08 §2's rule, inherited.

## Safety, privacy, consent, and authority boundaries

- The welcome is itself the consent step and is the only message class permitted
  before approval is recorded — Task 08 §2, inherited, not re-decided here.
- No real send before LAN-101; no real recruit before LAN-86.
- The recruit sees nothing of the club's data — this is a message and a landing
  page, not a surface into the roster.

## Acceptance evidence

- `W3-01` `grounding: photograph`; `W3-02` `grounding: code-only`, drawn on both
  sides, because no signed-link token exists to photograph.
- `On WhatsApp · 2026-27` already exists on the person record at the baseline and
  reads `not recorded` for both seeded recruits. This workflow is what fills it,
  so channel presence needs no new storage.

## Core decisions

| Decision                                                       | Classification                | Governing evidence or recommended default                                                                                                    | Status  |
| -------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Channel registration is this mission's and is its own workflow | `locked`                      | Brian, 2026-08-31                                                                                                                            | Settled |
| The five-step ladder above                                     | `locked`                      | Brian's own sequence, 2026-08-31                                                                                                             | Settled |
| The group join is recorded, never watched for                  | `locked`                      | 2026-08-28 observability research                                                                                                            | Settled |
| One polite reminder, never an escalation                       | `locked`                      | The never-harsh rule, 2026-08-31                                                                                                             | Settled |
| What the standard recruit ask actually asks                    | `proposed for owner approval` | Open by Brian's word: "We need to figure out what those look like." Recommendation: one question — are you interested in coming to a session | Open    |
| The welcome fires on save, not on a schedule                   | `proposed for owner approval` | Task 09 D3 says on save; a delay would leave the recruit unaddressed at the stand                                                            | Open    |
| The reminder is a fixed single offset, configurable in `W10`   | `delegated to Mission Lead`   | The value is a cycle setting, not an intent                                                                                                  | Settled |

## Brian approval

- Exact words:
- Date:
