# W10 — Activate a player

- Purpose/intended outcome: The committee decides somebody is properly part of
  the team. An operator says so, and they become active. **That is all it is.**
- Primary actor: A four-role operator.
- Trigger: a human decision, taken off-system. Nothing schedules it and nothing
  derives it.
- Entry point / route: **`/operate/roster/[membershipId]`**, the Season section's
  Status field, which ships and already works.
- Controlling source: `S37`; owned `R3`, `PR7-activation`,
  `OD7-activation-flips`; cited `R3-C`, `R3-G` (`W6`), `S23` (`W6`).
- User-visible result: the membership reads `active`, and the person is
  manageable as a full member of the squad.

## This workflow is almost entirely already built

The flip ships. `setMembershipStatus` exists, the Season section's Status field
is an editable select carrying all five statuses, and every flip is written to
`season_membership_status_events` append-only.

**And Mission 5 already considered the one thing this workflow might have added,
and withdrew it.** From `membership.ts`'s own header:

> "There is no transition table any more. `MEMBERSHIP_TRANSITIONS` and
> `transitionIsLegal` were removed on Brian's explicit decision… recorded
> verbatim as `Q-12`… 'Okay, then we just remove it. We can flip to whatever
> status we want to go in.' … Nothing asks a reason and nothing confirms first
> (**a warn-only confirmation on `onboarding → active` was proposed and then
> withdrawn in the same walkthrough**, journal event 132's correction)."

That is this exact transition, and it was settled against adding ceremony to it.

**So W10 adds nothing to the flip.** `OD7-activation-flips` — "activation just
flips them to active" — says the same thing from this mission's side, and `R3`
says an active player with an unfinished checklist is the **normal case**, not
an exception worth warning about.

## Where "outstanding shown as context" already comes from

The frozen inventory says activation happens "with whatever is still outstanding
shown as context". It already is: the **Onboarding section sits directly above
the Season section on the same page**, listing every item and its state, with the
required-outstanding alert beneath it.

The context is the page. Re-presenting it inside the status control would be the
withdrawn confirmation wearing a different hat.

## What this workflow actually contributes

Three things, none of them a control:

1. **A rule about what activation means**: it is a human declaration, and the
   only gate this mission has. Nothing derives it, nothing schedules it, and no
   checklist state enables or prevents it.
2. **A rule about what it does not mean**: activation does not complete, waive
   or close anything. Every outstanding item stays outstanding, stays chased by
   `W8`, and stays on the record.
3. **A signal, consumed not owned**: "who is ready to activate" is `W6`'s derived
   completeness (`S23`, `R3-C`), which is **display-only and never flips
   membership on its own**.

## Required actions

1. Open the player.
2. Read the Onboarding section, if you want to. Nothing requires it.
3. Set Status to Active.

## State transitions

| From         | To       | On                                   |
| ------------ | -------- | -------------------------------------- |
| `onboarding` | `active` | An operator says so                  |
| any          | any      | Also permitted — `Q-12` removed the transition table |

Every flip writes `season_membership_status_events`, which is what made removing
the transition table safe in the first place: "We can still get an audit history
to know what happened, right?"

## Handoffs

| To / from | What crosses                                                            |
| --------- | ------------------------------------------------------------------------- |
| `W6`      | The derived "ready to activate" signal, and the checklist shown as context |
| `W8`      | Nothing changes. An active player with outstanding items is still chased  |
| Mission 5 | The status field, the flip, and the audit trail — all shipped            |
| `W11`     | Which items exist at all                                                 |

## Dependencies and mission boundaries

| Seam                        | This mission's side                     | The other side                             | Blocking?             |
| --------------------------- | ----------------------------------------- | -------------------------------------------- | ----------------------- |
| Mission 5 · People & Roster | What activation means, and what it does not | The status field, the flip, the audit trail | Not blocking; shipped |

## Exceptions and recovery

- **Activating somebody with everything outstanding.** Permitted, and normal.
  `R3` is explicit that this is the ordinary case.
- **Activating somebody unmessageable, or under 18.** Permitted. Activation is
  about squad membership, not about contactability.
- **Un-activating.** Any status may become any other; the audit trail records it.
- **Activation while a fact is disputed.** Permitted. `W7` is unaffected.

## Safety, privacy, consent, and authority boundaries

- **Four-role only**, as the surrounding Season fields already are.
- **Activation grants no login, no role and no operator seat.** It is a squad
  fact, not an access change.
- Every flip is attributable and append-only.

## Acceptance evidence

| Screen   | What it proves                                                                    |
| -------- | ----------------------------------------------------------------------------------- |
| `W10-01` | The flip, on the shipped control, with the checklist above it as the only context  |
| `W10-02` | Active with an unfinished checklist — the normal case, and nothing about it flagged |

Shot on `/operate/roster/[membershipId]`, a real implemented route, both sides,
measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                                  | Classification            | Governing evidence or recommended default                                                     | Status  |
| --------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| Activation is a human declaration on the shipped status field             | locked                    | `OD7-activation-flips`, `PR7-activation`                                                      | settled |
| **No confirmation step is added**                                         | locked                    | `Q-12` proposed and withdrew exactly that on this exact transition; `R3` makes it the normal case | settled |
| Outstanding items are context, and the context is the page                | locked                    | The Onboarding section already sits directly above the Season section                         | settled |
| Activation completes, waives and closes nothing                           | locked                    | `R3`; the chase continues unchanged                                                           | settled |
| Nothing derives or schedules activation                                   | locked                    | `R3-C`: derived completeness is display-only and never flips membership                       | settled |
| Activation is the only gate this mission has, and it gates squad membership only | locked              | Boundary item 16; `R3-G` everywhere else                                                      | settled |
| Whether the roster board surfaces "ready to activate" prominently         | delegated to Mission Lead | The signal is `W6`'s and display-only; where it is shown is presentation                      | settled |

**No decision is open.** This workflow's one candidate — a confirmation on
activation — was already raised and withdrawn by Brian in Mission 5, and
re-opening it here would be re-litigating a recorded decision.

## Brian approval

- Exact words:
- Date:
