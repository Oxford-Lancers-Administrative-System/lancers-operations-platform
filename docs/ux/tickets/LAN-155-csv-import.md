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

## Decision history relocated from source (LAN-300)

### src/lib/services/event-csv.ts — module header (now event-csv/shared.ts)

> The club's CSV: what a column means, what a row does, and what the file is
> refused for. LAN-155, work package `WP-csv-import`, workflow `W3`.
>
> ## The shape Brian settled on, 2026-08-21
>
> There is **no term-card parser and no AI inside the system**. The club's term
> card is a different shape every season, so the application does not read it:
> the conversion happens outside, in whatever tool the club already uses, guided
> by `IMPORT_PROMPT` below, and the application accepts one finished CSV.
>
> Four rules govern every row, and none of them is an implementation choice:
>
> - **`REQ-upsert-only`.** An `id` updates, a blank `id` creates, an unmatched
>   `id` refuses that row and lets every other row proceed. **Nothing is ever
>   deleted by an import** — an event in the season and absent from the file
>   is left exactly as it was, which is what makes it safe to export one term,
>   edit it, and import it back without taking the rest of the season with it.
> - **`REQ-import-drafts-only`.** An import may not _change_ an approved or
>   cancelled event. The refusal is narrow on purpose: an unchanged row is a
>   no-op whatever the status, so a clean export and re-import does nothing at
>   all rather than producing a screen of refusals.
> - **A blank or whitespace-only cell changes nothing.** Brian: "If it's blank
>   or has white space, it means no change. Only if it has non-white space
>   does it then change." There is therefore deliberately no way to _clear_ a
>   field by import — a spreadsheet round trip drops trailing values far more
>   often than anybody deliberately empties one, and clearing a field on the
>   event itself takes one edit.
> - **`REQ-import-confirmation`.** Nothing here writes anything. This module
>   produces a _proposal_; `./event-import.ts` applies one, in one
>   transaction, only after the operator has confirmed it.
>
> ## Why it is pure, and has no database
>
> Two reasons, and the second is the one that matters. The confirmation table is
> a client component, so anything it renders has to be reachable without `pg` —
> the same split `./event-input.ts` documents. And the copyable prompt's worked
> example is **asserted by test to import cleanly**: a prompt that produces a
> file the importer rejects is worse than no prompt, because it fails in
> somebody else's tool where nobody can see it. That assertion is a unit test
> against this module precisely because this module needs no server.
>
> ## The columns, and the ones deliberately absent
>
> The column set is the event record and nothing else. **Audience** is not a
> column (D48) — it is confirmed one event at a time at approval. **Status** is
> not, because an import makes drafts and may not change an approved event, so
> there is nothing to set. **Term and week** are not, because they are derived
> from the date (D9, D85). **Questions and RSVP timing** are not, because they
> arrive from the type's template (D42). The **joining URL** is not, which is
> `REQ-no-joining-url` holding: a bulk file never carries an online event's
> link, and no row here can write one.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-csv.ts — `planImport` (now event-csv/plan.ts)

> The whole file, read against the season, as a proposal.
>
> Nothing here writes. The two shapes of failure are kept apart exactly as the
> workflow's exception table asks: a file that is not a CSV or has no header
> this importer recognises is refused **whole, before any row is read**, and
> everything else is a per-row refusal that leaves every other row proceeding —
> "never a silent partial success".

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-csv.ts — `TYPE_TOKEN_LIST` (now event-csv/shared.ts)

> The seven shipped tokens, as the refusal sentence and the prompt list them.
>
> Still the seven, and still static, after LAN-265 — and that is a deliberately
> narrow claim. The `type` column accepts **any template's name** as well
> (`resolveTemplate`), which is what makes "Kicking Clinic" importable at all;
> what this list is for is telling an outside tool converting a fixture list
> what the club's standing vocabulary looks like, and telling an operator whose
> cell matched nothing what a recognised one reads like. A list of the club's
> current template names would be the better sentence, and it is not written
> here because `IMPORT_PROMPT` is a static versioned block an operator keeps a
> copy of.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/import/import-state.ts — module header

> What the bulk import screen hands back and forth. LAN-155.
>
> It lives beside `actions.ts` rather than in it for the reason
> `../form-state.ts` gives: a `"use server"` module may export only async
> functions, so a shared constant or a type exported from there would be a build
> error.
>
> It imports from `@/lib/services/event-csv`, which is pure, and never from
> `event-import.ts`, which is `server-only` — the client component reads this
> module, and a type import that dragged the database module into the browser
> bundle would not build.
>
> ## Why the file's own text is in here
>
> `REQ-import-confirmation`: an import is a proposal until accepted, and nothing
> is written until the operator confirms. The proposal therefore has to survive
> a round trip, and the two ways of doing that are storing it on the server or
> carrying it in the form. `W3` says the uploaded file is "held only long enough
> to produce the confirmation, and not retained as a record", which rules the
> first one out: a staging table is a record, and an abandoned confirmation
> would leave one behind.
>
> So the text goes back to the browser and returns with the confirmation, and
> `applySeasonImport` rebuilds the plan from it inside the apply transaction and
> refuses unless the digest still matches. Abandoning the confirmation leaves
> nothing anywhere, because there was never anything to leave.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/import/export/route.ts — module header

> The season's events, as the file an operator edits and brings back. LAN-155.
>
> ## Why this is a route rather than a Server Action
>
> It is a download. A Server Action returns a value to a React tree; giving the
> browser a file with a name needs a response carrying `Content-Disposition`,
> and a link the operator can middle-click. Every _write_ on these screens is
> still a Server Action; this is the one thing that is not a write at all.
>
> ## Why it is authorized, and where
>
> `exportSeasonEvents()` calls `requireCapability("event_calendar_management")`
> before it reads a row — `slice-ux.md` § 4, "routes do not authorize", and
> `W3`'s "event management capability is required, enforced in the service
> layer". Deleting this handler's error branch cannot grant the export; deleting
> the handler entirely is the only thing it does.
>
> A refusal is a `403` with a fixed body rather than a redirect: this is opened
> from a page the operator is already on, and a redirect to `/login` would
> arrive as a page of HTML where a spreadsheet was expected.
>
> ## The byte order mark
>
> Excel on Windows reads a CSV without one as the system code page, which turns
> every accented venue name into mojibake the operator then "corrects" and
> imports back. The importer strips it again, so the round trip is unaffected.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/import/page.tsx — module header

> `/operate/events/import` — bulk import, and the export that feeds it.
> LAN-155, work package `WP-csv-import`, workflow `W3`.
>
> A new surface. There is no import, no export and no CSV handling anywhere on
> `main` before this package, and the one thing this work changes on an existing
> screen is the Events page's **Create event** control, which becomes a menu of
> two — `../create-menu.tsx`.
>
> ## Three independent refusals, as everywhere under `/operate`
>
> The layout guards the frame, `gateShellPage` guards this page, and
> `readSeasonImportContext()` guards itself in the service layer. `W3` asks for
> the third by name: "event management capability is required, enforced in the
> service layer". Reading the calendar is open to any linked, active operator;
> _changing_ it is `event_calendar_management`, and an import is the largest
> change to it the application offers.
>
> ## Why the screen is a client component
>
> `REQ-import-confirmation` makes an import a proposal the operator reads before
> anything is written, so the file, the proposal and the confirmation are three
> states of one screen rather than three routes. A server-rendered flow would
> need somewhere to keep the proposal between them, and `W3` says the uploaded
> file is not retained as a record.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/create-menu.tsx — module header

> **Create event**, as a menu of exactly two. LAN-155, screen `W3-04`.
>
> Brian, 2026-08-21: "Create Event should be Add Single Event, and then Bulk
> Import. It should be only two options. You should not export the season. That
> doesn't make sense to be in the proposed column."
>
> Two consequences, and both are decisions rather than layout:
>
> - **Importing is here** because it is a way of creating events, so it
>   belongs under the control that creates them rather than as a third button
>   competing in the header.
> - **Exporting is not here**, because it is not a way of creating anything.
>   It lives on the bulk import screen, beside the file it produces.
>
> This is the only change this work package makes to the Events page. The list,
> the filters, the period control and the view switch are `W1`'s and are
> untouched.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/import/import-screen.tsx — file header, export location

> Brian, 2026-08-21: "If you Mass Export the season … that detail should be in
> that screen." Importing is a way of creating events, so it sits under **Create
> event**; exporting is not a way of creating anything, so it lives beside the
> file it produces. One button whose label follows the state — _Download the
> template_ on an empty season, _Download the current season's events_ once
> there are any — rather than two buttons one of which is always wrong.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/events/import/actions.ts — file header, authorization and cancel

> Both open with `requireCapability("event_calendar_management")`, which resolves
> the actor from the **verified session** and refuses unless they hold a
> permitted role. Neither takes an actor argument and neither may: a server
> action is a POST endpoint the browser can call directly, so an action that
> accepted "who am I" would accept whatever was sent.
>
> The services behind them guard again — `W3` requires the capability enforced in
> the service layer, and `@/lib/services/event-import` does exactly that. Two
> independent refusals, neither depending on the other having run.
>
> The screen is one screen: choosing a file, reading the proposal and applying
> it are three steps through the same state, and `useActionState` holds one
> state per action. Splitting them into three actions would mean three states
> and a component reconciling them, which is where a screen ends up showing a
> stale proposal beside a fresh error.
>
> `cancel` reaches no service and issues no statement. That is not an oversight to be
> tidied into a client-side reset later: the workflow's exception table says
> "the operator abandons the confirmation → nothing is written. The import is not
> a transaction that half-happened", and an action that provably does nothing is
> the clearest possible statement of it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/csv.ts — file header (hostile-file assumptions, formula injection)

> ## The file is hostile by default
>
> The operator's file is not one this application produced. It is one a
> spreadsheet produced, from something an AI tool produced, from a term card.
> Every one of the following is assumed rather than hoped for:
>
> - **A UTF-8 byte order mark.** Excel writes one. Left in place it becomes
>   part of the first header name, so `id` is not `id` and the whole file is
>   refused for a reason nobody can see.
> - **CRLF, and lone CR.** Windows writes the first; a very old Mac export
>   writes the second. Both are record separators here.
> - **Quoted fields containing commas, quotes and newlines.** A venue called
>   `The Lamb and Flag, St Giles` is one field, and a description may carry a
>   paragraph break.
> - **Formula injection.** A cell a spreadsheet reads as a formula — one
>   beginning `=`, `+`, `-`, `@`, a tab or a carriage return — is a live
>   instruction in Excel, Numbers and Google Sheets. Everything this module
>   _writes_ is prefixed with an apostrophe when it begins with one of those,
>   which is the escape those applications understand, and everything it
>   _reads_ strips exactly that apostrophe again. The two are inverses on
>   purpose: without the second, exporting a venue called `-- the Astro` and
>   importing it straight back would report a change nobody made, and the
>   round trip would stop being the no-op `REQ-import-drafts-only` requires.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-csv/shared.ts — ImportPlan.digest

> A fingerprint of exactly what applying would write.
>
> The confirmation is a proposal computed at one moment and applied at
> another, and the season can move in between. `./event-import.ts`
> recomputes the plan inside the apply transaction and refuses when this
> no longer matches, so what is written is always what the operator read.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-import.ts — file header (why applying is one transaction)

> ## Applying is one transaction, and the plan is recomputed inside it
>
> The workflow's exception table asks for two things that pull in opposite
> directions: "applied as one transaction, so a failure part-way leaves the
> season as it was", and "nothing is written until they confirm". A confirmation
> is read at one moment and applied at another, and the season can move in
> between — another operator approves an event this file also changes.
>
> So the file's text, not a stored plan, is what survives the confirmation. The
> uploaded file is **not retained as a record** anywhere: it lives in the
> request that produced the proposal and in the confirmation form the operator
> is looking at, and nowhere else — no table, no temporary file, no cache. On
> apply the plan is rebuilt from that text against a **locked** read of the
> season, and refused outright unless its digest still matches the one the
> operator confirmed. What is written is therefore always exactly what they
> read, or nothing at all.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
