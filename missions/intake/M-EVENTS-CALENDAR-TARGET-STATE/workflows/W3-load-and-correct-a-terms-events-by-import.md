# W3 — Load and correct a term's events by import

**Status: drafting. Brian's 2026-08-21 direction is recorded below; the open
questions at the end are with him and this file is not presented for approval
until they are answered.**

## What this workflow is for

A season's events get into the system in one go, and get corrected the same way,
without anybody hand-entering a term card and without the club having to keep
its schedule in our shape. The club keeps its calendar however it likes; a
CSV is the only thing this application accepts.

- **Primary actor:** the Secretary, or any operator with event management.
- **Trigger:** a new season opens with nothing in it, or the term card firms up
  and events need correcting.
- **User-visible result:** a season's worth of drafts on the calendar, or an
  existing set updated with the changes shown and confirmed first.
- **Controlling source:** Events & Calendar brief D32–D38, D48, D82; Brian's
  direction of 2026-08-21, quoted below.

## What Brian settled on 2026-08-21

Recorded verbatim in substance, because it replaces what the brief left open
(D38, Q1) and it changes what this workflow is:

- **No term-card parser, ever.** _"I do not want to have to read the term card
  because the term card is going to be different every season. We do not want to
  build a custom tool."_ The club's own spreadsheet shape is not an input
  format.
- **CSV import and export, and nothing else.** _"What we want to do is a CSV
  import and export process."_
- **No AI inside the system.** _"There's no AI running in the system."_
- **The messy conversion happens outside.** The club converts whatever it has
  into the CSV using its own tools; the application accepts only the finished
  file.
- **An empty season prompts for an import**, and offers two things: a
  **downloadable CSV template**, and a **copyable prompt** that explains the
  whole conversion process well enough for the club to paste into ChatGPT and
  convert its own calendar. _"The prompt should be there so it entirely explains
  to them the whole process for how to import it into the new format."_
- **When events already exist, the operator can export them** as CSV, edit that
  file, and import it back.
- **Durable identifiers tie a row to an event**, so a re-import is recognised as
  an update rather than a duplicate.
- **Import shows what it is about to do, and asks.** _"When the import happens,
  it goes and automatically sees if there was an update, and then it checks to
  see and confirm these are the changes you want to make."_
- **Import produces drafts.** _"Import these drafts."_
- **The confirmation is a column list** showing every row, what is changing on
  each, and which rows are new.

## Inherited from the approved brief

- Import is the primary way events enter the system in Release One (D32); one-off
  creation is for "onesie twosies" (D33).
- Mass update is done by re-import, presenting a confirmation naming the events
  whose details change (D34). A dedicated bulk-edit screen "doesn't make sense".
- Mass delete must exist (D35).
- An approved event must be returned to draft before that kind of change (D36).
- **Import does not carry the audience** (D48).
- Import rows that cannot be parsed are refused individually, with the rest
  proceeding, and never as a silent partial success (§4.10, §4.11).
- Imported drafts arrive carrying their type's template defaults (acceptance
  example A).

## Open questions — with Brian

1. Durable identifier semantics, row by row.
2. Whether an import may touch an approved event.
3. The exact column set.
4. What an export contains.
5. Whether an event absent from the file is left alone or removed.

## Brian approval

- Exact words:
- Date:
