# LAN-155 — Load and correct a term's events by import

Status: workflow approved by Brian on 21 August 2026 — _"Other than that, I
think this looks good. This is approved."_ — after two rounds of correction.
Verify against the current live Linear issue before implementation.

> **Synthetic scenario data:** All displayed people, events and season figures
> are synthetic and do not correspond to real members.

Work package `WP-csv-import` of mission `M-EVENTS-CALENDAR-TARGET-STATE`,
workflow `W3`. Controlling sources: Events & Calendar brief D32–D38, D48, D82;
Brian's direction of 2026-08-21, which closes D38 and Q1;
[`missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W3-load-and-correct-a-terms-events-by-import.md`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W3-load-and-correct-a-terms-events-by-import.md)
and its five-screen mockup.

## Purpose

Get a season's events into the system in one go, and correct them the same
way, without anybody hand-entering a term card and without the club keeping
its calendar in this application's shape. The club keeps its calendar however
it likes; the application accepts one thing — a CSV — and states exactly what
that file will do before anything is written.

Shared vocabulary, authorization, responsive behaviour and cross-ticket states
are defined in [`../slice-ux.md`](../slice-ux.md) and
[`../standards.md`](../standards.md) and are not duplicated here.

## Owned screens and routes

| Screen  | Route                    | Audience                                                                   |
| ------- | ------------------------ | -------------------------------------------------------------------------- |
| `W3-01` | `/operate/events/import` | An operator holding `event_calendar_management`, empty season              |
| `W3-02` | `/operate/events/import` | Same operator, season already has events                                   |
| `W3-03` | `/operate/events/import` | Same operator, after choosing a file — the confirmation table              |
| `W3-04` | `/operate/events`        | Same operator — **Create event** becomes a menu of two                     |
| `W3-05` | `/operate/events/import` | Same operator — a refusal, and the boundaries panel present in every state |

`W3-01` through `W3-03` and `W3-05` are one component in four states, not four
routes — `import-screen.tsx`'s own note explains why: `REQ-import-confirmation`
makes an import a proposal read before anything is written, and the file, the
proposal and the confirmation are three states of one screen the operator never
navigates between. The export the screen offers is a route of its own, `GET
/operate/events/import/export`, because it is a download rather than a write —
see that route's file for why it is not a Server Action.

## Wireframes

The approved artefact for this workflow is the mission mockup rather than an
SVG pair, and it carries both presentations side by side:
[`W3-load-and-correct-a-terms-events-by-import.html`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W3-load-and-correct-a-terms-events-by-import.html)
— desktop 1280 and 375px, current build against proposed, for all five screens.
`W3-04`'s current side is grounded in a Playwright capture of `main`, because
the Events page it changes one control on already exists; the other four
screens are code-only, correctly, since there is no import, no export and no
CSV handling anywhere on `main`.

## This ticket builds

- **The service layer.** `csv.ts` (the dialect: parsing, formatting, the byte
  order mark), `event-csv.ts` (what a row means — pure, no database, so the
  copyable prompt's worked example can be asserted to import cleanly without a
  server), and `event-import.ts` (the half that reads the season and writes,
  inside one transaction, only once the operator confirms).
- **The bulk import screen**, in its four states, at `/operate/events/import`:
  empty season with a template download and the copyable prompt; a season with
  events, offering its own export as the starting point; the confirmation
  table naming every row's outcome and, for a changed cell, its old and new
  value; and a refusal, whole-file or per-row, with the "what an import can
  never do" panel present throughout.
- **The export**, `GET /operate/events/import/export` — every event in the
  season in the import's columns plus the two read-only ones, cancelled events
  included, with a UTF-8 byte order mark so Excel does not mangle an accented
  venue.
- **The one change to the Events page**: **Create event** becomes a menu of
  exactly two — **Add a single event** and **Bulk import**. The list, the
  filters, the period control and the view switch are `W1`'s and are
  untouched.

## Explicitly not in this ticket

- **A term-card parser, or AI inside the system.** Brian: "I do not want to
  have to read the term card… There's no AI running in the system." The messy
  conversion happens outside the application, in whatever tool the club
  already uses, guided by the copyable prompt.
- **Mass delete.** `REQ-upsert-only` holds structurally: an import can create
  and update drafts and nothing else. D35 versus Brian's doubt that bulk
  delete will ever be supported is carried to `W4`, unresolved by this ticket
  on purpose.
- **Approval, cancellation, notification, or any audience decision.** An
  import produces drafts and nothing leaves the building; approval is `W4`,
  one event at a time.
- **Authoring an identifier.** `id` is system-issued and stable for an event's
  life; an operator only ever keeps the value the export gave them or clears
  the cell.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error and
  completed states that apply under the shared contract — an empty season, a
  season with events, the proposal, a whole-file refusal, a per-row refusal
  alongside rows that still apply, and what was written.
- Preserve the desktop and phone information hierarchy shown in the mockup. At
  375px the confirmation table becomes one card per row and still states the
  outcome, the changed fields with their old and new values, and the refusal
  reason where there is one.
- A changed cell is shown by **highlighting the cell itself**, with the old
  value beneath it — never a separate diff column.
- The bulk import screen shows a **count** by status (drafts, approved,
  cancelled), never a list — the Events page one click away already is one.
- The copy rule, from Brian, repeatedly on this mission: the application says
  what a control does and what its consequence is. It never explains its own
  design, never justifies a default, and never instructs the operator to use a
  different field.
- **Authorisation is enforced in the service layer, never by route
  visibility.** Every exported function in `event-import.ts` opens with
  `requireCapability("event_calendar_management")` before it reads or writes
  anything — routes and server actions guard again, but deleting the gate from
  either cannot reach the service functions.
- In implementation review, provide LAN-155, the implemented screen IDs,
  desktop and 375px screenshots, acceptance-criteria results, and every
  deviation.

## Acceptance criteria

- A CSV exported from a season and imported back unchanged produces zero
  writes and reports every row as unchanged.
- A row with a blank `id` creates a draft; the identifier the import returns
  is what a second import of the same file must be re-pointed at to avoid a
  duplicate.
- A row whose `id` matches nothing is refused and named, and every other row
  in the file still applies — never a silent partial success.
- A row that would change an approved or a cancelled event is refused and
  named; an unchanged row is a no-op whatever the event's status.
- An event present in the season and absent from the file is left exactly as
  it was.
- An unparseable row is refused individually; a file that is not a CSV, or has
  no header this importer recognises, is refused whole before any row is
  read.
- A blank or whitespace-only cell on an update row changes nothing; on a new
  row it means unset, and the type's template default applies.
- The confirmation names, for every updated row, each changed field with its
  old and new value, and totals accompany it. Nothing is written until it is
  confirmed.
- Abandoning the confirmation writes nothing.
- Applying writes as one transaction — a failure part-way leaves the season as
  it was, and a plan whose digest no longer matches the season it would apply
  to is refused rather than applied against different rows than the operator
  read.
- The copyable prompt's own worked example imports cleanly, asserted by test.
- No import creates an invitation, an RSVP, an attendance record or a
  notification, and no import ever deletes.

## The delegated determination

- **Exact CSV dialect, encoding, delimiter and size limits** — delegated to the
  Mission Lead as ordinary engineering. Implemented as: comma-delimited,
  CRLF-terminated, UTF-8 with a byte order mark on export, a 1 MB file limit
  and a 2,000-row limit, both refusing the file whole before any row is read.
- **How long an uploaded file is held before the confirmation is abandoned** —
  delegated. Implemented as: not at all. The file's text lives only in the
  request that produced the proposal and in the confirmation form itself; there
  is no staging table, no temporary file and no cache, so abandoning the
  confirmation leaves nothing anywhere to have retained.

## Conflict with an approved decision — carried, not resolved here

**D35 says "mass delete must exist."** Brian, 2026-08-21, doubts it will be
supported: "If we want to bulk delete, that should be a different process, but
I'm not even sure if we're going to support that." This ticket settles only
that no deletion reaches the system through a CSV — `REQ-upsert-only` holds
structurally, not by intention. The conflict itself is carried to `W4`, which
already owns deleting a draft one at a time under inventory amendment 1.
