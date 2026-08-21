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

| Default                   | Notes                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Audience**              | The groups a new event of this type starts with — a Practice invites all active players (D47)                                                                                              |
| **Questions**             | Chosen when the template is set up; they arrive with any event created from it and may be removed per event (D42)                                                                          |
| **Required equipment**    | Practices need a gumshield; meetings need nothing                                                                                                                                          |
| **Description**           | A starting point, not a rule                                                                                                                                                               |
| **Mandatory or optional** | Whether attendance is expected                                                                                                                                                             |
| **Online or in person**   | Chalk is on Teams; practices are not                                                                                                                                                       |
| **Start and end time**    | The usual slot for this type                                                                                                                                                               |
| **Chase threshold**       | Days before the event at which an unanswered invitation becomes worth pursuing — **2 days** for Practice, S&C, Chalk, Recruitment and Meeting; **7** for Game; **5** for Social (D75, D77) |

The chase threshold is **configuration, deliberately**. D75 requires it to be
documented as such because the owner expects the values to change after the
pilot. Storing them and never surfacing them would satisfy the letter and miss
the point.

## The rule that makes templates safe

**Template values keep flowing into a draft while it remains a draft. Approval
freezes it** (D41).

- Update the Practice template and **every unapproved practice draft updates
  with it.**
- **No approved event ever changes.** People have been told what it is.
- **No past event ever changes.**

That single rule is why a template can be edited mid-season without anybody
being surprised: the blast radius is exactly the set of events nobody has been
told about yet, and the operator is shown that set before saving.

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
- **It does not schedule anything.** The chase threshold is a value this
  workflow stores; the chasing is Mission 4's.
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
  to the old ten-type enum. D77 remaps Camp to Practice at 2 days and the enum
  narrows to seven; D75 requires the values to become configuration rather than
  constants.
- The audience builder currently starts empty, which D47 reverses — that is
  `W4`'s change, and this workflow supplies the default it reverses to.

## Acceptance evidence

- Exactly seven templates exist, one per type, and none can be created or
  deleted.
- A new event of a type arrives carrying that type's audience, questions,
  equipment, description, mandatory flag, location mode and times.
- An imported draft arrives carrying them too.
- Editing a template updates every unapproved draft of that type in one
  transaction, and the operator is shown the count and the names first.
- Editing a template changes no approved event and no past event — asserted by
  test, not by inspection.
- Removing a default question removes it from unapproved drafts and leaves
  approved events untouched.
- Chase thresholds are stored as configuration, editable, and default to 2 days
  for Practice, S&C, Chalk, Recruitment and Meeting; 7 for Game; 5 for Social.
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

- Exact words:
- Date:
