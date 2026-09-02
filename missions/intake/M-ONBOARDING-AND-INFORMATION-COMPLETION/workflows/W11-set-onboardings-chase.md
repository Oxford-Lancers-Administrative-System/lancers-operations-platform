# W11 — Set onboarding's chase

- Purpose/intended outcome: The onboarding checklist is one packet. This
  workflow says **how many times the club chases somebody about it, how often,
  and how long before the chase gives up** — and nothing else.
- Primary actor: A four-role operator.
- Trigger: setting the club's policy, usually once a season.
- Entry point / route: **`/operate/admin/messaging`**, the club's messaging
  schedule, where onboarding gets its own entry in the same grammar every
  other row on that page already uses.
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

`OD7-cadence-is-the-config`, in the grammar the messaging page already uses — a
lead time, a count and a cadence:

| Setting                 | What it means                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **First chase after**   | Hours from joining. Long enough that the welcome carrying the link lands first       |
| **Ask this many times** | The count. Spent only when a message actually arrives                               |
| **Every**               | The gap between one chase and the next, in days                                     |

**There is no "give up after" value**, deliberately. Brian, 2026-09-02: *"'Give
up after' is not a good number."* It is count × interval, and setting it
separately invites the two to disagree. The chase is over when the count runs
out.

**The count is spent on delivery** (`T11-cap-delivered`). A message that failed
consumes nothing and routes to the failure path instead — which is what makes
"the chase is exhausted" a fact rather than a guess, and why LAN-93 is a
dependency rather than an option.

**There are no quiet hours.** Brian, 2026-09-02. `T11-suppression` names them
among its rules; that half is out, and the shipped page already says as much in
its own standing note. The rest stands: an arriving submission clears pending
follow-ups, and a partial submission resets the timer but never the count.

**Nothing on this page escalates.** The previous draft carried a "tell the
President" field. That was borrowed from the event schedule's own
`escalation_hours` — *"hours after the RSVP deadline before the President is
told"* — which is the **event RSVP escalation** and does not belong here. When
the count runs out the chase is simply **exhausted**; what happens next is `W9`'s.

## The table this has to go in

`messaging_schedules` is keyed by **`event_type`** — one row each for practice,
strength and conditioning, chalk, game, social. Onboarding's chase is not a
property of a practice or a game: it has a delay from joining, a count and an
interval, and none of those varies by event type.

`OD7-own-cadence` settles the **surface** — onboarding gets its own entry on the
messaging page, in the same grammar every other row uses. It does not settle the
**shape** underneath, which is the open decision below.

### Verified against `main`, 2026-09-02

The shape of this depends on what is actually built, so it was checked rather
than assumed:

- **No onboarding cadence exists anywhere in `src/`.** Nothing reads, writes or
  renders one.
- The messaging page renders **one row per `event_type`** and nothing else.
- `escalation_hours` and its "President is told" label are the **event RSVP
  escalation**, not an onboarding one.


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
| `W11-01` | Onboarding's chase: the delay from joining, the count and the interval, in the page's own grammar |

Shot on `/operate/admin/messaging`, a real implemented route, both sides,
measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                             | Classification                  | Governing evidence or recommended default                                                                                 | Status   |
| ---------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| The checklist is the approved inventory, and nobody configures it    | locked                          | `OD7-checklist-is-fixed`, Brian 2026-09-02; supersedes `R1` and `R2-V2`                                                    | settled  |
| There are no per-item owners; only the four-role group resolves      | locked                          | `OD7-four-role-only`, Brian 2026-09-02; supersedes `R2`                                                                   | settled  |
| What is configured is how many times, how often, and when it gives up | locked                          | `OD7-cadence-is-the-config`, Brian 2026-09-02                                                                             | settled  |
| Nothing on this page escalates; the chase simply exhausts            | locked                          | Owner direction, 2026-09-02. The President field on this page is the event RSVP's escalation, not onboarding's             | settled  |
| There is no "give up after" value; it is the count times the interval | locked                          | Owner direction, 2026-09-02: "'Give up after' is not a good number"                                                       | settled  |
| A first-chase delay in hours, measured from joining                   | locked                          | Owner direction, 2026-09-02                                                                                               | settled  |
| The count is spent on delivery, never on a failure                   | locked                          | `T11-cap-delivered`; LAN-93 is a dependency                                                                               | settled  |
| **There are no quiet hours**                                         | locked                          | Brian, 2026-09-02. Supersedes that half of `T11-suppression`; the rest of it stands                                       | settled  |
| An arriving submission clears pending follow-ups                     | locked                          | `T11-suppression`                                                                                                         | settled  |
| A partial submission resets the timer but never the cap              | locked                          | `T11-suppression`                                                                                                         | settled  |
| The full checklist regenerates for everyone every season             | locked                          | `R1b`                                                                                                                     | settled  |
| No mid-season expiry; a lapse is a manual reopen                     | locked                          | `R2-E`                                                                                                                    | settled  |
| An empty configuration never reads as "everybody is complete"        | locked                          | `T10-entry-guards`                                                                                                        | settled  |
| **Where the escalation office is configured, now it is not here**    | **proposed for owner approval** | `W9` is approved and says this surface configures it; it no longer does. **Recommended: it is not configuration at all** — the office is whoever currently holds it, read from the club's roles rather than typed into a box | **open** |
| **Where onboarding's chase lives in the schema**                     | **proposed for owner approval** | `messaging_schedules` is keyed by `event_type`, and onboarding's chase is not a property of a practice. **Recommended: a small table of its own** — one row of club policy, keyed by nothing | **open** |
| A cap of zero is legal                                               | delegated to Mission Lead       | It means "no automated chase"; the welcome is unaffected                                                                  | settled  |

## Brian approval

- Exact words:
- Date:
