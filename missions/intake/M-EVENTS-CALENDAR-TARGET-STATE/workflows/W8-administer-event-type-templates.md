# W8 — Administer event-type templates

## What this workflow is for

Set once what a Practice is, and every practice for the rest of the season
arrives already right — its audience chosen, its questions attached, its
equipment listed. The club stops re-deciding the same seven things every
Wednesday.

- **Primary actor:** an operator with event management. This is administration,
  not week-to-week operation.
- **Trigger:** the club changes how a whole type of event works — practices now
  need a gumshield question, socials should stop inviting coaches by default.
- **Entry point:** an admin surface behind the Events area (D40).
- **User-visible result:** every future draft of that type arrives with the
  right defaults.
- **Controlling source:** Events & Calendar brief D40–D42, D47; and D75, D77 for
  the per-type chase thresholds.

## One template per type, and there are seven

Practice · S&C · Chalk · Game · Social · Recruitment · Meeting (D12). Templates
are not created or deleted — there are exactly seven, because there are exactly
seven types, and each has exactly one template.

## What a template carries

Every field is **optional**. A template may leave anything undecided, and a
field left undecided simply arrives empty on a new event. Brian, 2026-08-21:
_"the template does not mean that everything needs to be changed … You can have
some details not decided."_

| Default                                        | Why it belongs to a type                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Audience**                                   | A practice invites all active players; a meeting invites the committee (D47)                                        |
| **Questions**                                  | Chosen when the template is set up, arriving with any event created from it and removable per event (D42)           |
| **Where — in person or online, and the venue** | Chalk is on Teams. Practices are at Iffley Road, week after week                                                    |
| **Default length**                             | Not a start time — a **duration**. 90 minutes, two hours. Entering a start on the event fills the end from it (D78) |
| **Required equipment**                         | Practices need a gumshield; meetings need nothing                                                                   |
| **Description**                                | A starting point for the operator to keep or replace                                                                |
| **Mandatory or optional**                      | Whether attendance is expected                                                                                      |
| **Chase threshold**                            | See below                                                                                                           |

**There is no default name and no default date or time.** Brian, 2026-08-21:
_"the name is always going to be unique … Usual time doesn't make any sense to
me. That is not a field you would have."_ A type recurs; a particular Wednesday
does not. What a type can usefully say about time is **how long it runs**, and
that is what the template holds.

## What a template deliberately does not carry

**RSVP timing.** An earlier draft of this workflow put the per-type chase
threshold — 2 days, 7 days, 5 days — on the template. **That was wrong and it is
removed.** Brian, 2026-08-21: _"That should be answered by 4 … Did you just
include something from mission 4 in mission 2?"_

He was right. D75 is recorded in the Events brief, but the same brief hands it
away: §7's downstream notifications tell **Task 03** that "the deadline is a
chase threshold only and never blocks", and §8 excludes _reminder scheduling_
and _per-event deadline overrides_ from this workflow entirely. Task 03 is RSVP,
reminders and escalation — Scope 2, Mission 4.

So:

- **Mission 2 owns the event's date.** That is the fact everything else is
  measured from.
- **Mission 4 owns the chase** — the threshold, its per-type configuration, when
  reminders go, and what escalation consists of (R6).
- When an event is rescheduled, `W5` changes the date and says so; Mission 4
  recomputes anything derived from it (OD-1/Q6).

Mission 4 will need a configuration surface for those values, and it may well
sit beside this one. Where it goes is Mission 4's decision, not this packet's.

## The rule that makes templates safe

**Template values flow into a draft field by field, and only into fields nobody
has touched. Approval freezes everything** (D41, refined by Brian on
2026-08-21).

> _"If I create an event and write a custom description, and then I update the
> template, it would not update the description. But if I didn't change the kit
> — it's just the default and it's the same — then it updates that."_

So each field on a draft is in one of two states:

| The field is                                    | A template change                |
| ----------------------------------------------- | -------------------------------- |
| Untouched — still whatever the template gave it | **Updates it**                   |
| Edited by an operator                           | **Leaves it alone, permanently** |

And regardless of either:

- **No approved event ever changes.** People have been told what it is.
- **No past event ever changes.**

### Why the refinement matters

D41 says template values keep flowing into a draft until approval. Taken
literally and applied to the whole record, editing the Practice template in
March would overwrite a description somebody wrote by hand on next Wednesday's
session. That is the same class of failure as an amendment discarding people's
answers: the system quietly destroying work somebody did deliberately.

Per-field inheritance keeps what D41 was for — a template correction reaching
the drafts that still want it — without the destruction. It is recorded as a
proposed clarification to D41 in `notion-corrections.md`.

### The consequence for the confirmation

Because inheritance is per field, the operator is told not only which drafts
take a change but **which will not, and why** — "3 drafts will take this; 1 will
not, because its description was edited."

## Editing a template

1. Open the type.
2. Change what is wrong.
3. **See what it will touch** — how many drafts, named — before saving.
4. Save. Every one of those drafts takes the change; nothing else moves.

An operator who has never used this should be able to tell, from the screen,
that editing a template is safe. That is the screen's whole job.

## What this workflow does not do

- **It does not create or delete types.** Seven types is D12, and adding one is
  a change to the approved domain model, not an administrative act.
- **It does not touch approved events.** Ever.
- **It does not schedule anything, and holds no timing values at all.**
- **It is not the reminder-configuration UI.** That is named in the Release One
  exclusions as expected post-release (LAN-106).

## State transitions

- The template changes.
- Every **unapproved draft** of that type is updated in the same transaction.
- Nothing else in the system moves.

## Handoffs

- **→ `W4`** — a new draft arrives carrying these defaults, and its audience and
  questions are the ones set here.
- **→ `W3`** — an imported draft arrives carrying them too.
- **→ Mission 4** — the chase threshold, as configuration.

## Exceptions and recovery

| Situation                                       | Behaviour                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| A template change would touch drafts            | The count and the names are shown before saving                   |
| A template change would touch nothing           | Said plainly, so the operator is not left wondering what happened |
| An approved event exists of that type           | Untouched, and said so on the screen                              |
| A default question is removed from the template | Existing drafts lose it; approved events keep it                  |
| Somebody wants an eighth type                   | Refused. That is a domain-model change and Brian's decision       |
| A chase threshold is set to something absurd    | Ordinary validation; the Mission Lead's to bound                  |

## Safety, privacy, consent, and authority boundaries

- **The blast radius is stated before the act**, every time. This is the only
  surface in the mission where one edit changes many events.
- **No person appears anywhere.** A template names groups, never people —
  "all active players", resolved to individuals only when an event is approved.
- **Nothing here sends anything.**
- **Event management capability required**, enforced in the service layer.

## Repository reconciliation

**Nothing exists.** There is no template, no per-type default and no admin
surface anywhere on `main` at `2072ecd`. Every default an event needs is
currently typed in by hand, every time.

Two adjacent facts:

- `response-deadline.ts` holds the per-type chase thresholds **in code**, keyed
  to the old ten-type enum. The enum narrows to seven in this mission's
  migration, so those constants have to be remapped — but **making them
  configurable is Mission 4's work**, not this workflow's. This mission must
  leave them working, not own them.
- The audience builder currently starts empty, which D47 reverses — that is
  `W4`'s change, and this workflow supplies the default it reverses to.

## Acceptance evidence

- Exactly seven templates exist, one per type, and none can be created or
  deleted.
- A new event of a type arrives carrying that type's audience, questions,
  equipment, description, mandatory flag, location mode and default length, and
  no name, date or start time.
- An imported draft arrives carrying them too.
- Editing a template updates, in one transaction, exactly those fields on
  unapproved drafts that nobody has edited — and leaves every operator-edited
  field untouched.
- The confirmation names the drafts that will take the change **and the drafts
  that will not, with the reason.**
- A template field left undecided arrives empty on a new event and overwrites
  nothing.
- Editing a template changes no approved event and no past event — asserted by
  test, not by inspection.
- Removing a default question removes it from unapproved drafts and leaves
  approved events untouched.
- No template carries an RSVP deadline, a chase threshold or any send timing.
- No template holds a person, a contact detail or a resolved audience list.

## Core decisions

| Decision                                                                                             | Classification              | Governing evidence                                                            | Status    |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- | --------- |
| One template per type; seven types; none created or deleted                                          | `locked`                    | D12, D40                                                                      | Settled   |
| Templates supply per-type defaults behind an admin surface                                           | `locked`                    | D40                                                                           | Settled   |
| Templates carry default questions, which arrive with the event and may be removed per event          | `locked`                    | D42                                                                           | Settled   |
| Templates supply a default audience                                                                  | `locked`                    | D47                                                                           | Settled   |
| Template values flow into a draft until approval freezes them; approved and past events never change | `locked`                    | D41                                                                           | Settled   |
| The operator sees which drafts a change will touch, named, before saving                             | `locked`                    | Derived from D41: the rule is only trustworthy if its blast radius is visible | Settled   |
| Chase thresholds are configuration, surfaced and editable, defaulting to 2 / 7 / 5 days              | `locked`                    | D75, D77                                                                      | Settled   |
| Adding or removing an event type                                                                     | **out of scope**            | D12 fixes seven; changing that is a domain-model decision for Brian           | Excluded  |
| The reminder-configuration UI                                                                        | **out of scope**            | Release One exclusions, expected post-release at LAN-106                      | Excluded  |
| Where the admin surface sits, and whether templates are one page or seven                            | `delegated to Mission Lead` | D40 says "behind an admin page" and no more                                   | Delegated |
| Validation bounds on a chase threshold                                                               | `delegated to Mission Lead` | Ordinary engineering                                                          | Delegated |

## Brian approval

- **Exact words:** "All right, looks good." (2026-08-21)
- **Date:** 2026-08-21
- **What it approved:** this specification and the four-screen mockup, after two
  rounds — per-field inheritance replacing wholesale overwriting, a default
  length replacing a default start time, every field made optional, and the
  chase threshold removed as Mission 4's.
