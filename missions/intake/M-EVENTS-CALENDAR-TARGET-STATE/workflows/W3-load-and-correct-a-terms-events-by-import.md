# W3 — Load and correct a term's events by import

## What this workflow is for

A season's events get into the system in one go, and get corrected the same way,
without anybody hand-entering a term card and without the club having to keep
its own schedule in our shape. The club keeps its calendar however it likes. The
application accepts one thing: a CSV.

- **Primary actor:** the Secretary, or any operator holding event management.
- **Trigger:** a new season opens with nothing in it, or the term card firms up
  and events need correcting.
- **Entry point:** the Events area — an import prompt when the season is empty,
  and Import and Export actions once it is not.
- **User-visible result:** a season's worth of drafts on the calendar, or an
  existing set updated after the operator has seen exactly what will change.
- **Controlling source:** Events & Calendar brief D32–D38, D48, D82;
  Brian's direction of 2026-08-21, which closes D38 and Q1.

## The shape Brian settled on 2026-08-21

- **No term-card parser, ever.** _"I do not want to have to read the term card
  because the term card is going to be different every season. We do not want to
  build a custom tool."_
- **CSV import and export, and nothing else.**
- **No AI inside the system.** _"There's no AI running in the system."_
- **The messy conversion happens outside it.** The club converts whatever it has
  into the CSV with its own tools; the application accepts only the finished
  file.
- **An empty season prompts for an import**, offering a **downloadable CSV
  template** and a **copyable prompt** that explains the conversion completely
  enough to paste into a general-purpose AI tool along with the club's own
  calendar.
- **Where events exist, the operator exports them**, edits that file, and
  imports it back.
- **Durable identifiers tie a row to an event.** _"When we put an event in the
  system, it gets a unique ID … it's data the operator needs to know, but it's
  never going to interact with it."_
- **Import states what it will do and asks first**, as a column list.
- **Import produces drafts.**

## Identity, and what each row means

| The row's `id`                  | What happens                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| Matches an event in this season | **Update** that event                                         |
| Blank                           | **Create** a new draft                                        |
| Matches nothing                 | **Refuse that row**, name it, and let every other row proceed |

The identifier is issued by the system when an event is created and is stable
for that event's life. An operator never authors one; they either keep the value
the export gave them, or clear the cell to mean "this is new".

## Upsert only

**Nothing is ever deleted by an import.** Brian, 2026-08-21: _"Events are upsert
only … If we want to delete, we have to go through the system to delete events."_

An event that exists in the season but is absent from the file is left exactly
as it was. This is the rule that makes it safe to export one term, edit it, and
import it back without taking the rest of the season with it — and it means no
CSV, however wrong, can destroy anything.

## Only drafts may be bulk-updated

**An import may not change an approved event.** Brian, 2026-08-21: _"An import
should not be able to change an approved event. That should be blocked out, and
if they want to change that, they should edit that event one at a time. You
should only be bulk updating draft events."_

This agrees with D36 — an approved event is changed by returning it to draft —
and it keeps the blast radius of a bad file to things nobody has been told about
yet. Amending an approved event is `W5`, one at a time, with its notify choice.

The refusal is narrow on purpose: **an unchanged row is a no-op, whatever the
event's status.** A straight export-and-reimport with no edits therefore does
nothing at all, rather than producing a screen of refusals. Only a row that
actually changes a non-draft event is refused.

## The file

One CSV. The columns are the event record and nothing else, because everything
else about an event is either derived, defaulted, or handled one event at a
time.

| Column               | Notes                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| `id`                 | Blank for a new event. Never authored by hand                                          |
| `name`               | Carries the opponent where there is one — there is no opponent field (D14)             |
| `type`               | One of the seven: Practice · S&C · Chalk · Game · Social · Recruitment · Meeting (D12) |
| `date`               | `YYYY-MM-DD`                                                                           |
| `start`              | `HH:MM`, five-minute increments (D78)                                                  |
| `end`                | `HH:MM`                                                                                |
| `online`             | `yes` or `no` (D20)                                                                    |
| `venue`              | An address when in person, the destination when online (D20, D21)                      |
| `description`        | Free text; absorbs anything without a field of its own (D18)                           |
| `required_equipment` | Its own field, not part of the description (D17)                                       |
| `mandatory`          | `yes` or `no` (D22)                                                                    |

**Deliberately not columns.** Audience — import does not carry it (D48) and it
is confirmed one event at a time at approval. Status — an import makes drafts
and may not change an approved event, so there is nothing for the operator to
set. Term and week — derived from the date (D9, D85), never entered. Questions
and RSVP timing — they arrive from the type's template (D42) and are edited per
event. Anything Mission 4 owns.

**Times are Europe/London** (D86). The file carries no zone, because a club
calendar in a club's own timezone that starts carrying offsets is a file people
get wrong.

## The export

Every event in the season, in the import's columns, plus two read-only ones:
`status`, so the operator can see what they are editing, and `term_week`, so
they can orient themselves against the term card they are working from. Both are
ignored on the way back in.

**Cancelled events are included.** Leaving them out would make a cancelled event
invisible in the file and look like something to re-add.

The export is the import template, populated. There is no second format and no
separate template to keep in step with it — on an empty season the same file
downloads with its header row and no data.

## The copyable prompt

A static, versioned block of text with a Copy button, next to the template
download. It contains the column specification, the seven permitted type values,
the date and time formats, the rule that `id` is left blank for a new event, a
short worked example, and an instruction to return only CSV.

Its purpose is that the club can hand its own term card — in whatever shape it
arrives — to a general-purpose AI tool outside this system and get back a file
this importer accepts.

**It is tested.** The prompt's own worked example must import cleanly, asserted
by test. A prompt that produces a file the importer rejects is worse than no
prompt, because it fails in someone else's tool where nobody can see it.

## What the operator sees before anything is written

A column list, one row per line in the file, and nothing is applied until they
confirm:

| Outcome       | Meaning                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **New**       | No `id`. A draft will be created                                                                                                    |
| **Updated**   | Matched an existing draft, and these named fields change — old value and new value, both shown                                      |
| **Unchanged** | Matched, nothing differs. No-op                                                                                                     |
| **Refused**   | The row cannot be applied, with the reason: unknown `id`, would change an approved event, unparseable value, missing required field |

Totals accompany it — how many new, updated, unchanged and refused — so the
operator confirms a number they can sanity-check rather than a wall of rows.

## State transitions

- `(nothing) → draft` for every created row.
- `draft → draft` for every updated row; the event's identity and its collected
  history survive.
- Nothing else. No approval, no cancellation, no deletion, no notification.
  Approval is `W4`; nothing is sent by an import.

## Exceptions and recovery

| Situation                                            | Behaviour                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A row cannot be parsed                               | Refused individually, named, with the rest proceeding — never a silent partial success (§4.10, §4.11) |
| The file is not a CSV, or has no recognisable header | Refused whole, before any row is read                                                                 |
| A row's `id` matches nothing                         | Refused, named                                                                                        |
| A row would change an approved or cancelled event    | Refused, named, with the instruction to amend that event on its own                                   |
| A row matches and differs in nothing                 | Unchanged; no write, no audit noise                                                                   |
| The same `id` appears twice in one file              | Refused, both named — the operator's file is ambiguous and the system will not pick                   |
| The operator abandons the confirmation               | Nothing is written. The import is not a transaction that half-happened                                |
| The import is applied                                | Applied as one transaction, so a failure part-way leaves the season as it was                         |

## Safety, privacy, consent, and authority boundaries

- **An import can create and update drafts. It can never delete, approve,
  cancel, or send.**
- **No person is in the file.** No audience, no contact detail, no response. A
  CSV of events is not roster data and never becomes a route to it.
- **Uploaded files are the operator's own**, held only long enough to produce
  the confirmation, and not retained as a record.
- **Event management capability is required**, enforced in the service layer.

## Repository reconciliation

There is no import, no export and no CSV handling anywhere on `main` at
`2072ecd`, so the import and confirmation surfaces are new. **The Events page is
not.** It exists, it is what `W1` re-specified, and this workflow changes exactly
one control on it — `Create event` becomes a menu. An earlier draft of this
mockup invented an Events page and marked it a new surface; Brian rejected it as
ungrounded on 2026-08-21.

`events.season_id` is already non-null
and `events.id` is already a stable identifier, so the durable-ID rule needs no
schema change.

## Conflict with an approved decision — raised, not resolved

**D35 says "mass delete must exist"** — delete a batch, re-import once details
firm up. Brian, 2026-08-21: _"If we want to bulk delete, that should be a
different process, but I'm not even sure if we're going to support that … That's
something that needs to be taken into consideration for another workflow."_

Those do not agree, and this file does not reconcile them. What is settled is
that **bulk delete is not part of `W3`** — no deletion reaches the system
through a CSV. Whether it exists at all elsewhere in the mission is an open
decision, carried to `W4`, which already owns deleting a draft under
inventory amendment 1. Recorded here so that the brief's D35 is not quietly
dropped by an agent that only read this workflow.

## Acceptance evidence

- A CSV exported from a season and imported back unchanged produces zero writes
  and reports every row as unchanged.
- A row with a blank `id` creates a draft; the same file imported twice does not
  create it twice, because the first import returned an identifier.
- A row whose `id` matches nothing is refused and named, and every other row in
  the file still applies.
- A row that would change an approved or a cancelled event is refused and named.
- An event present in the season and absent from the file is untouched.
- An unparseable row is refused individually; the file is not rejected whole.
- The confirmation names, for every updated row, each changed field with its old
  and new value, and nothing is written until it is confirmed.
- Abandoning the confirmation writes nothing.
- Applying writes as one transaction.
- The copyable prompt's own worked example imports cleanly.
- An imported draft carries its type's template defaults, including default
  questions and default audience (D40–D42, D47).
- No import creates an invitation, an RSVP, an attendance record or a
  notification.

## Core decisions

| Decision                                                                                                                                                                    | Classification                | Governing evidence or recommended default                                                                                                                                                                                                                                                                                        | Status          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| CSV import and export only; no term-card parser and no bespoke format reader                                                                                                | `locked`                      | Brian, 2026-08-21                                                                                                                                                                                                                                                                                                                | Settled         |
| No AI inside the system; conversion happens outside it                                                                                                                      | `locked`                      | Brian, 2026-08-21                                                                                                                                                                                                                                                                                                                | Settled         |
| An empty season offers a template download and a copyable conversion prompt                                                                                                 | `locked`                      | Brian, 2026-08-21                                                                                                                                                                                                                                                                                                                | Settled         |
| `id` present updates, `id` blank creates, `id` unmatched refuses                                                                                                            | `locked`                      | Brian, 2026-08-21: "That works just fine."                                                                                                                                                                                                                                                                                       | Settled         |
| Identifiers are system-issued and never authored by an operator                                                                                                             | `locked`                      | Brian, 2026-08-21                                                                                                                                                                                                                                                                                                                | Settled         |
| **Upsert only.** An import never deletes, and an absent event is untouched                                                                                                  | `locked`                      | Brian, 2026-08-21: "Events are upsert only."                                                                                                                                                                                                                                                                                     | Settled         |
| An import may not change an approved event; only drafts are bulk-updated                                                                                                    | `locked`                      | Brian, 2026-08-21; agrees with D36                                                                                                                                                                                                                                                                                               | Settled         |
| An unchanged row is a no-op whatever the status, so a clean round trip does nothing                                                                                         | `locked`                      | Follows from the two rules above; the alternative is a screen of refusals for an edit nobody made                                                                                                                                                                                                                                | Settled         |
| The column set is the event record only — no audience, status, term, week, questions or RSVP timing                                                                         | `locked`                      | Decided here on Brian's instruction that this is not his call; D48 for audience, D42 for questions, derivation for term and week                                                                                                                                                                                                 | Settled         |
| The export is the populated import template plus read-only `status` and `term_week`, and includes cancelled events                                                          | `locked`                      | Decided here on the same instruction                                                                                                                                                                                                                                                                                             | Settled         |
| Import is applied as one transaction after an explicit confirmation                                                                                                         | `locked`                      | D34's "confirmation naming the events whose details are changing"                                                                                                                                                                                                                                                                | Settled         |
| The copyable prompt's worked example is asserted to import cleanly                                                                                                          | `locked`                      | Decided here; the prompt fails invisibly otherwise                                                                                                                                                                                                                                                                               | Settled         |
| Whether bulk delete exists anywhere in this mission                                                                                                                         | **conflict, carried to `W4`** | D35 requires it; Brian on 2026-08-21 doubts it. Not part of `W3` either way                                                                                                                                                                                                                                                      | **Open — `W4`** |
| Exact CSV dialect, encoding, delimiter and size limits                                                                                                                      | `delegated to Mission Lead`   | Ordinary engineering                                                                                                                                                                                                                                                                                                             | Delegated       |
| **Create event** becomes a menu of exactly two — **Add a single event** and **Bulk import**. Export is not in the menu                                                      | `locked`                      | Brian, 2026-08-21: "Create Event should be Add Single Event, and then Bulk Import. It should be only two options. You should not export the season. That doesn't make sense to be in the proposed column." Importing is a way of creating events; exporting is not, so it lives where the file it produces lives                 | Settled         |
| The **bulk import screen owns the export**. Its download button is _Download the template_ on an empty season and _Download the current season's events_ once there are any | `locked`                      | Brian, 2026-08-21: "If you Mass Export the season … that detail should be in that screen" and "if there are no events, it should be Download the template. If there are events, it should be Download the current season events." One button whose label follows the state, rather than two buttons one of which is always wrong | Settled         |
| The bulk import screen shows a **count**, not a list — drafts an import can change, approved it cannot, cancelled                                                           | `locked`                      | Decided 2026-08-21 on Brian's invitation to propose. A full list duplicates the Events page one click away; a count states the one thing that would otherwise surprise an operator halfway through, which is how much of the season an import is actually allowed to touch                                                       | Settled         |
| A changed value is shown by **highlighting the cell itself**, with the old value beneath it, and every importable field is a column                                         | `locked`                      | Brian, 2026-08-21: "you should highlight the cell itself to show what changed … Row doesn't make sense … get rid of it." The right-hand summary stays because it is derived from the comparison rather than written                                                                                                              | Settled         |
| How long an uploaded file is held before the confirmation is abandoned                                                                                                      | `delegated to Mission Lead`   | Not retained as a record                                                                                                                                                                                                                                                                                                         | Delegated       |

## Brian approval

- Exact words:
- Date:
