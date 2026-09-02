# W11 — Set onboarding's chase

- Purpose/intended outcome: The onboarding checklist is one packet. This
  workflow says **how many times the club chases somebody about it, how often,
  and how long before the chase gives up** — and nothing else.
- Primary actor: A four-role operator.
- Trigger: setting the club's policy, usually once a season.
- Entry point / route: **`/operate/admin/messaging`**, the club's messaging
  schedule, where onboarding gets its own entry beside the recruit ladder.
- Controlling source: `S26`, and `S14`, `S15`, `S19`, `S20` inherited from the
  workflow folded into this one; owned `M4`, `T11-cadence`, `T11-cap-delivered`,
  `T11-suppression`, `PR7-nudges-chase`, `OD7-own-cadence`,
  `OD7-checklist-is-fixed`, `OD7-cadence-is-the-config`, `R1a`, `R1b`, `R2-E`,
  `T10-A1`, `T10-entry-guards`, `PR7-checklist`.
- User-visible result: the chase runs to the club's policy rather than to a
  constant in the code.

## What the object is

Worth stating first, because the previous draft of this workflow got it wrong.

**The onboarding checklist is one packet.** It is the approved
`item-and-ask-inventory.md` — the twelve items and the fifteen asks, settled
once — and it goes out as one thing: *here is what you need to go and do.*

- **Nobody configures which items are on it.** `OD7-checklist-is-fixed`, Brian
  2026-09-02. `R1` and `R2-V2` are superseded.
- **Nobody is assigned an item.** Only the four-role group resolves anything.
  `R2` is superseded — *"If the kit operator needs to go off and do something
  with a kit, they can go and run that on their own."*
- **Verification behaviour still exists**, but as a property of each item in the
  approved inventory rather than a setting: BUCS Play is claimed then confirmed,
  the derived details item completes itself. Not a knob.

So the only thing left to configure is the chase — and that is this workflow.

## The three numbers

`OD7-cadence-is-the-config`:

| Setting            | What it means                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| **How many times** | The cap. How many chases the club will send before it stops for good  |
| **How often**      | The gap between them                                                  |
| **Before it gives up** | How long the whole chase runs before it exhausts and a human takes over |

Plus one more that has to live somewhere and belongs here: **the escalation
office**, initial value President, which `W9` depends on.

**The cap counts messages that arrived** (`T11-cap-delivered`). A message that
failed to deliver consumes nothing and routes to the failure path instead —
which is what makes "the chase is exhausted" a true statement, and why LAN-93 is
a dependency rather than an option.

**There are no quiet hours.** Brian, 2026-09-02. `T11-suppression` names them
among its rules; that half is out. The rest of `T11-suppression` stands: an
arriving submission clears pending follow-ups, and a partial submission resets
the timer but never the cap.

## The table this has to go in, and why that is a decision

`messaging_schedules` is keyed by **`event_type`** — one row each for practice,
strength and conditioning, chalk, game, social. Mission 6 added the recruit
ladder to it as **two columns**:

```
recruit_invitation_lead_days      null on all five rows
recruit_follow_up_cadence_hours   null on all five rows
```

Both are null on every row, because recruitment's cadence has nothing to do with
practices or games. **Onboarding fits that grain even less.** Its chase has a
cap, a gap, an exhaustion point and an escalation office, and none of them is
per-event-type.

`OD7-own-cadence` says onboarding gets its own cadence "beside the recruit
ladder on the messaging page". That settles the **surface**. It does not settle
the **shape**, and the shape is the open decision below.

## The checklist rules this workflow now carries

Folded in from the removed workflow, and unchanged by the fold:

- **The full checklist regenerates for everyone every season** (`R1b`) — "it's
  about the president, not the person".
- **No mid-season expiry** (`R2-E`). Items reset at the season boundary only; a
  lapse mid-season is a manual reopen, which is `W6`'s.
- **An empty configuration reads as "this season has no onboarding items
  configured"**, never as "everybody is complete" (`T10-entry-guards`).
- **An item added mid-season backfills as `pending` onto everybody**, not only
  onto later arrivals.
- **Formalwear is asked every season** (`T10-A1`), its returner carve-out
  removed as kit's already was.
- **The subscription invoiced/paid split is two items** (`R1a`), and
  constitutional membership derives from the paid one.

## Required actions

1. Open the messaging schedule.
2. Set how many times onboarding chases, how often, and how long before it gives
   up. Set the office the exhaustion goes to.
3. Save. The chase runs to that from the next message onwards.

## Handoffs

| To / from  | What crosses                                                      |
| ---------- | ------------------------------------------------------------------- |
| `W4`       | The follow-ups that carry the compiled ask                        |
| `W8`       | "Next automated contact", and the exhausted warning on the queue  |
| `W9`       | The cap that defines exhaustion, and the office it escalates to   |
| `W6`       | Every chase, onto the person's activity log                       |
| Mission 4  | Transport, the templates, the delivery states, the scheduler      |

## Dependencies and mission boundaries

| Seam                        | This mission's side                        | The other side                                    | Blocking?                          |
| --------------------------- | -------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| Mission 4 · Communications  | Onboarding's own cadence, cap and office   | The schedule table, the pipeline, delivery states | **Depends on LAN-93** for the cap   |
| Mission 6 · Recruitment     | Sitting beside the recruit ladder          | The recruit ladder itself                         | Not blocking; its columns ship      |
| Mission 11 · Season Lifecycle | Reading the current season               | Creating one                                      | Inherited precondition              |

## Exceptions and recovery

- **A cap of zero.** No automated chase at all; the welcome still goes, and
  every subsequent ask is a human nudge. Legal, and worth being able to set.
- **Changing the cap mid-season.** It governs from the next message; nobody's
  count is retrospectively reset, and nobody already exhausted is restarted —
  only a human restarts a chase (`W8`).
- **No office holder.** `W9`'s case: the escalation is retained and shown in the
  operator area.
- **An empty configuration.** The chase does not run. It never reads as "nobody
  needs chasing".

## Safety, privacy, consent, and authority boundaries

- **Four-role only.**
- Configuration carries no personal data.
- **Nothing here can send anything.** It sets policy; `W8` and the scheduler
  send.
- The refuse-without-basis check is unaffected: no cadence value permits a
  message to somebody with no recorded basis.

## Acceptance evidence

| Screen   | What it proves                                                                  |
| -------- | --------------------------------------------------------------------------------- |
| `W11-01` | Onboarding's chase: how many times, how often, before it gives up, and the office |
| `W11-02` | Where it sits — beside the recruit ladder, and the shape problem underneath it   |

Shot on `/operate/admin/messaging`, a real implemented route, both sides,
measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                             | Classification                  | Governing evidence or recommended default                                                                                 | Status   |
| ---------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| The checklist is the approved inventory, and nobody configures it    | locked                          | `OD7-checklist-is-fixed`, Brian 2026-09-02; supersedes `R1` and `R2-V2`                                                    | settled  |
| There are no per-item owners; only the four-role group resolves      | locked                          | `OD7-four-role-only`, Brian 2026-09-02; supersedes `R2`                                                                   | settled  |
| What is configured is how many times, how often, and when it gives up | locked                          | `OD7-cadence-is-the-config`, Brian 2026-09-02                                                                             | settled  |
| The escalation office is configured here                             | locked                          | `T11-escalation-target`; `W9` depends on it and nothing else configures it                                                | settled  |
| The cap counts messages that arrived                                 | locked                          | `T11-cap-delivered`; LAN-93 is a dependency                                                                               | settled  |
| **There are no quiet hours**                                         | locked                          | Brian, 2026-09-02. Supersedes that half of `T11-suppression`; the rest of it stands                                       | settled  |
| An arriving submission clears pending follow-ups                     | locked                          | `T11-suppression`                                                                                                         | settled  |
| A partial submission resets the timer but never the cap              | locked                          | `T11-suppression`                                                                                                         | settled  |
| The full checklist regenerates for everyone every season             | locked                          | `R1b`                                                                                                                     | settled  |
| No mid-season expiry; a lapse is a manual reopen                     | locked                          | `R2-E`                                                                                                                    | settled  |
| An empty configuration never reads as "everybody is complete"        | locked                          | `T10-entry-guards`                                                                                                        | settled  |
| **Where onboarding's chase actually lives in the schema**            | **proposed for owner approval** | `messaging_schedules` is keyed by `event_type`, and the recruit ladder is two columns on it that are null on all five rows. Onboarding fits that grain even less. **Recommended: a small table of its own, keyed by nothing** — one row of club policy — rather than four more null columns on an event table | **open** |
| A cap of zero is legal                                               | delegated to Mission Lead       | It means "no automated chase"; the welcome is unaffected                                                                  | settled  |

## Brian approval

- Exact words:
- Date:
