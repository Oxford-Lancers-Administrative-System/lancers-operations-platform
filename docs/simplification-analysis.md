# Simplification analysis — LAN-303

The application, read module by module against the workflows it exists for, on the assumption that every module is over-built. For each: what it is for, the smallest honest way to write it, and how much of what is here survives. Measured at `e1d7b33` (main, 11 September 2026, after LAN-300).

## 0. The number

| Measure (code lines in `src/`, no tests, no generated types)                                                     |  Lines |
| ---------------------------------------------------------------------------------------------------------------- | -----: |
| The application today                                                                                            | 79,547 |
| Carve-outs the ticket freezes (auth, db, supabase, proxy, rsvp, the two token services, delivery, the scheduler) |  7,225 |
| Reachable by this ticket                                                                                         | 72,322 |
| After every ranked proposal, by the sections' own estimates                                                      | 58,516 |
| The same, with shared pieces that several sections each paid for counted once (about 850 lines added back — § 3) | 57,700 |
| After the ranked list, if Brian also deletes the design-preview routes (product question A1)                     | 53,100 |
| After the ranked list and the product questions answered towards "one"                                           | 51,800 |

So the firm proposal takes the reachable code from 72,322 to about **57,700** (−20 %), and the whole `src/` tree from 79,547 to about **64,900**. With the design preview gone it is about **60,400**, and with every product question answered towards a single behaviour about **59,000**. No target was set; these are what the analysis can justify line by line, and every figure below carries a `path:line` behind it.

Per section:

| Section                                                                  | Files |        Now |               Saved |                 After |        Cut |
| ------------------------------------------------------------------------ | ----: | ---------: | ------------------: | --------------------: | ---------: |
| G01 Events: list, form, templates, and the events services               |    44 |      6,048 |                 595 |                 5,453 |       10 % |
| G02 One event: detail, approval, amend, cancel, plan, share, roster form |    41 |      6,211 |               1,305 |                 4,906 |       21 % |
| G03 Register, delivery, import/export, operator calendar, participation  |    55 |      6,823 |               1,246 |                 5,577 |       18 % |
| G04 Public calendar and feed, the shell, sign-in, API routes, policies   |    77 |      5,240 |                 731 |                 4,509 |       14 % |
| G05 Roster board, inline editing, CSV import, returner intake            |    44 |      6,382 |               1,641 |                 4,741 |       26 % |
| G06 Player record, onboarding, missing-data queue, follow-ups            |    44 |      5,621 |               1,568 |                 4,053 |       28 % |
| G07 People directory, record, edit, create, duplicates, merge            |    49 |      6,680 |               1,241 |                 5,439 |       19 % |
| G08 Recruitment: board, record, doors, QR, cycles                        |    56 |      7,055 |               1,657 |                 5,398 |       23 % |
| G09 Player's own pages: home, details, join, stop, RSVP                  |    48 |      4,933 |               1,150 |                 3,783 |       23 % |
| G10 Operator administration: operators, invitations, roles, audit        |    43 |      6,295 |               1,443 |                 4,852 |       23 % |
| G11 Messaging rules, the guide, the Monday report                        |    33 |      4,095 |               1,116 |                 2,979 |       27 % |
| G12 The kit, the theme, the design-preview routes                        |    56 |      6,939 | 113 (4,564 with A1) | 6,826 (2,375 with A1) | 2 % (66 %) |
| **Reachable**                                                            |   590 | **72,322** |          **13,806** |            **58,516** |   **19 %** |

The one section under 15 % is the events services: the analyst read `src/lib/services/events/**`, `event-input.ts` and `event-periods.ts` and found them close to their smallest shape (one SQL read per tier, a rule table already, a validator whose messages a schema library would not shorten). The over-building in G01 is in the two form editors and the list, not the services. G04 is low for the same reason: the public calendar's grids are honest, and its saving is mostly shared pieces whose payback lands in the operator sections.

## 1. How to read this

**The question.** Brian, 11 September: "Stop treating it like it's well written. Attack it. Go figure out what can be simplified without losing any functionality." The measure is non-comment code lines in `src/` excluding tests and the generated types; comments and moves count for nothing; the application must function the same, proved by the existing tests at every commit and by the screenshot pairing at the head.

**The method.** The reachable 72,322 lines were split into twelve sections along workflow lines (a route tree and the services it reads, so one analyst saw a whole journey). Each section was read in full by one Opus-class analyst — Brian lifted the Sonnet cap for this work — with the same brief: assume over-built, answer the three questions per module, hunt eleven named patterns, grade honestly, and write proposals only with `path:line` evidence and an estimate with its reasoning. The Lead (this document's author) then read every section, checked the largest deletion claims against a production-only export scan (§ 2.3), reconciled the shared pieces the sections proposed under different names (§ 3), ranked everything (§ 4), and grouped the product questions (§ 6). The twelve sections are the appendix, unedited except for the heading level and the corrected "Lines now".

**The counter.** `npm run measure` (new, `scripts/measure.mjs`) parses every file with TypeScript and counts a line when at least one non-comment token sits on it. `--by-dir <depth>` and `--files <n>` break it down; `--json` feeds scripts. One correction happened during the analysis: the first version counted JSDoc blocks as code (88,761); the G04 analyst noticed, the counter now skips them, and every number here is from the corrected counter (79,547). The first five sections were briefed with the uncorrected per-file figures; their savings are estimates of code removed and do not depend on it, and the appendix shows both figures for those sections.

**Duplication.** `npm run duplication` (new, `jscpd` over `src/` minus tests and the generated types, 8-line and 60-token minimum) finds 139 clones, 2.6 % of lines. That is the input the ticket asked for, and it settles one thing: this is not a copy-paste problem. Clone removal would take a few hundred lines. The volume is in over-structure — the same thing written procedurally where one table or one component would express it — which jscpd cannot see and which is what the sections found.

**Conventions.** Proposal ids are `G05-03` (section, then order within the section). "Saves ~n" is the section's estimate for its own files, net of any new shared code the proposal introduces, counted once in the section that proposes it. Where a shared piece pays out in other sections, the section says so and the Lead's reconciliation in § 3 carries it. Risk classes in the ranked list: **A** — deletes unreached code or reshapes data with every test intact; **B** — a rewrite behind existing screen and service tests plus the screenshot pair; **C** — reaches the operator-administration boundary, a public token door, or an audited write path, where the Highest-grade reviewer must plan an injection route; **Q** — gated on a product question.

## 2. What the application is made of

### 2.1 The layers, by weight

| Layer                               | Files |   Lines | What the sections found                                                                                                                                                                                                                    |
| ----------------------------------- | ----: | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `page.tsx` files                    |    74 |   7,287 | Each reads its data and lays out parts, as LAN-300 left them. 23 of them repeat the same `try { read } catch { UnavailableScreen }` dance and 24 the same gate-and-refuse preamble (G08-12, G10-03, G11).                                  |
| `actions.ts` files (server actions) |    31 |   3,334 | 28 files parse `FormData` by hand; 10 declare the same `text(formData, field)`; every early return rebuilds its whole state record by hand (G01-04, G02-10, G03-06, G05-10, G06-05, G08-12, G10-06, G11-02).                               |
| `presentation.ts` files             |    23 |   2,433 | Route-level vocabularies: label tables in 33 files, 41 `format*` date functions in 19 files, the same five membership words declared three times (G03-07, G04-04, G06, G07, G10, G11-07).                                                  |
| `*-state.ts` files                  |    19 |   1,008 | One interface and one empty constant per route for the same three-field outcome (G02-06, G10).                                                                                                                                             |
| `*filters*.tsx`                     |    12 |   1,209 | Three filter idioms across the lists; two of them hand-build what the shared `ListFilters` bar already does (G03-01, G06 question B5).                                                                                                     |
| Desktop table + phone card pairs    | 15–26 |  ~3,000 | 23 files hand-build an MUI table and 21 render `RowCardList`; each list is written twice (G01-02, G03-02, G04-01, G05-07, G06-01, G07-03, G10-03).                                                                                         |
| Service `index.ts` / `shared.ts`    |    37 |   2,787 | The barrels mostly earn their keep (44 importers of `@/lib/services/events`); several `shared.ts` files hold row mappers and column lists spelt two to four times (G05-12, G06-06, G07-02, G10-01, G11-06).                                |
| Services proper                     |  ~200 | ~24,000 | The SQL, the rules, the validators. Largely honest. The fat is `…In` plus wrapper pairs on every read, hand-written folds where one `camelRow` would do, seven queries where one join would do, and readers nothing calls.                 |
| `src/components/` (the kit)         |    26 |   2,300 | 26 files, 2,133 lines, every member reached by live routes; the honest saving inside the kit is 113 lines — three components written twice (G12-03). The kit gains the pieces in § 3.                                                      |
| `src/app/design-preview/**`         |    30 |   4,515 | 16 routes that nothing imports, tests, links or walks; its own README says it was never to be merged; two of its routes render restricted person fields without the capability the live record requires (product question A1, finding F4). |
| Carve-outs                          |    39 |   7,225 | Read for context; nothing proposed.                                                                                                                                                                                                        |

### 2.2 The patterns, everywhere

Nine things were found in nearly every section. They are why the sections converge on the same shared pieces.

1. **Every list is written twice.** A desktop `Table` and a phone `RowCardList`, each with its own column order, its own empty text and its own sort links. The same eight facts, twice, in 15 files (26 if the boards are counted).
2. **Every form is a prop wall.** One `useState` per field and a sibling that takes 14–19 props to lay them out; the same "fill if blank" rule written once per field (G01-01, G05-11, G07-01, G08-02, G08-04, G09-01, G09-06).
3. **Every action parses `FormData` by hand and rebuilds its state by hand.** 28 `useActionState` forms, 27 `FormData` readers, five to seven field literals per early return.
4. **Every route restates a vocabulary.** The status word next to the status colour is in the kit (`STATUS_VOCABULARY`), but only the colour; the word lives in each route's `presentation.ts`, so the same five membership statuses are declared three times and the same four delivery states twice.
5. **Every date is formatted locally.** Forty-one `format*` functions in nineteen files, two of which return the raw value on failure and one of which is the counter-example `docs/ux/standards.md` rule 3 records.
6. **Every read has two names.** `readThing()` wraps `readThingIn(tx)` so callers can compose transactions; 26 files in `src/app` then open the transaction themselves. Both names are exported from every service, and half the `…In` forms have exactly one caller.
7. **Every row is mapped by hand.** `snake_case` to `camelCase` written as a field-by-field object literal, once per query, in ~40 places; one `camelRow(row)` and a per-query column list replaces them (G06-06, G07-02).
8. **Every per-field rule is a switch.** The template change plan (six parallel constructs for six fields, G01-03), the season band (fifteen hand-wired elements, G06-02), the roster board's seven commits (G05-04), the messaging schedule's four row shapes (G11-01): each is one descriptor table pretending to be procedure.
9. **Every second thing is exported.** 307 exports (in 143 files outside the carve-outs) are named by no non-test, non-preview file. 272 of them are used inside their own file (the `…In` half of a read pair, a type the file's own functions take) and need only the `export` keyword dropped; 35 — 493 lines, 22 of them whole functions — are referenced by nothing at all except a test.

### 2.3 What the deterministic scan adds

`knip` runs clean in `npm run verify` and reported zero dead exports after LAN-300. It cannot see through `export * from "./role-detail"`: a symbol re-exported by a star barrel counts as used. A one-file scanner (`scripts/dead-exports.mjs`, proposed alongside `measure.mjs`; the run for this analysis is in Appendix B) walks every export outside the carve-outs and asks whether any non-test, non-preview file names it. It confirmed every "nothing calls it" claim the sections made — `readRoleHolders` (84 lines, G10-05), the roster filter surfaces (G05-05), the four onboarding readers (G06-07), `shiftDays`, `permissionsLine`, `accountStateColour`, `cancellationDefaultNotify` — and found more the sections did not claim:

- `raisePersonFactDisputeIn` and `resolvePersonFactDisputeIn` (104 lines of `person-fact-dispute.ts`): the M7 W7 "settle a disputed fact" workflow reads open disputes on the player's details page, but no screen raises or resolves one; the details page says the disputed-fact clause was retired in LAN-230 (Q-9). Product question A7.
- `validatePhoneParts` (44 lines): only its test calls it; `PhoneField` validates through `person-validation.ts`.
- The weekly report's three stored-snapshot readers (G11 product question A8) and `generateWeeklyReport`'s claimed script callers (none under `scripts/`).

Deleting the functions the scan lists, other than the ones behind a product question, is the first package's deterministic half: no model is needed to find them, and each one takes its test with it (a test that exists only to exercise a function nothing else calls is not a behaviour of the application).

## 3. The shared pieces

The sections proposed the same components under different names. Reconciled, this is the kit after the ticket — each piece written once, at the home named, and counted once.

| #   | Piece                                                                                                                                                                                                                                         | Home                                                                     | Replaces                                                                                                                                                                                             | Proposed by                                                                                           | Cost once | Firm saving app-wide |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------: | -------------------: |
| 1   | `DataList` — one column definition renders the desktop table and the phone cards (`cell`, `card` role, sort key, test ids)                                                                                                                    | `src/components/data-list.tsx`                                           | 15 table+card pairs (events, templates, people, missing queue, follow-ups, attendance band, participation, delivery, both imports, operators, roles, calendar list; the boards keep their own frame) | G01-02, G03-02 (`DataTable`), G04-01 (`BucketedList`), G05-07, G06-01, G07-03, G10-03 (`RecordTable`) |      ~110 |               ~1,100 |
| 2   | `ActionForm` / `ActionPanel` — a `useActionState` form with its pending label, outcome slot, error notice and optional confirm                                                                                                                | `src/components/action-form.tsx`                                         | 28 hand-written client forms                                                                                                                                                                         | G02-06, G03-06, G04-06, G10-02, G11-02                                                                |       ~90 |                 ~700 |
| 3   | `guardedAction` — gate, parse `FormData` through a field list, call the service, map the outcome; plus `readOrUnavailable` for pages                                                                                                          | `src/lib/actions/guarded-action.ts`, `src/app/operate/unavailable.tsx`   | 31 `actions.ts` files, 23 unavailable dances, 24 gate preambles                                                                                                                                      | G01-04, G02-10, G05-10, G06-05, G08-12, G09-02, G10-06, G11-02                                        |       ~80 |                 ~600 |
| 4   | One outcome type                                                                                                                                                                                                                              | `src/components/outcome-slot.tsx` (`OutcomeState`, already there)        | 19 `*-state.ts` records                                                                                                                                                                              | G02-06, G10                                                                                           |         0 |                 ~400 |
| 5   | `camelRow` and per-query column constants                                                                                                                                                                                                     | `src/lib/services/rows.ts`                                               | ~40 hand-written row mappers and 4× column lists                                                                                                                                                     | G06-06, G07-02, G11-06                                                                                |       ~15 |                 ~450 |
| 6   | One formatter home: `formatDay`, `formatInstant`, `formatWhen` (three shapes, rule 3's unreadable-date sentence)                                                                                                                              | `src/lib/club-time.ts`                                                   | 41 `format*` functions in 19 files                                                                                                                                                                   | G02, G03-07, G04-04, G06, G07, G09, G10, G11-07                                                       |       ~35 |                 ~350 |
| 7   | `STATUS_VOCABULARY` carries the word beside the colour; `StatusChip` defaults its label from it                                                                                                                                               | `src/components/status-chip.tsx`                                         | label tables in ~12 route `presentation.ts` files                                                                                                                                                    | G05, G06, G09, G10                                                                                    |       +25 |                 ~200 |
| 8   | `SortableHeader` builds its own href from `basePath`, `carry`, `query`, `defaultDirection`                                                                                                                                                    | `src/components/sortable-header.tsx`                                     | 4 local sort headers                                                                                                                                                                                 | G04, G06-04, G07, G11                                                                                 |       +10 |                 ~120 |
| 9   | `DividedList` / `ListRow` — a ruled list of rows                                                                                                                                                                                              | `src/components/divided-list.tsx`                                        | 14 hand-ruled lists                                                                                                                                                                                  | G02-04, G06-09                                                                                        |       ~40 |                 ~250 |
| 10  | `ConfirmDialog` and `AskButton` (send/resend a questionnaire)                                                                                                                                                                                 | `src/components/confirm-dialog.tsx`, `ask-button.tsx`                    | 5 dialogs, 2 ask buttons                                                                                                                                                                             | G01, G06, G08-13                                                                                      |      ~105 |                 ~200 |
| 11  | The board engine — one frame, head, phone card, column table with accessors, cell-commit table, filter state — shared by the roster and recruit boards, outside the kit by the design system's own rule                                       | `src/app/operate/board/`                                                 | `roster-board*.tsx`, `recruitment-board-*.tsx`, both `board-data.ts`, both `board-columns.ts`                                                                                                        | G05-01/02/03/04/09, G08-03/05/11/14                                                                   |      ~350 |               ~1,300 |
| 12  | Field tables — one descriptor per field drives the form, its validation, its `FormData` reader and its input type                                                                                                                             | per feature (`person-fields.ts`, `signup-fields.ts`, `step1-fields.ts`…) | the prop walls and hand-written validators                                                                                                                                                           | G01-01, G05-11, G07-01, G08-04, G09-01, G09-06                                                        |   in each |               ~1,000 |
| 13  | CSV spine — one header parser, one plan-by-column-rules, one download route helper                                                                                                                                                            | `src/lib/services/csv-header.ts`, `src/app/operate/csv-download.ts`      | roster and events CSV import/export                                                                                                                                                                  | G03-05, G05-06                                                                                        |       ~60 |                 ~250 |
| 14  | Small ones: `LinkMenuButton` (two create menus), `CopyButton` (two clipboard buttons), `Glyph` (six inline SVGs), `TokenLinkUnusable` (five terminal pages), `SignOutButton` (four inline forms), `CalendarArrangements` (two calendar grids) | `src/components/`                                                        | as named                                                                                                                                                                                             | G01, G03, G04-02/07, G08-10, G09                                                                      |      ~150 |                 ~350 |

Kit members that need a change so a local copy can go: `RecordField` (options as `{value,label}`, an `editor` slot — G06-02); `SelectField` (a `native` option — G03-01); `DateField` (`minDay`, uncontrolled `defaultValue` — G10); `RowCard` (`ReactNode` sublines — G04); `MetricRow` (a `compact` width, or the review accepts the kit's — G02-09); `CandidateRow` (a submit or radio-choice action; it has **no caller in the application** today while three routes wrote their own — product question E5).

The G12 analyst confirms the kit is honest: there is no local `Fact`, `Notice`, `StatusChip`, `RowCard` or `Field` anywhere in the live tree, and only four direct `Paper`s, all board or calendar frames. Its `RecordList` is § 3 #1 under another name and is counted there; its own saving is the three pairs written twice inside the kit (G12-03, 113 lines) and the `SortableHeader` prop shape that lets two route-local wrappers go.

The reconciliation matters for the number: seven sections each counted `DataList` once, three counted an action form, three a confirm dialog, four a formatter home. Adding those back is the 850-line line in § 0. The "firm saving app-wide" column is the Lead's estimate from the sections' out-of-section figures and is what the execution packages are measured against; the per-section "Saved" column in § 0 is the conservative floor.

## 4. The ranked list

Every proposal, ranked by lines saved over risk (A = 1, B = 1.5, C = 2.5, Q = 3). The package column is the execution order in § 5. The ids open the proposal in the appendix.

| Rank | Id     | Proposal                                                                                        | Saves | Risk | Package | Note                                                                                                                                                 |
| ---: | ------ | ----------------------------------------------------------------------------------------------- | ----: | :--: | :-----: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | G12-01 | Delete `src/app/design-preview/**`                                                              |  4515 |  Q   |   P9    | Gated on product question A1; two of these routes also render restricted person fields without the capability the live record requires (finding F4). |
|    2 | G06-01 | One `DataList` for the three table-and-card pairs                                               |   353 |  B   |   P6    |                                                                                                                                                      |
|    3 | G06-02 | The season band as a field list, not 15 hand-wired elements                                     |   290 |  B   |   P6    |                                                                                                                                                      |
|    4 | G05-01 | one column definition table                                                                     |   282 |  B   |   P5    |                                                                                                                                                      |
|    5 | G05-02 | one cell-commit table, client and server                                                        |   250 |  B   |   P5    |                                                                                                                                                      |
|    6 | G11-01 | One `SettingRow` for the messaging schedule's four row shapes                                   |   247 |  B   |   P8    |                                                                                                                                                      |
|    7 | G08-01 | One QR encoder from a library, not 250 hand-written lines                                       |   242 |  B   |   P7    | Brian, 2026-09-11: build it however, as long as it scans the same. Use `qrcode-generator` (no runtime dependencies), not `qrcode` (three).           |
|    8 | G10-05 | Delete `readRoleHolders()`: no page calls it                                                    |   158 |  A   |   P2    | Firm at ~118; the back-year read is product question A5.                                                                                             |
|    9 | G03-01 | One filter bar                                                                                  |   235 |  B   |   P4    |                                                                                                                                                      |
|   10 | G08-02 | `/operate/recruitment/new` stops writing its payload twice                                      |   233 |  B   |   P7    |                                                                                                                                                      |
|   11 | G01-01 | One values record per form editor, not nine useStates and a prop wall                           |   218 |  B   |   P3    |                                                                                                                                                      |
|   12 | G07-01 | One person-field table drives the edit form, its action, and the merge                          |   346 |  C   |   P6    |                                                                                                                                                      |
|   13 | G03-02 | One list component for the three tables                                                         |   199 |  B   |   P4    |                                                                                                                                                      |
|   14 | G08-03 | One banded board head, not two                                                                  |   196 |  B   |   P5    |                                                                                                                                                      |
|   15 | G08-05 | The column table carries its own accessor                                                       |   173 |  B   |   P5    |                                                                                                                                                      |
|   16 | G05-05 | delete the roster filter surfaces nothing reaches                                               |   114 |  A   |   P2    | Deletes a parameter and the injection probe that tested it; say so in the PR.                                                                        |
|   17 | G05-04 | the board's seven commits as specs, not procedures                                              |   146 |  B   |   P5    |                                                                                                                                                      |
|   18 | G07-02 | One read layer: `camelKeys`, one transaction per surface                                        |   145 |  B   |   P6    |                                                                                                                                                      |
|   19 | G02-01 | One ladder renderer instead of two                                                              |   144 |  B   |   P3    |                                                                                                                                                      |
|   20 | G06-03 | The record view: one action table instead of a 93-line switch                                   |   137 |  B   |   P6    |                                                                                                                                                      |
|   21 | G11-03 | One `PersonGrid` for the attendance and onboarding grids                                        |   137 |  B   |   P8    |                                                                                                                                                      |
|   22 | G03-03 | One read of an event's participants                                                             |   135 |  B   |   P4    |                                                                                                                                                      |
|   23 | G05-12 | barrels and duplicated transaction helpers                                                      |    90 |  A   |   P5    |                                                                                                                                                      |
|   24 | G12-02 | One `RecordList` for the desktop-table / phone-card pair (the same piece as `DataList`, § 3 #1) |   134 |  B   |   P2    | Reconciled with G01-02, G03-02, G04-01, G05-07, G06-01, G07-03 and G10-03 as one component; its cost is counted once, in P2.                         |
|   25 | G06-04 | The two queues' query plumbing                                                                  |   131 |  B   |   P6    |                                                                                                                                                      |
|   26 | G11-04 | The guide's copy as marked-up strings, not run arrays                                           |   131 |  B   |   P8    |                                                                                                                                                      |
|   27 | G09-01 | One field table drives step 1's form, its validation and its input                              |   216 |  C   |   P7    |                                                                                                                                                      |
|   28 | G11-06 | Stop writing column lists twice in the schedule service                                         |    84 |  A   |   P8    |                                                                                                                                                      |
|   29 | G02-02 | One read for the event page                                                                     |   124 |  B   |   P3    |                                                                                                                                                      |
|   30 | G11-07 | Delete the unrendered warning; take instants from one formatter                                 |    82 |  A   |   P2    |                                                                                                                                                      |
|   31 | G06-06 | One row mapper for every snake_case row                                                         |   116 |  B   |   P2    |                                                                                                                                                      |
|   32 | G02-03 | The roster form's three tables as one                                                           |   115 |  B   |   P3    |                                                                                                                                                      |
|   33 | G12-03 | Collapse the kit's three duplicated pairs                                                       |   113 |  B   |   P9    |                                                                                                                                                      |
|   34 | G10-01 | One administration core instead of two "shared" modules                                         |   185 |  C   |   P8    |                                                                                                                                                      |
|   35 | G05-03 | one board frame, shared with the recruitment board                                              |   109 |  B   |   P5    |                                                                                                                                                      |
|   36 | G10-02 | Three action panels, one component                                                              |   177 |  C   |   P8    |                                                                                                                                                      |
|   37 | G10-03 | Four page shells: one column definition, one unavailable guard                                  |   173 |  C   |   P8    |                                                                                                                                                      |
|   38 | G08-06 | W2's record stops saying the same thing four ways                                               |   101 |  B   |   P7    |                                                                                                                                                      |
|   39 | G11-05 | `compute.ts`: alias the columns, and count in one query                                         |   101 |  B   |   P8    |                                                                                                                                                      |
|   40 | G03-04 | Copy lives where it is used                                                                     |   100 |  B   |   P4    |                                                                                                                                                      |
|   41 | G07-03 | One `DataList` renders the desktop table and the phone cards from one column definition         |   100 |  B   |   P2    |                                                                                                                                                      |
|   42 | G10-04 | One administration-events file, with defaults                                                   |   165 |  C   |   P8    |                                                                                                                                                      |
|   43 | G03-05 | The CSV plan as a column rule table                                                             |    96 |  B   |   P4    |                                                                                                                                                      |
|   44 | G02-04 | A ruled list in the kit                                                                         |    95 |  B   |   P2    |                                                                                                                                                      |
|   45 | G02-06 | One action panel and one outcome type                                                           |    87 |  B   |   P2    |                                                                                                                                                      |
|   46 | G11-02 | One parse-then-save pipeline for the three settings forms                                       |   145 |  C   |   P8    |                                                                                                                                                      |
|   47 | G02-07 | The event page's facts and actions as data                                                      |    86 |  B   |   P3    |                                                                                                                                                      |
|   48 | G02-08 | One gate for amend, cancel and edit                                                             |    84 |  B   |   P3    |                                                                                                                                                      |
|   49 | G03-06 | One shape for a server-action form                                                              |    84 |  B   |   P4    |                                                                                                                                                      |
|   50 | G04-03 | One day cell and one entry list across both grids                                               |    82 |  B   |   P4    |                                                                                                                                                      |
|   51 | G05-08 | `planRow` builds its row once                                                                   |    82 |  B   |   P5    |                                                                                                                                                      |
|   52 | G08-07 | One prospect module, one transaction wrapper                                                    |    81 |  B   |   P7    |                                                                                                                                                      |
|   53 | G02-09 | The approval review through the kit                                                             |    80 |  B   |   P3    |                                                                                                                                                      |
|   54 | G01-02 | One DataList fed a column definition, not a table and a card list per screen                    |    78 |  B   |   P2    |                                                                                                                                                      |
|   55 | G04-02 | Both calendar arrangements written once                                                         |   155 |  Q   |   P4    | The ~19 here is firm; the outside-the-year block is product question B8.                                                                             |
|   56 | G04-04 | The calendar's presentation layer is three formatters it already has                            |    73 |  B   |   P4    |                                                                                                                                                      |
|   57 | G04-05 | `oxford-year.ts` stops re-implementing `calendar.ts`                                            |    73 |  B   |   P4    |                                                                                                                                                      |
|   58 | G05-09 | the board read without eleven hand-written folds                                                |    73 |  B   |   P5    |                                                                                                                                                      |
|   59 | G05-11 | the intake form's dead branches and one validation table                                        |    73 |  B   |   P5    |                                                                                                                                                      |
|   60 | G06-08 | `player-record.ts`: seven queries for one season's facts                                        |    73 |  B   |   P6    |                                                                                                                                                      |
|   61 | G02-10 | One FormData draft reader and one action wrapper                                                |    72 |  B   |   P3    |                                                                                                                                                      |
|   62 | G06-05 | One guarded server action instead of ten                                                        |   120 |  C   |   P6    |                                                                                                                                                      |
|   63 | G09-03 | One token-form control and one status lookup on the player home                                 |   116 |  C   |   P7    |                                                                                                                                                      |
|   64 | G04-01 | One bucketed list fed a column definition                                                       |    68 |  B   |   P4    |                                                                                                                                                      |
|   65 | G09-04 | One answer writer and one question-response upsert                                              |   112 |  C   |   P7    |                                                                                                                                                      |
|   66 | G06-09 | Three record lists, one divided list                                                            |    66 |  B   |   P6    |                                                                                                                                                      |
|   67 | G07-04 | The merge preview hands over the comparison rows                                                |    65 |  B   |   P6    |                                                                                                                                                      |
|   68 | G01-03 | One field-descriptor table in the template change plan, not six parallel constructs             |    64 |  B   |   P3    |                                                                                                                                                      |
|   69 | G04-07 | One shell refusal screen for four                                                               |    63 |  B   |   P4    |                                                                                                                                                      |
|   70 | G10-06 | One adapter for the nine server actions                                                         |   103 |  C   |   P8    |                                                                                                                                                      |
|   71 | G02-05 | One preamble for the three approved-event writes                                                |    95 |  C   |   P3    |                                                                                                                                                      |
|   72 | G03-07 | One vocabulary, one clock                                                                       |    57 |  B   |   P4    |                                                                                                                                                      |
|   73 | G03-08 | One calendar arrangement pair                                                                   |    54 |  B   |   P4    |                                                                                                                                                      |
|   74 | G08-04 | One fill-if-blank, one validation table, across both recruit doors                              |    90 |  C   |   P7    |                                                                                                                                                      |
|   75 | G09-02 | One public-token write helper for the three action files                                        |    90 |  C   |   P7    |                                                                                                                                                      |
|   76 | G01-04 | One action-form helper and one state builder                                                    |    53 |  B   |   P2    |                                                                                                                                                      |
|   77 | G04-06 | One `ActionForm` for the three auth forms, and 31 others                                        |    53 |  B   |   P2    |                                                                                                                                                      |
|   78 | G10-07 | Two history readers, one entry mapper                                                           |    80 |  C   |   P8    |                                                                                                                                                      |
|   79 | G06-07 | The onboarding services: one activity-log read, and the readers nothing calls                   |    95 |  Q   |   P6    | ~60 firm; the four readers only tests call are product question A6.                                                                                  |
|   80 | G09-06 | One field table and one write path in provenance.ts                                             |    74 |  C   |   P7    |                                                                                                                                                      |
|   81 | G08-08 | Questionnaire B's screens and questions stop being written out longhand                         |    73 |  C   |   P7    |                                                                                                                                                      |
|   82 | G09-05 | One contact-slot table and one emergency-contact writer                                         |    72 |  C   |   P7    |                                                                                                                                                      |
|   83 | G05-07 | one list component for the table-and-cards pair                                                 |    42 |  B   |   P5    |                                                                                                                                                      |
|   84 | G10-08 | Fold `findOperatorCandidates` into `findPersonDuplicates`                                       |    76 |  Q   |   P8    | Gated on product question D6 (which duplicate matcher is the club's).                                                                                |
|   85 | G08-09 | The public form stops repeating itself                                                          |    61 |  C   |   P7    |                                                                                                                                                      |
|   86 | G05-10 | one action helper instead of ten hand-rolled ones                                               |    36 |  B   |   P5    |                                                                                                                                                      |
|   87 | G09-07 | One token GET surface helper for the three public pages                                         |    60 |  C   |   P7    |                                                                                                                                                      |
|   88 | G08-10 | One unusable-link screen and one terminal panel                                                 |    27 |  B   |   P7    |                                                                                                                                                      |
|   89 | G08-11 | One phone card for both boards                                                                  |    26 |  B   |   P5    |                                                                                                                                                      |
|   90 | G08-12 | One gate-and-refuse for a page, one outcome for an action                                       |    20 |  B   |   P2    |                                                                                                                                                      |
|   91 | G08-13 | One ask button and one confirm dialog for the whole application                                 |    16 |  B   |   P5    |                                                                                                                                                      |
|   92 | G08-14 | One board engine for the roster and the recruit board                                           |     8 |  B   |   P5    |                                                                                                                                                      |
|   93 | G05-06 | one CSV import spine                                                                            |     3 |  B   |   P4    |                                                                                                                                                      |

## 5. Execution order — packages 2 to 9

One commit per package, the measure before and after in the commit body, `npm run verify` green at each, the gate project where a package touches a loader or pilot path. The order puts the shared pieces first so every later package adopts rather than invents, then works the areas from the largest saving over risk to the smallest. Each package lists its proposals by id; the appendix carries the detail.

| Package                                              | Scope                                                                                                                                                                                                                                                                                                                                      | Proposals                                                                                           |     Expected saving |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------: |
| P2 Shared pieces and deterministic deletions         | Write pieces 1–10 of § 3 once, each with two first adopters (events list and people table for `DataList`; the three auth forms and delete-draft for `ActionForm`; the events and roster actions for `guardedAction`); delete every function Appendix B lists that is not behind a product question; drop the unnecessary `export` keywords | G01-02, G01-04, G02-04, G02-06, G04-06, G05-05, G06-06, G07-03, G08-12, G10-05, G11-07 + Appendix B |              ~1,400 |
| P3 Events                                            | The two form editors over one values record; the event page's one read, data-driven facts and actions, one ladder, one gate; the template change plan as a table; the approved-event writes' one preamble                                                                                                                                  | G01-01, G01-03, G02-01/02/03/05/07/08/09/10                                                         |              ~1,100 |
| P4 Register, participation, import, calendars, shell | One filter bar; the register's three lists over `DataList`; one participants read; the CSV plan as a rule table; both calendar arrangements once; the shell's one refusal screen; `oxford-year` over `calendar`                                                                                                                            | G03-01…08, G04-01/02/03/04/05/07, G05-06                                                            |              ~1,500 |
| P5 The boards                                        | The board engine (§ 3 #11) and both boards over it; the roster's cell-commit table and seven commits as specs; the recruit board's accessor columns, banded head, phone card; the intake form's validation table                                                                                                                           | G05-01/02/03/04/07/08/09/10/11/12, G08-03/05/11/13/14                                               |              ~1,600 |
| P6 Player record, onboarding, people                 | The season band as a field list; the record view's action table; the two queues' one query plumbing; the person field table driving edit, action and merge; one read layer; the onboarding services' one activity read                                                                                                                     | G06-01/02/03/04/05/07/08/09, G07-01/02/04                                                           |              ~1,800 |
| P7 Recruitment doors and the player's pages          | The QR encoder from `qrcode-generator`; add-a-recruit's one payload; one fill-if-blank and one validation table for both doors; step 1's field table; one token write helper and one token GET helper; one answer writer                                                                                                                   | G08-01/02/04/06/07/08/09/10, G09-01…07                                                              |              ~1,650 |
| P8 Administration, messaging, report                 | One administration core; three action panels as one; four page shells over one column definition; one administration-events file; the nine actions' one adapter; the messaging schedule's one `SettingRow`; the report's one `PersonGrid`; the guide as marked-up strings                                                                  | G10-01/02/03/04/06/07/08, G11-01…06                                                                 |              ~1,800 |
| P9 The kit, the theme and the preview                | The kit's three duplicated pairs collapsed; `SortableHeader` takes the link shape; and, if A1 is answered yes, `git rm -r src/app/design-preview` with the three `eventTypeLabel` wrappers it was the last caller of                                                                                                                       | G12-03; G12-01 gated on A1                                                                          | 113 (4,564 with A1) |

Rules that hold for every package, from the ticket: the app functions the same (every route renders the same thing for the same data; every action produces the same rows and sentences; every refusal fires on the same condition); no product or UX change without a product question answered; tests are repointed to assert the same behaviour over the new shape, never deleted or weakened, and the PR body names every repointed test; a package that does not lower the count is not a package; the carve-outs stay untouched; no file another open ticket is editing (LAN-285's children own `delivery.ts`, `messaging-scheduler.ts` and `src/lib/delivery/**`; LAN-227 owns speed and LAN-301 the Hudl seed).

Where a proposal deletes a function together with the test that was its only caller (P2's deterministic half, G05-05, G06-07, G10-05, G11-07), the PR says so line by line: that is a deletion of a test with the code it tested, not a weakening of a behaviour the application has.

## 6. Product questions — for Brian, not decided here

Forty-eight questions came back. They are grouped by what kind of answer they need; each names the sections that raised it, the lines at stake, and the Lead's recommendation so the read is quick. None is built until answered; a "no" strikes the item and costs nothing else.

### A. Surfaces to keep or delete

1. **The design-preview routes** (`src/app/design-preview/**`, 4,515 lines, 30 files — G12). Sixteen routes in the deployed application that nothing imports, tests, scripts, links or walks; their README says the branch was "never to be merged"; their index page states three decisions as pending that shipped in LAN-231–235; they duplicate live logic and have already drifted from it (a `.replace("Sept", "Sep")` the live table does not have; three hand-typed status maps the kit owns). Two of the routes, `player-details` and `player-agreement`, call `gateShellPage` with no capability and render a real seeded player's date of birth, mobile, personal email and emergency contact unredacted, where the live record requires `person_record_authority` and redacts (finding F4). What is lost: the ability to re-run `docs/ux/review/design-mockup-2026-09/capture.mjs`; its 35 PNGs are committed. The kit gallery under `(operator)/kit` shows 27 of the kit's 41 exports and is not maintained (G12 q4). _Recommendation:_ delete the tree; the mockups it drew are captured under `docs/ux/review/design-mockup-2026-09/` and the kit page's job is done by the kit's tests.
2. **`/dashboard`** (51 lines — G04 q1). Its own header calls it "not a real screen"; design-system § 8 lists it as an open finding (B7). _Recommendation:_ delete, with its test and the two route-protection rows.
3. **The operator guide's length** (`admin/guide/content.ts`, 484 lines — G11 q5). No workflow row reaches `/operate/admin/guide`; G11-04 re-encodes it without cutting a word (−131). _Recommendation:_ take G11-04; whether nine questions is the right length is separate.
4. **A second Monday report** (`design-preview/(operator)/report/report-preview.tsx`, 708 lines — G11 q2). It re-renders the real report and differs on purpose. Falls with A1.
5. **Reading a past committee year's holders** (`role-detail.ts`, 40 lines of G10-05's 158 — G10 q3). No route passes `cycleId`. _Recommendation:_ delete; it is new UX if wanted.
6. **Four onboarding readers only tests call** (G06-07, ~35 of its 95). _Recommendation:_ delete with their tests.
7. **The fact-dispute raise and settle pair** (`person-fact-dispute.ts`, 104 lines plus its 222-line test — § 2.3). No screen raises or settles a dispute; the details page reads open ones and says the clause was retired in LAN-230. _Recommendation:_ if the M7 W7 workflow is retired, delete the writers and the readers with it; if it is missing its screen, that is a ticket, not this one.
8. **The weekly report's stored-snapshot readers** (`weekly-report/read.ts`, three functions — G11 q4). Called only by tests and the slice walkthrough. _Recommendation:_ keep `generateWeeklyReport` (the walkthrough proves it), delete the three readers.
9. **The roster board's inert column redaction** (`board-columns.ts`, ~55 lines — G05 q6). Every column requires the capability the page already gates on, so nothing can ever be redacted. _Recommendation:_ keep; it is a security-posture decision, and the lines are cheap.
10. **`permissionsLine`** (G10 q4) and **the worked example's warning** (G11 q3): computed, never rendered. _Recommendation:_ delete both.

### B. Two screens answer one question differently

1. **Who is coming and who turned up** (G03 q1): the register groups Recruits / Attending / Everyone else / Walk-ups and says "RSVP: Attending"; the event page's participation table lists flat, filters by four keys and says "Yes". Several hundred lines in two filter engines. _Recommendation:_ the register's grouping and words are the coach's; make the participation table read them.
2. **Two headline rows for one event** (G03 q2): Invited / Recorded / Walk-ups / Mismatches on the register; Invited / Said yes / Showed on the event page. G03-03 makes the derivation one; the displays stay unless Brian picks one.
3. **Mismatch or discrepancy** (G03 q4): one idea, two names, three class lists. _Recommendation:_ "Mismatch", the stored view's four classes.
4. **The player is told a different kind of event than the operator** (G01 q1, G09 q2): operators see the template's name, players see the enum word ("Game" for "Varsity"). _Recommendation:_ the template's name everywhere; delete `TYPE_LABELS`' three wrappers.
5. **Three filter idioms** (G06 q1) and **sorting that survives a reload or not** (G06 q2): the shared bar, the follow-ups' own row, the attendance band's funnels. _Recommendation:_ the shared bar with URL-carried sort everywhere; the funnels stay only on the boards.
6. **"Clear" means two things** (G06 q3): widen to everything, or back to the defaults. _Recommendation:_ back to the defaults, everywhere.
7. **Type against To-the-club on one people row** (G07 q3): a staff-only person reads `Player` in one column and blank in the other. _Recommendation:_ the membership tie is right; the Type column derives from it.
8. **Events outside the academic year** (G04 q3): the operator calendar shows a block, the public view shows nothing. _Recommendation:_ the public view gains the block.
9. **Two search controls at `/operate/events`** (G01 q4): the shared bar for operators, a bare field for a narrow attendance recorder. _Recommendation:_ leave the coach's bare field; it is a deliberate narrowing.
10. **The availability level's words** (G11 q1): Active / Limited / Unavailable on the report, Green / Orange / Red on the roster. _Recommendation:_ the report's words; the roster's colours already say the rest.

### C. Two words for one thing

1. "Sept" against "Sep" (G04 q2). _Recommendation:_ the repository's own month table (`SHORT_MONTHS`), one formatter.
2. "Not recorded" against "not recorded" (G08 q4, G11). _Recommendation:_ the kit's.
3. Four wordings for one event-status refusal (G02 q2). _Recommendation:_ `event-amendment/shared.ts`'s sentences.
4. Two refusals with one headline, shown together (G02 q1). _Recommendation:_ one card listing both missing things.
5. Two sentences for the five-minute rule (G01 q5). _Recommendation:_ "Enter it in five-minute steps."
6. Five sentences for a dead link (G09 q5). _Recommendation:_ keep the five; the kit member does not need the answer.
7. Two reason placeholders (G09 q4): one was rejected in review and survives on the other screen. _Recommendation:_ the surviving one.
8. One questionnaire, three names (G08 q7). _Recommendation:_ "Recruitment questionnaire".
9. Two wordings for each administration refusal (G10 q2). _Recommendation:_ `operator-administration/shared.ts`'s.
10. Three date forms on one person record (G07 q1). _Recommendation:_ the kit's `27 Aug 2026` / `27 Aug 2026, 14:22`.
11. One chase fact, two sentences (G06 q4). _Recommendation:_ the queue's bare date on the record too.
12. Two `formatDay`s, two failure behaviours on an unreachable path (G06 q5). _Recommendation:_ the rule-3 sentence.

### D. Two rules for one action

1. **Does a No need a reason?** (G09 q3): the RSVP page refuses a blank reason; the player's home records "No reason given" from a one-tap No. _Recommendation:_ the one-tap No is the newer, owner-reviewed behaviour; the RSVP page follows it.
2. **The default length has two rules** (G01 q2): eight picker options against any five-minute multiple. _Recommendation:_ the validator is the rule; the picker offers the eight and shows a stored ninth.
3. **A template that does not say produces Optional** (G01 q3). _Recommendation:_ collapse the tri-state; nothing distinguishes it today.
4. **"Known as" promotes on one door and not the other** (G08 q5). _Recommendation:_ the sign-up door's rule on both.
5. **The cancellation notify default in two places** (G02 q3): they agree; fold is proposed. No decision unless they are meant to differ.
6. **Two duplicate-person matchers, three candidate rows** (G05 q1, G05 q2, G07, G08, G10 q1, G10-08): `findPersonDuplicates` on four doors, `findPersonCandidates` on two, the invite screen's own third; the kit's `CandidateRow` rendered nowhere. ~250 lines. _Recommendation:_ one matcher (`findPersonDuplicates`), one `CandidateRow` with a submit action, on all six doors.

### E. Appearance changes worth a look before they are made

1. The recruit board's empty state through the kit's `EmptyState` (G08 q2, q3): left-aligned, with the clear-filters link rule 5 wants.
2. The boards' phone card through `RowCard actions` (G05 q4): ~50 lines; padding, divider and title size change at 375px.
3. The roster heading through `PageHeader` (G05 q5): the title becomes the kit's size.
4. The availability dot through the theme's tokens (G05 q3): the only raw hex in the boards; the colour changes.
5. `CandidateRow` on the three doors (D6): the layout of two screens changes.
6. The approval review's `MetricRow` width (G02-09): a one-line visual decision.

### F. Defects found on the way (not simplifications)

1. The people table's missing-count link lands on an empty queue for anyone whose display name is an alias (G07 q4).
2. The person record's WhatsApp row is hardcoded to "not recorded" and the edit form's seam warning can never fire, while the consent table holds the real state (G07 q2).
3. The recruit board's "edit on the record" caption links to a record that renders every Person field read-only (G08 q6).
4. **Two design-preview routes show restricted person fields to any active operator.** `src/app/design-preview/player-details/page.tsx:60` and `player-agreement/page.tsx:34` gate on no capability and render a seeded player's date of birth, mobile, personal email and emergency contact unredacted; the live record route requires `person_record_authority` and redacts, and `person-authority.ts` classes those fields as restricted (G12 q2). This is an owner decision today, independent of the ticket: delete the folder (A1), or gate the two routes. No agent changes a permission line.

## 7. Not proposed, and why

- **The carve-outs** (7,225 lines): read wherever a section needed them, nothing proposed, nothing moved into them.
- **The tests** (326 files): the proof, not a target. Repointed where a shape changes, named in the PR; deleted only with a function nothing else calls, and said so.
- **The events services, `event-periods`, `event-input`'s validator, `planOrApply`, the two public-tier queries** (G01): honest, and the analyst says why in "Not proposed".
- **The service barrels** (`index.ts`, 487 lines): they front 44 importers; deleting them costs more import lines than they weigh.
- **The public calendar's two grids** (G04): the arrangements are shared (G04-02); the grids themselves are the smallest thing that draws them.
- **`validateEventDraft` and its siblings as a schema library**: a custom message per field plus the cross-field rules is the same line count plus a dependency. The field-table proposals (§ 3 #12) get the saving without the dependency.
- **Moving `src/app/participation/` into the kit** (G03): the rule says it belongs there; the move saves nothing and is not a package.
- **Runtime**: LAN-227 owns speed. Where a rewrite is also faster, the section says so in one clause (G02-02's one read for the event page, G06-08's one query for a season's facts, G03-03's one participants read, G11-05's one count query); none is proposed for speed.

## 8. What execution must show

Per the ticket's acceptance: every item here either done or left with a stated reason; the code lines before and after in the PR body, per package and overall, lower at every package; the same tests green at the head with every repointed test named; the base-versus-head screenshot pairing at desktop and 375px over every touched route, differences listed or "identical"; the product questions returned above, not decided; no protected path, no carve-out, no hosted access. Review grade Highest: the reviewer plans a test-side or mocked-authority injection route for the administration boundary and the public token pages, since the runtime refused an authorization-line edit in LAN-300's review.

The measure that the PR restates is `npm run measure` at the base and at each package's head, and the number that matters to Brian is the first row of § 0.

---

# Appendix — the twelve sections

Each section was written by one Opus-class analyst over its own files, then read and reconciled by the Lead. Proposal ids (`G05-03`) are the ones the ranked list uses. Where a section's "Lines now" was measured before the counter's JSDoc correction, the corrected figure is given first and the section's original figure in brackets; the savings are the section's own estimates and do not depend on the correction.

---

## G01 — Events: list, create, edit, templates, and the events services

Lines now: 6048 (measured as 6213 before the JSDoc correction). Lines after everything proposed: 5618. Saved: 595 (9.6%).

That number is net of 249 lines of new shared code this section pays for in full
(`DataList` 90, `useFormValues` 35, `action-form` 45, `LinkMenuButton` 45,
`ConfirmDialog` 34). Every one of those has call sites outside this section that
the Lead should count against other sections: 15 files render the desktop-table

- phone-card pair (`git grep -l DesktopOnly src/app`), 17 declare a form-state
  record (`find src/app -name '*-state.ts'`), 10 hand-write `text(formData, field)`
  (`git grep -l 'function text(formData'`), 5 hand-build a confirm dialog
  (`git grep -l DialogActions src`). Counted against the whole application these
  five pieces remove far more than the 595 here.

The services are the honest surprise. `src/lib/services/events/**` and
`event-periods.ts` are close to their smallest shape already and I propose
almost nothing in them. The over-building is concentrated in three places: the
two form editors thread every field through a hand-written prop wall; every list
writes its desktop table and its phone cards twice; and
`event-templates/change-plan.ts` states the same six inherited fields in six
parallel constructs.

### Files read

All 44 files in the brief.

### Modules

| Module or surface                                                                                                                                                                                   | Lines now | What it does                                                                                            | Proposed shape                                                                                                                                                                                                                                 | Lines after | Tests that prove it                                                                                                                                                       | Risk, and how it is caught                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events aggregate — `events/{index,shared,read,public-tier,write}.ts`                                                                                                                                |       861 | The operator and public reads of one event and the season's list, and drafting/editing/deleting a draft | keep — one `toEventBase(row)` shared by `toListEntry` (`events/read.ts:139`) and `toPublicEntry` (`events/public-tier.ts:77`), which repeat 11 of the same field assignments; nothing else                                                     |         849 | `src/lib/services/events.test.ts` (1667 lines), `events-public-tier.test.ts` (291)                                                                                        | A dropped column on one tier. `PUBLIC_EVENT_COLUMNS` is asserted against `PARTICIPATION_TABLES` by `events-public-tier.test.ts`, so a public read reaching a participation table fails there |
| `event-input.ts`                                                                                                                                                                                    |       207 | The event vocabulary and `validateEventDraft` — every rule one submitted form must satisfy              | keep — fold the two copy-pasted time branches (`event-input.ts:121-144`) into one `checkTime(field, raw)`; the rest is already the smallest shape a rule table would not beat                                                                  |         195 | `event-input.test.ts`, `src/app/operate/events/actions.test.ts:313`                                                                                                       | A changed message. Both tests assert on the exact sentences                                                                                                                                  |
| `event-periods.ts`                                                                                                                                                                                  |       151 | Which period a list shows and which table inside it an event lands in                                   | keep — `PERIOD_BUCKETS`/`BUCKET_LABELS` are already the declarative table; `periodBounds` computes per arm and no lookup expresses it                                                                                                          |         151 | `event-periods.test.ts` (409 lines)                                                                                                                                       | None proposed                                                                                                                                                                                |
| Event questions — `event-questions.ts`, `event-questions-input.ts`                                                                                                                                  |       211 | What a question is, the rules one must satisfy, and the read/write of `event_questions`                 | rewrite as one read — delete `readTemplateQuestionsAsEventInputIn` (`event-questions.ts:91-114`) and map the questions `readEventTemplateIn` already read (see `event-templates/read.ts:125-136`)                                              |         192 | `event-questions.test.ts` (587), `event-templates.test.ts` inheritance cases                                                                                              | A draft created with the wrong questions. `event-templates.test.ts` covers inheritance per template; `events.test.ts` covers create-with-questions                                           |
| `event-vocabulary.ts`                                                                                                                                                                               |       104 | The club's words for an event and how its dates read                                                    | keep, and absorb — takes `formatDeadline`, `formatPlanWhen` and `formatTermAndWeek` out of the route's `presentation.ts`, sharing one `part(options)` closure with `formatShortDate`/`formatLongDate`                                          |         116 | `src/app/operate/labels.test.ts`, `screens.test.tsx:2887` (the 12-hour clock), follow-ups tests for `formatDeadline`                                                      | A date reading differently on one screen. `labels.test.ts` pins the label tables against the enums; the three formatters have assertions in `follow-ups` and `[id]` screen tests             |
| Event templates service — `event-templates/{index,shared,read,write,change-plan}.ts`, `event-template-input.ts`                                                                                     |      1245 | What each kind of event starts as, and what changing a template will touch                              | rewrite the change plan's per-field machinery as one descriptor table; write the template's audience-group and question inserts once (see G01-03)                                                                                              |        1132 | `event-templates.test.ts` (1393 lines)                                                                                                                                    | A draft taking a change it should hold, or holding one it should take. `event-templates.test.ts` has the W8-03 taking/holding cases per field                                                |
| Events list route — `page.tsx`, `presentation.ts`, `events-list-support.ts`, `event-filters.tsx`, `operator-list.tsx`, `create-menu.tsx`, `edit-templates-button.tsx`, `event-actions.tsx`          |       804 | W1's list: period tables, filters, the three counts, and the create/templates/approve controls          | rewrite `operator-list.tsx` over `DataList` (G01-02); one `emptyStateFor()` replacing the same three conditions written three times; `create-menu.tsx` over a kit `LinkMenuButton`; `presentation.ts` keeps its words and loses its formatters |         717 | `screens.test.tsx:533-1007` (UX-30, the Status column, the counts, filters)                                                                                               | A column or a count disappearing on one viewport. The screen tests assert on `event-row`, `event-card` and `showed-against-invited` at both                                                  |
| Coach list — `coach-event-list.tsx`, `coach-event-buckets.ts`, `coach-eligible-events.tsx`                                                                                                          |       216 | LAN-110's single coach destination at `/operate/events`                                                 | keep — delete `shiftDays` (`coach-event-buckets.ts:26`, no production caller; `addDays` in `services/calendar.ts:39` is the same function) and inline `londonToday`'s one-line alias of `todayInClubZone`                                      |         208 | `coach-event-buckets.test.ts` (270), `src/app/operate/shell.test.tsx:1046-1190`                                                                                           | Both helpers are used by those tests; repointing them to `addDays`/`todayInClubZone` is the whole change                                                                                     |
| Event form — `event-form.tsx`, `event-core-fields.tsx`, `venue-field.tsx`, `question-editor.tsx`, `date-time-controls.ts`, `form-state.ts`, `new/page.tsx`, `actions.ts`                            |      1179 | W4's draft-an-event form, both modes, and its server actions                                            | rewrite the form over one values record (G01-01); actions over one `action-form` helper (G01-04); `venue-field.tsx` and `date-time-controls.ts` keep — each does one job once                                                                  |        1078 | `screens.test.tsx:1008-1145, 1576-1638, 2705-2994`, `actions.test.ts` (705), `venue-field.test.tsx` (330), `question-editor.test.tsx` (264), `date-time-controls.test.ts` | The template's field-by-field fill (D40–D47) is the fragile part. `screens.test.tsx:2705` walks a type change field by field and asserts which values move and which are kept                |
| Templates routes — `templates/{page,presentation,form-state,actions,template-editor,template-form-fields,template-change-plan}.tsx/ts`, `templates/new/page.tsx`, `templates/[templateId]/page.tsx` |      1235 | W8: the template list, one template, what saving it will touch, and the writes                          | rewrite the editor over one values record (G01-01) and the list over `DataList` (G01-02); one `ConfirmDialog` for the save and delete dialogs; one state builder in `actions.ts`; two local panels in `template-change-plan.tsx`               |         980 | `templates/screens.test.tsx` (943), `templates/actions.test.ts` (255)                                                                                                     | The confirmation and the write must stay the same computation. `planOrApply`'s single-function shape is untouched by every proposal here                                                     |

### Proposals

#### G01-01 — One values record per form editor, not nine useStates and a prop wall (saves ~218)

- Now: both editors hold one `useState` per field and thread each value and its
  setter into a sibling that only lays them out. `event-form.tsx:96-114` is nine
  `useState` declarations; `event-form.tsx:186-209` passes 19 props;
  `event-core-fields.tsx:39-79` declares those 19 names twice (destructure, then
  type). `changeTemplate` (`event-form.tsx:126-148`) then writes D41's rule once
  per field — ten `if (x === was.y) setX(now.y)` lines. `template-editor.tsx`
  repeats the whole shape: ten `useState` (`:106-118`), eight hidden inputs
  (`:143-150`), and a 14-prop boundary into `template-form-fields.tsx:27-60`.
  Together 469 + 554 = 1023 lines, of which roughly 150 are the plumbing between
  two halves of one form.
- Smallest honest shape: one hook, `src/lib/forms/use-form-values.ts`:

  ```ts
  export function useFormValues<T extends Record<string, string>>(initial: T) {
    const [values, setValues] = useState<T>(initial);
    const set = useCallback(
      <K extends keyof T>(field: K, next: T[K]) =>
        setValues((current) => ({ ...current, [field]: next })),
      [],
    );
    return { values, set, setValues };
  }
  export function hiddenFieldsFor<T extends Record<string, string>>(values: T) {
    return Object.entries(values).map(([name, value]) => (
      <input key={name} type="hidden" name={name} value={value} />
    ));
  }
  ```

  `EventCoreFields` and `TemplateEventFields` then take four props —
  `{ values, set, state, busy }` — instead of 19 and 14. `changeTemplate`
  becomes one loop over a `TEMPLATE_FILLED_FIELDS` list (`["deliveryMode",
"venue", "description", "requiredEquipment", "attendance"]`) asserting the
  same condition: `if (values[f] === was[f]) set(f, now[f])`. The `endsAt`
  special case (`event-form.tsx:139-141`) stays written out, because it is a
  different rule.

- Behaviour held by: `src/app/operate/events/screens.test.tsx:2705-2886` (the
  template fills the form field by field, and an operator-written field keeps
  its value), `:1008-1145` (creating), `:1576-1638` (editing),
  `:2887-2994` (the date/time pickers), `templates/screens.test.tsx:314-682`
  (one template, the duration grid, the colour palette, the audience groups).
  Not pinned today: that `hiddenFieldsFor` emits exactly the names the actions
  read. Adding one assertion per editor that the posted `FormData` keys match
  the action's `readDraft`/`readTemplate` fields is the missing test, and it is
  worth adding with this rewrite.
- Lines: 1023 → 840, because the two prop walls (65 + 46 lines of interface and
  call site) collapse to ~24, nineteen `useState` lines collapse to 2, sixteen
  hidden inputs collapse to 2, `changeTemplate`'s ten lines to 4 — and the hook
  costs 35 once.
- Risk: a field silently stops being posted, or D41's "untouched takes the new
  default" fires on a field it should not. The first is caught by the
  `FormData`-keys assertion above plus the action tests
  (`actions.test.ts:313`, which asserts entries survive a validation failure);
  the second by `screens.test.tsx:2705`, which walks every filled field.
- Repointed tests: none change their assertions. `question-editor.test.tsx` and
  `venue-field.test.tsx` render those components directly and are untouched.
- New dependency: none.

#### G01-02 — One DataList fed a column definition, not a table and a card list per screen (saves ~78 here, and 13 more files elsewhere)

- Now: `operator-list.tsx` renders eight facts twice — a desktop table
  (`:50-132`, of which `:55-93` is eight near-identical `SortableHeader` blocks
  and `:99-126` the cells) and a phone card list (`:135-162`) repeating the same
  eight facts as `sublines`. `templates/page.tsx` does the same for four facts
  (`:73-91` cards, `:93-133` table). The two halves in each file can drift
  independently; `docs/ux/standards.md` rule 7 is the reason they must not.
- Smallest honest shape: `src/components/data-list.tsx`, a kit member beside
  `row-card.tsx` and `sortable-header.tsx` it composes:

  ```tsx
  export interface Column<T> {
    key: string;                      // sort key, and the React key
    label: string;
    sortable?: boolean;
    align?: "left" | "right";
    cell: (row: T) => ReactNode;      // the desktop cell
    card?: "title" | "trailing" | "chips" | "subline" | "none"; // the phone role
  }
  export function DataList<T>({ columns, rows, rowHref, sortLinkFor, sort,
    direction, ariaLabel, rowTestId, cardTestId }: DataListProps<T>) { … }
  ```

  `operator-list.tsx` becomes the eight column descriptors plus its bucket
  heading loop; `templates/page.tsx` becomes four descriptors plus the page
  shell. Where a phone card says something the table does not (the events list's
  combined `Invited · Said yes · Showed` subline,
  `operator-list.tsx:155-158`), the descriptor carries both: `cell` for the
  table, `card: "subline"` with its own renderer.

- Behaviour held by: `screens.test.tsx:533-812` asserts on `event-row`,
  `event-card`, `showed-against-invited` and every column's words at both
  viewports; `:813-1007` asserts the sort links carry the filters;
  `templates/screens.test.tsx:177-313` asserts `template-row`,
  `template-card` and `template-card-facts`. The test ids above are the
  contract `DataList` must keep emitting.
- Lines: 323 → 245 (`operator-list` 179 → 65, `templates/page` 144 → 80), plus
  `DataList` at 90 counted once here.
- Risk: a column present on desktop and missing on the phone, or a sort link
  losing a carried filter. Both are asserted by the screen tests named above,
  and the screenshot pair at 375px is the second check.
- Repointed tests: none. Every assertion is by test id or visible text, and
  `DataList` emits the same ids.
- New dependency: none.

#### G01-03 — One field-descriptor table in the template change plan, not six parallel constructs (saves ~64)

- Now: `event-templates/change-plan.ts` states the same six inherited fields six
  times: `INHERITED_FIELDS` (`:112-119`), `labelOf` (`:123-125`), `readValue`
  (`:128-133`), `impliedValue` (`:138-158`, a switch), `heldValue`
  (`:160-175`, a second switch), and `COLUMN_OF` (`:177-184`). `EMPTY_DRAFT`
  (`:487-500`, 14 lines) exists only so two sets of defaults can be compared
  through `impliedValue`, which needs a draft it does not use. The "endsAt is
  not a straight copy" rule is then restated at `:153-157`, `:284-295`, `:337`
  and `:367`. Separately `asDate` (`:102-109`) is a byte-for-byte copy of
  `events/shared.ts:67-74`, and `listAudienceCatalogueIn` is called twice for
  the same draft in one loop iteration (`:350` in the plan pass, `:396` in the
  apply pass).
- Smallest honest shape: one table whose entries carry every per-field answer:

  ```ts
  const INHERITED: readonly InheritedField[] = [
    {
      field: "deliveryMode",
      label: "Where",
      column: "delivery_mode",
      given: (d) => d.deliveryMode,
      held: (r) => r.delivery_mode,
      read: (v) => (v === "online" ? "Online" : "In person"),
    },
    // venue, requiredEquipment, description, isMandatory …
    {
      field: "endsAt",
      label: "End time",
      changeLabel: "Default length",
      column: "ends_at",
      moved: (b, a) => b.durationMinutes !== a.durationMinutes,
      given: (d, startsAt) => startsAt && endTimeFromStart(startsAt, d.durationMinutes),
      held: (r) => r.ends_at?.slice(0, 5) ?? null,
      read: durationText,
    },
  ];
  ```

  `given` takes `startsAt: string | null` rather than a whole `DraftRow`, so
  `EMPTY_DRAFT` goes; `moved` is the per-field "did the default change"
  predicate, so the `field === "endsAt"` branch at `:284-295` goes; `changeLabel`
  carries the one place endsAt prints "Default length", so `:367`'s ternary goes.
  `asDate` is imported from `events/shared.ts`. The catalogue is read once per
  draft above the `if (!apply)` line and used by both passes.

- Behaviour held by: `src/lib/services/event-templates.test.ts` (1393 lines) has
  W8-03's taking/holding cases per field, including the endsAt-from-duration case
  and the dateless draft that is "nothing to move, not held"
  (`change-plan.ts:337`). `templates/screens.test.tsx:683-934` asserts the
  confirmation's sentences.
- Lines: 598 → 534, because 87 lines of parallel per-field code become ~38, the
  duplicated `asDate` and the second catalogue read go, and three restatements of
  the endsAt rule become one table entry.
- Risk: a field's implied value computed from the wrong side, which would move a
  draft that should hold its own. The per-field taking/holding tests are the
  check, and they assert the reason sentence as well as the outcome.
- Repointed tests: none — `planEventTemplateChange` and `saveEventTemplate` keep
  their signatures and `TemplateChangePlan` is unchanged.
- New dependency: none.

#### G01-04 — One action-form helper and one state builder (saves ~53 here, ~160 app-wide)

- Now: `events/actions.ts` and `templates/actions.ts` each hand-write
  `text(formData, field)` (`events/actions.ts:24-27`,
  `templates/actions.ts:25-28`), `messageFor` (`:46-50`, `:65-69`) and a
  `strings(field)`/question reader (`:53-72`, `:46-63`) that differ only in the
  `questionsPresent` gate and the `fromTemplate` value. Then every early return
  rebuilds the whole state record by hand: five six-field literals in
  `events/actions.ts` (`:92-98, 111-117, 136-142, 153-159`) and six seven-field
  literals in `templates/actions.ts` (`:91-99, 119-127, 129-137, 156-165,
192-201, 225-233`). Ten files in `src/app` hand-write the same `text`.
- Smallest honest shape: `src/lib/forms/action-form.ts` exporting `text`,
  `strings`, `messageFor`, `readQuestionRows(formData, { gated, fromTemplate })`
  and one state builder per shape:

  ```ts
  export function formStateFrom<S extends object>(base: S) {
    return (patch: Partial<S>): S => ({ ...base, ...patch });
  }
  ```

  With `const state = formStateFrom(EMPTY_TEMPLATE_FORM_STATE)`, each early
  return becomes one line: `return state({ error: messageFor(error), values:
outcome.raw, questions: outcome.rawQuestions })`. `EMPTY_FORM_STATE` and
  `EMPTY_TEMPLATE_FORM_STATE` already exist in the two `form-state.ts` files and
  are the right bases.

- Behaviour held by: `src/app/operate/events/actions.test.ts` (705 lines) —
  every action's refusal, its validation-failure shape with entries intact
  (`:313`), the service refusal that is shown versus the authorization refusal
  that is rethrown (`:358`), and where each action leaves the operator
  (`:402`). `templates/actions.test.ts` (255) pins both redirects.
- Lines: 393 → 340, plus the shared module at 45 counted once here. The
  per-file saving is small; the reason to do it is that the same 45 lines
  delete roughly the same amount in eight other action files.
- Risk: a state field silently defaulting because a patch omitted it — which is
  exactly what the literals were guarding against by hand. The base constants
  make the default explicit, and `actions.test.ts:313` asserts the full returned
  state including `values` and `questions`.
- Repointed tests: none.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  none. Every control on these screens already comes from `src/components/`
  (`Field`, `SelectField`, `ChoiceField`, `DateField`, `TimeField`, `Section`,
  `FieldGroup`, `Notice`, `StatusChip`, `EmptyState`, `ActionBar`, `PageHeader`,
  `RowCard`, `RowCardList`, `DesktopOnly`, `TableFrame`, `Refusal`). There is no
  local copy of a kit member in these 44 files, and no component here re-wraps
  MUI without adding behaviour — `venue-field.tsx` wraps `Autocomplete` but adds
  the debounce, the sequence ticket and the seven-state helper sentence.
- Pieces two or more routes write that should become one component:
  - `src/app/operate/events/operator-list.tsx` + `templates/page.tsx` (+ 13
    more files app-wide) → **`src/components/data-list.tsx`** (G01-02).
  - `src/app/operate/events/create-menu.tsx` + `src/app/operate/roster/add-players-menu.tsx`
    are the same component with different words — the second says so in its own
    comment (`add-players-menu.tsx:9-11`) → **`src/components/link-menu-button.tsx`**
    taking `{ label, testId, choices: { href, label, detail }[] }`.
    59 + 60 → 14 + 14 plus 45 once: no saving in this section alone, 46 across the two.
  - `templates/template-editor.tsx:356-390` and `:393-428` are two confirm
    dialogs with one shape; `[id]/delete-draft.tsx` and three more files
    (`git grep -l DialogActions src`) build the same thing →
    **`src/components/confirm-dialog.tsx`** taking
    `{ open, onClose, title, body, confirm: { label, action, hiddenFields, colour } }`.
  - `src/app/{rsvp,me,a}/[token]/presentation.ts` each declare a 3-line
    `eventTypeLabel(eventType)` over this section's `TYPE_LABELS`. One function
    in `event-vocabulary.ts` replaces three — but see product question 1 first,
    because the word they print is the one the operator never sees.
  - Service-level, not components: `writeTemplateQuestionsIn` and
    `writeTemplateAudienceGroupsIn` belong in `event-templates/shared.ts` —
    `event-templates/write.ts:61-85` and `change-plan.ts:437-468` are
    byte-identical inserts. `insertAudienceMembersIn` belongs beside them —
    `events/write.ts:139-159`, `change-plan.ts:613-632` and
    `event-approval.ts`'s `saveEventAudience` are three copies of one statement
    (the first two say so in their comments). ~31 lines here, ~20 more in the
    event-approval section.
- Kit members this section needs changed to absorb a local copy: none.
  `RowCardList at="all"` and `RowCard actions` (used by
  `coach-eligible-events.tsx:95` and the attendance surfaces) already cover what
  these screens ask of the kit. `DataList` is an addition, not a change.

### Product questions

1. **A player and an operator are told a different kind of event.** Every
   operator surface prints the template's own name (`templateName`,
   `events/shared.ts:8`, "read live from the template — a rename is
   retroactive"); `/rsvp/[token]`, `/me/[token]` and `/a/[token]` print the
   seven-value enum word through `TYPE_LABELS`
   (`src/app/rsvp/[token]/presentation.ts:13-15` and the two siblings). A player
   invited to an event created from a template called "Varsity" is told "Game".
   `docs/ux/standards.md` rule 7 says a fact shown on more than one surface says
   the same thing; these two surfaces do not. A rewrite cannot pick: switching
   the player surfaces to `templateName` is a copy change on three public pages,
   and keeping both means `TYPE_LABELS` stays a second vocabulary for the same
   question.
2. **The default length has two rules.** `TEMPLATE_DURATION_OPTIONS`
   (`event-template-input.ts:198-200`) offers eight choices, 30 to 240 minutes;
   `validateEventTemplate` (`:136-155`) accepts any five-minute multiple from 5
   to 1440; and the editor shows a truthful ninth option for a stored off-grid
   value (`template-form-fields.tsx:108-110`). Either the picker is the rule and
   the validator narrows to it, or the validator is the rule and the picker is a
   shortcut. Simplifying either way changes what a template can hold.
3. **A template that does not say produces an event that says Optional.**
   `defaultIsMandatory` is deliberately tri-state (`event-template-input.ts:90`,
   "null is does not say"), but `templateDefaults` resolves null to `false`
   (`event-templates/shared.ts:52`) and the event form's Attendance control
   offers only Mandatory/Optional, opening on "optional"
   (`event-form.tsx:109-111`). So "the template does not say" and "the template
   says Optional" reach the operator identically. Collapsing the tri-state is the
   simplification; whether the club wants the distinction at all is not mine.
4. **Two search controls at one route.** `/operate/events` renders
   `EventFilters` over the shared `ListFilters` bar (search, two selects, sort,
   direction, a Filters toggle); the same route for a narrow attendance recorder
   renders `coach-eligible-events.tsx`'s own bare `Field` plus `useFilterSearch`
   (`:74-80`), with no filters and no sort, and its own two empty-state
   sentences (`:44-48`) beside the list's three
   (`events-list-support.ts:18-33`). Folding the coach list onto `ListFilters`
   would give a coach controls they do not have today; leaving it keeps two
   search controls and five empty-state sentences for one route.
5. **Two sentences for one five-minute rule.** "Enter the time in five-minute
   steps." (`event-input.ts:197`) and "Enter the length in five-minute steps."
   (`event-template-input.ts:150`). Same constraint, two screens, two strings.
   One sentence is a copy change, so it is a question, not a rewrite.

### Not proposed

- `src/lib/services/events/index.ts` (48) and `event-templates/index.ts` (21):
  pure re-export barrels, and the brief names them as a target — but 44 files
  import `@/lib/services/events` and the barrel also fronts `event-input` and
  `event-questions`, so deleting it adds at least one import line per importer.
  The 48 lines pay for themselves. Keep.
- `events/shared.ts` (68): not a types-only shim. `EVENT_SORT_COLUMNS`,
  `orderBy`, `TEMPLATE_JOIN`, `TEMPLATE_COLUMNS`, `asDate`, `asTime` are used by
  all three of `read`, `public-tier` and `write`. Keep.
- `listCurrentSeasonEvents` and `listPublicSeasonEvents` are not one query. The
  public tier's provable absence of `COUNT_COLUMNS` and `participationJoins` is
  `REQ-public-calendar`, asserted by `events-public-tier.test.ts` against
  `PARTICIPATION_TABLES`. Merging them would make that assertion unprovable.
- `validateEventDraft` (`event-input.ts:102-195`) stays hand-written. A schema
  library would need a custom message per field plus refinements for the three
  cross-field rules (end after start, joining link requires online, five-minute
  steps), which is the same line count plus a dependency.
- `requireValid` (`events/write.ts:338-352`) duplicates three of
  `validateEventDraft`'s rules and their messages on purpose — `createEventDraft`
  is exported and a script or test can build an `EventDraftInput` by hand. Keep.
- `planOrApply`'s single function for both the confirmation and the write
  (`change-plan.ts:239`) is the right shape and every proposal above leaves it
  alone. Two functions would be two opinions.
- `venue-field.tsx` (148), `date-time-controls.ts` (34), `question-editor.tsx`
  (209), `event-filters.tsx` (71), `event-actions.tsx` (42),
  `edit-templates-button.tsx` (15), `templates/presentation.ts` (83),
  `templates/new/page.tsx` (43), `templates/[templateId]/page.tsx` (79): each
  does one job once. `question-editor.tsx` already serves both the event and the
  template editor from one component.
- `presentation.ts` (233) keeps its ~46 word constants. They are the vocabulary
  `docs/ux/standards.md` rule 7 depends on, and one place for them is the rule,
  not over-building. Only the three date formatters move (to `event-vocabulary.ts`)
  and the 14-name re-export block (`:7-20`) is worth dropping when its importers
  are touched for another reason — on its own it breaks even against the extra
  import lines.
- `events/form-state.ts` (20) and `templates/form-state.ts` (22) stay two files.
  They are type declarations plus an empty constant; a generic
  `FormState<Raw, Issue, Extra>` would cost more in type parameters at 17 call
  sites app-wide than the 42 lines it replaces here. The Lead should still ask
  the section that owns the other 15 `*-state.ts` files whether the picture
  changes at that scale.
- Carve-outs read for context only, nothing proposed in them: `src/lib/db`
  (`withTransaction`, `Tx`, `NotFound`, `InvalidTransition`,
  `ConstraintViolated`, `isServiceError`), `src/lib/auth` (`requireCapability`,
  `operatorHasCapability`, `requireEventOperatorTier`,
  `isNarrowAttendanceRecorder`), `src/lib/services/delivery.ts`
  (`dispatchEventInvitations`, `DeliveryState`).
- Nothing in these 44 files is unreached. Every surface maps to M2 W1, W4 or W8
  in `docs/tester-week/workflow-map.md`, and the only dead export I found is
  `shiftDays` (`coach-event-buckets.ts:26`), which has no production caller and
  duplicates `addDays` in `src/lib/services/calendar.ts:39`.

---

## G02 — One event: detail, approval, audience, amend, cancel, messaging plan, share, roster form

Lines now: 6211 (measured as 6413 before the JSDoc correction). Lines after everything proposed: 5108. Saved: 1305 (20%).

### Files read

All 41 files in the brief. Read for context and proposed nothing in: `src/lib/db`
(`withTransaction`, `Tx`, `isServiceError`, `ConstraintViolated`,
`InvalidTransition`), `src/lib/auth/guards` and `capabilities`,
`src/lib/delivery/phone` and `/config` (reached from
`event-approval/read.ts:28-76`), `src/lib/services/delivery.ts`,
`src/lib/services/messaging-scheduler.ts`. Also read as neighbours this section
does not own, named below wherever a proposal needs a line in one:
`src/app/operate/events/presentation.ts` (300), `form-state.ts` (25),
`actions.ts`, `event-actions.tsx` (47), `src/lib/services/event-input.ts`,
`seasons.ts`, `event-vocabulary.ts`, `src/lib/club-time.ts`, and the kit
members in `src/components/`.

### Modules

| Module or surface                         | Lines now | What it does                                                                                                                                   | Proposed shape                                                                                                                              | Lines after | Tests that prove it                                                                              | Risk, and how it is caught                                                                                                                   |
| ----------------------------------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `[id]/page.tsx`                           |       163 | Reads an event nine ways and picks one of three screens (detail, audience step, review step).                                                  | Rewrite as one gated read plus a three-way switch: `readEventPage(id, want)` returns the whole bundle (G02-02).                             |          95 | `events/screens.test.tsx` UX-32/40/41/42/43 blocks (`:1292`, `:1837`, `:2138`, `:2156`, `:2278`) | A read dropped for a state that needs it renders an empty panel; every panel above has a testid assertion in `screens.test.tsx`.             |
| `[id]/event-detail-view.tsx`              |       450 | The whole event page in one component: header, 8 facts, audience, plan, history, questions, participation, 6 actions.                          | Rewrite the fact block and the action stack as data tables (G02-07); take its props as one bundle type (G02-02).                            |         340 | `events/screens.test.tsx:1292-1517`, `:1639`, `:1718`, `:2342`; `change-screens.test.tsx`        | A condition mistranscribed into the table shows an action to the wrong role; `screens.test.tsx:1639` and `:1718` assert per-role visibility. |
| `[id]/approval-review.tsx`                |       230 | The approval step: layout, two refusals, the review card.                                                                                      | Rewrite through the kit — `MetricRow`, `FactGrid`, `Refusal` — and stop re-rendering the audience shape (G02-09).                           |         150 | `events/screens.test.tsx:2156`, `:2138`, `:3140`                                                 | The hand-built grid's phone breakpoint differs from `MetricRow`'s; caught by the 375px screenshot pair, not by a test.                       |
| `[id]/audience-builder.tsx`               |       257 | The tick list: three filters, group buttons, one row per person, a hidden-input form.                                                          | Keep the state; fold the filter trio into one definition map and the rows into `DividedList` (G02-04, G02-06).                              |         205 | `events/screens.test.tsx:1837-2137`; `audience-selection.test.ts` (586)                          | Filter composition is order-independent today; the "clear filters" path is asserted at `screens.test.tsx:1837+`.                             |
| `[id]/audience-list.tsx`                  |        76 | The named audience, with an optional group-shape line.                                                                                         | Fold into `DividedList` + `Fact`; keep `describeAudienceShape` (G02-04).                                                                    |          42 | `events/screens.test.tsx:2560`, `:3140`                                                          | "No longer active" caption placement; asserted by testid `resolved-audience` / `event-audience`.                                             |
| `[id]/question-list.tsx`                  |        49 | The questions as a player meets them, optionally led by the RSVP question.                                                                     | Fold into `DividedList`; the RSVP row becomes the first entry of the same array (G02-04).                                                   |          26 | `events/screens.test.tsx:2658`                                                                   | The RSVP row losing its `leadWithRsvp=false` case; the `question-row` count is asserted.                                                     |
| `[id]/messaging-plan.tsx`                 |       389 | Projects a live or frozen plan and renders two near-identical ladders plus the WhatsApp error list.                                            | Rewrite as one `planRows()` projection and one row list (G02-01).                                                                           |         245 | `messaging-plan.test.tsx` (164); `events/screens.test.tsx:2156+`                                 | Recruit wording must never say "still unanswered" (REQ-never-harsh); `messaging-plan.test.tsx` pins both ladders' copy.                      |
| `[id]/change-panels.tsx`                  |       173 | Three server panels: approved-event actions, change history, cancellation.                                                                     | Fold history rows into `DividedList` (G02-04), the two overline blocks into `Fact`, the buttons into G02-07's action table.                 |         115 | `change-screens.test.tsx` history and cancelled blocks; `change-presentation.test.ts`            | The history grid is a CSS grid precisely so 375px does not truncate; 375px screenshot pair.                                                  |
| `[id]/change-presentation.ts`             |       207 | Every word W5/W6 say, plus two date formatters.                                                                                                | Keep the sentences; fold `formatRecordedMoment` / `formatRecordedDay` into one `formatInstant` in `club-time.ts`.                           |         182 | `change-presentation.test.ts` (123)                                                              | Rule 3: an unparseable date must print `UNREADABLE_DATE`; pinned in `change-presentation.test.ts`.                                           |
| `[id]/change-state.ts`                    |         5 | One interface and one empty value for the cancel form.                                                                                         | Delete because one shared action-outcome type covers it (G02-06).                                                                           |           0 | `change-actions.test.ts` (314)                                                                   | `reason` must survive a refusal; asserted in `change-actions.test.ts`.                                                                       |
| `[id]/renotify-panel.tsx`                 |        62 | W5-04's one button, its outcome slot and its error notice.                                                                                     | Rewrite as `ActionPanel` plus one button (G02-06).                                                                                          |          26 | `change-screens.test.tsx` renotify block                                                         | The outcome slot must still be claimed on submit (standards rule 1); testid `renotify-error`.                                                |
| `[id]/delete-draft.tsx`                   |       102 | Draft deletion behind a confirm dialog.                                                                                                        | Keep the dialog; take the form, the pending label and the error notice from `ActionPanel` (G02-06).                                         |          68 | `events/screens.test.tsx:2995`                                                                   | The dialog must name the event; `delete-draft-name` testid.                                                                                  |
| `[id]/share-panel.tsx`                    |        91 | The club-link panel: refusal, issue button, link, copy, close.                                                                                 | Keep; its four states become one `ActionPanel` with a refusal slot (G02-06).                                                                |          74 | `events/screens.test.tsx:2474`                                                                   | Blocked and error are different sentences; both testids asserted.                                                                            |
| `[id]/club-link-actions.ts`               |        22 | One server action: issue the link, or redirect with the rule.                                                                                  | Keep — already the smallest shape for a redirect-only action.                                                                               |          18 | `events/screens.test.tsx:2474`                                                                   | None beyond the rule string in the query.                                                                                                    |
| `[id]/change-actions.ts`                  |       130 | Three server actions, each parsing `FormData` by hand.                                                                                         | Rewrite through one `eventDraftFromFormData` and one outcome wrapper (G02-10).                                                              |          78 | `change-actions.test.ts` (314)                                                                   | `not_permitted` must keep rethrowing, never become a message; asserted in `change-actions.test.ts`.                                          |
| `[id]/amend/page.tsx`                     |       105 | Gate, context read, status refusal, header, form.                                                                                              | Rewrite through the shared change gate (G02-08).                                                                                            |          55 | `change-screens.test.tsx:249-441`, `:882`                                                        | The draft and cancelled refusal sentences must not merge; both asserted.                                                                     |
| `[id]/amend/amend-form.tsx`               |       440 | W5's three steps in one `<form>`, with its own `readDraft` and its own silence panel.                                                          | Keep the step machine; take `readDraft` (G02-10), the lists (G02-04), the error notice (G02-06) and the silence panel out.                  |         335 | `change-screens.test.tsx` (941)                                                                  | The hidden-but-mounted edit step is what makes a submit post what was typed; `amend-baseline` and `silence-confirmed` testids.               |
| `[id]/amend/amend-event-fields.tsx`       |       156 | Ten controlled fields and one hidden template id.                                                                                              | Keep — ten real controls; only `issueFor` leaves.                                                                                           |         150 | `change-screens.test.tsx`; `venue-field.test.tsx`                                                | None; each control is asserted by name.                                                                                                      |
| `[id]/cancel/page.tsx`                    |        67 | Gate, context read, status refusal, header, form.                                                                                              | Rewrite through the shared change gate (G02-08).                                                                                            |          30 | `change-screens.test.tsx:798-882`                                                                | As amend.                                                                                                                                    |
| `[id]/cancel/cancel-form.tsx`             |       201 | W6's one screen plus its own silence confirmation.                                                                                             | Keep; take the silence panel and the notify default from shared code.                                                                       |         150 | `change-screens.test.tsx`; `event-amendment-rules.test.ts:175`                                   | The notify default is restated here rather than read from the rule — product question 3.                                                     |
| `[id]/edit/page.tsx`                      |       102 | Gate, three reads, draft-only refusal, the create form in edit mode.                                                                           | Rewrite through the shared change gate (G02-08); share the `RawEventDraft` mapping with amend.                                              |          70 | `events/screens.test.tsx:1576`                                                                   | The refusal names the stored status; `edit-refused` testid.                                                                                  |
| `[id]/roster-form/page.tsx`               |        71 | Gate, read, two refusals, and the same header twice.                                                                                           | Rewrite: one header, one `Refusal` branch (G02-03).                                                                                         |          48 | `roster-form/screens.test.tsx` (221)                                                             | A draft must refuse before the screen renders; `roster-form-not-approved`.                                                                   |
| `[id]/roster-form/roster-form-screen.tsx` |       426 | Pick-and-tick, then the same page as a printed form with three hand-built tables.                                                              | Rewrite the printed tables as one `PrintedTable` over column definitions (G02-03); rows via `DividedList` (G02-04).                         |         320 | `roster-form/screens.test.tsx`                                                                   | 94 fixed jersey rows and 12 coach rows are the officials' contract; `printedPlayerRows` is pure and tested.                                  |
| `[id]/roster-form/presentation.ts`        |        49 | Every word the roster form says.                                                                                                               | Keep — labels only, each used once.                                                                                                         |          47 | `roster-form/screens.test.tsx`                                                                   | None.                                                                                                                                        |
| `[id]/roster-form/actions.ts`             |        28 | One audit write.                                                                                                                               | Keep; its outcome type comes from the shared one (G02-06).                                                                                  |          26 | `roster-form/actions.test.ts` (156)                                                              | None.                                                                                                                                        |
| `[id]/roster-form/action-state.ts`        |         7 | One interface and one message.                                                                                                                 | Delete because the shared outcome type covers it; the message moves to `presentation.ts`.                                                   |           0 | `roster-form/actions.test.ts`                                                                    | None.                                                                                                                                        |
| `event-approval/index.ts`                 |         4 | Re-exports only.                                                                                                                               | Delete because `read.ts` and `write.ts` can be imported directly.                                                                           |           0 | `event-approval.test.ts` (2332)                                                                  | Nine import sites change path; typecheck catches every one.                                                                                  |
| `event-approval/shared.ts`                |       114 | The shared types, D16's completeness rule, `readAudienceIn`.                                                                                   | Keep — it holds real logic, not only types.                                                                                                 |         105 | `event-approval.test.ts`                                                                         | `stillSelectable` is derived, never stored; asserted.                                                                                        |
| `event-approval/read.ts`                  |       124 | Three reads that each repeat event plus catalogue plus audience.                                                                               | Rewrite as one read with options (G02-02).                                                                                                  |          92 | `event-approval.test.ts`; `events/screens.test.tsx:2560`                                         | The group summary must come from the same catalogue as the list; one read makes that structural.                                             |
| `event-approval/write.ts`                 |       243 | Saves a proposed audience; approves and releases in one transaction.                                                                           | Keep — four writes only correct together, already minimal; only `countByCapacity` and `describeStatus` shrink.                              |         235 | `event-approval.test.ts`; `tests/slice-walkthrough.test.ts:873`                                  | Any change risks invariants P7 and E1b; the walkthrough asserts the whole approval.                                                          |
| `event-amendment/index.ts`                |        20 | Re-exports only.                                                                                                                               | Delete because the four modules can be imported directly.                                                                                   |           0 | `event-amendment.test.ts` (1937)                                                                 | Nine import sites; typecheck.                                                                                                                |
| `event-amendment/shared.ts`               |        72 | Refusals, the terminal assertion, the notice insert, the threshold read.                                                                       | Keep, and absorb the repeated write preamble and silence guard (G02-05).                                                                    |          85 | `event-amendment.test.ts`                                                                        | D60 must stay the first question every write path asks.                                                                                      |
| `event-amendment/read.ts`                 |       128 | The amendment context and the change history.                                                                                                  | Rewrite: drop `chaseThresholdDays`, `chaseThresholdOn` and `lastAmendment` — no caller reads them, and they cost two queries per page load. |         100 | `event-amendment.test.ts:1803-1830`                                                              | Those three assertions repoint onto `readChaseThresholdDaysIn` and `readEventChangeHistory` directly.                                        |
| `event-amendment/amend.ts`                |       398 | Amends in place, recomputes the schedule, holds and resumes jobs.                                                                              | Keep the SQL; delete the private term reader and the two snapshot copies (G02-05).                                                          |         320 | `event-amendment.test.ts`; `tests/slice-walkthrough.test.ts`                                     | The recompute moves four things together; every one is asserted in `event-amendment.test.ts`.                                                |
| `event-amendment/cancel.ts`               |       193 | Cancels, and re-notifies a silent change.                                                                                                      | Keep the SQL; share the preamble (G02-05).                                                                                                  |         160 | `event-amendment.test.ts`                                                                        | Notices must be written after jobs are cancelled; asserted.                                                                                  |
| `event-amendment-rules.ts`                |       162 | The pure amendment rules: diff, merge, material fields, notify defaults.                                                                       | Keep — close to minimal; `mergeAmendment`'s switch becomes one assignment over a typed key list.                                            |         142 | `event-amendment-rules.test.ts` (322)                                                            | The switch exists to keep the value union sound; typecheck is the guard.                                                                     |
| `audience-selection.ts`                   |       279 | Capacities, groups, person collapse, selection resolution, group summary.                                                                      | Keep; `peopleIn` / `groupIsSelected` / `groupSize` each re-run `resolveSelection`, so one person index serves all three.                    |         250 | `audience-selection.test.ts` (586)                                                               | Group lit state compares people, not keys — exactly what the test pins.                                                                      |
| `event-audience.ts`                       |       195 | One union query for the whole candidate catalogue.                                                                                             | Keep — one statement for one consistent read is the smallest honest shape; only `counts` collapses to one pass.                             |         185 | `event-approval.test.ts`; `audience-selection.test.ts`                                           | Four `filter().length` passes become one reduce; arithmetic only.                                                                            |
| `club-link.ts`                            |       172 | Issues, resolves and stamps the club link.                                                                                                     | Rewrite the two stamp paths as one predicate; `recordClubLinkUse` has no production caller.                                                 |         142 | `club-link.test.ts` (419); `club-link-availability.test.ts` (300)                                | `skip locked` and the never-throw contract must survive; both asserted.                                                                      |
| `roster-form.ts`                          |       176 | Reads everything the form prints; writes one audit row.                                                                                        | Keep — two queries, both with comments that earn their place.                                                                               |         168 | `roster-form-read.test.ts` (292)                                                                 | It is the only reader of student and BAFA numbers; `tests/schema-restricted-fields.test.ts` guards that.                                     |
| `roster-form-shape.ts`                    |        75 | The printed form's shaping, pure so the client can import it.                                                                                  | Keep.                                                                                                                                       |          72 | `roster-form.test.ts` (167)                                                                      | None.                                                                                                                                        |
| new `src/components/divided-list.tsx`     |         0 | The ruled list seven surfaces here build by hand.                                                                                              | New kit member (G02-04).                                                                                                                    |          35 | its own `divided-list.test.tsx`, plus every screen test above                                    | A row's border or padding changing on seven surfaces at once; kit screenshot sampling.                                                       |
| new `src/components/action-panel.tsx`     |         0 | Form, pending label, outcome slot, error notice.                                                                                               | New kit member (G02-06).                                                                                                                    |          30 | its own test, plus every screen test above                                                       | Standards rule 1 depends on claiming the slot; the component owns it once.                                                                   |
| new `[id]/event-change-gate.tsx`          |         0 | Gate, read, status refusal and header for amend, cancel and edit.                                                                              | New sibling (G02-08).                                                                                                                       |          35 | `change-screens.test.tsx`; `events/screens.test.tsx:1576`, `:1742`                               | Three refusal titles must stay distinct; passed in, asserted by testid.                                                                      |
| new `[id]/silence-confirm.tsx`            |         0 | The confirm-or-tell-them panel amend and cancel both own.                                                                                      | New sibling — two callers, both in this directory.                                                                                          |          28 | `change-screens.test.tsx`                                                                        | The two proceed labels differ ("Save silently" / "Cancel silently"); passed in.                                                              |
| additions to files other sections own     |         0 | `eventDraftFromFormData` in `event-input.ts` (16), `formatInstant` in `club-time.ts` (10), `listTermWindowsIn` exported from `seasons.ts` (3). | New shared helpers, counted once here.                                                                                                      |          29 | `event-amendment.test.ts`; `change-presentation.test.ts`                                         | Named for the sections that own those files.                                                                                                 |

### Proposals

These ten account for 982 of the 1305 lines saved; the table's remaining rows
carry the other ~320.

#### G02-01 — One ladder renderer instead of two (saves ~144)

- Now: `messaging-plan.tsx:145-216` (`PlanRows`) and `:222-273`
  (`RecruitPlanRows`) are the same 30-line grid row, twice, differing only in
  the sentence each row carries. The sentences are computed two ways:
  `describeRungs` (`:105-142`) builds them as data for the first ladder, while
  the recruit ladder builds them inline in JSX (`:257-268`). A third copy of
  the same bordered row renders the WhatsApp error list (`:377-406`).
  `planForDisplay` and `frozenPlanForDisplay` (`:59-94`) then restate the same
  five fields twice.
- Smallest honest shape: one projection and one list.
  ```ts
  interface PlanRow {
    key: string;
    at: Date;
    title: string;
    note: string;
    side: string;
  }
  function planRows(display: DisplayPlan, sizes: { audience: number; recruits: number }): PlanRow[];
  ```
  `planRows` emits the regular rungs, the escalation row, then the recruit
  rungs, each already worded — the recruit arm never reaches the "still
  unanswered" branch. The component is one `DividedList` over
  `planRows(...)`; `WhatsAppErrorsAlert` is another.
- Behaviour held by: `messaging-plan.test.tsx` (164) pins the titles, the
  recruit wording and the step count; `events/screens.test.tsx:2156+` pins the
  disclosure on the approval screen; the `plan-row` count is asserted.
- Lines: 389 → 245, because one worded-row projection (~45) plus one list
  (~18) replaces 38 lines of `describeRungs`, 120 lines of two renderers and
  the inline third.
- Risk: the recruit ladder acquiring an escalation row, or the harsher reminder
  wording. Both are asserted by name in `messaging-plan.test.tsx`.
- Repointed tests: none — the assertions are on rendered text and testids.
- New dependency: none. Depends on G02-04's `DividedList`.

#### G02-02 — One read for the event page (saves ~124)

- Now: `[id]/page.tsx:58-162` performs up to nine awaits in sequence, each with
  its own guard comment. Two of them do the same work twice:
  `readEventAudience` (`event-approval/read.ts:111-122`) and
  `readEventAudienceGroupSummary` (`:126-144`) each open a transaction, call
  `readEventIn`, call `listAudienceCatalogueIn` — the union query over the
  whole roster — then call `readAudienceIn`. `readApprovalPreview` (`:80-108`)
  is a third copy of those three calls. `event-detail-view.tsx:153-172` then
  restates all thirteen results as a props interface, and `:173-187` derives
  `lastAmendment`, `changeWentOutSilently`, `proposed` and `derived` inside the
  component.
- Smallest honest shape: one service read per screen.
  ```ts
  // event-approval/read.ts
  export async function readEventPage(
    eventId: string,
    want: { audience: boolean; participation: boolean; share: boolean },
  ): Promise<EventPageData>; // event, audience, groupSummary, questions, summary,
  // history, participation, frozenPlan, silentChange, derived
  ```
  One `withTransaction`, one catalogue read, the three `readEventIn` calls
  collapsed to one. `page.tsx` becomes gate, `readEventPage`, a three-way
  switch on `step`, one `<EventDetailView data={data} can={can} />`.
  `EventDetailView` takes two props instead of thirteen.
- Behaviour held by: `events/screens.test.tsx:1292` (draft), `:1489`
  (approved), `:2342` (participation table), `:2560` (a draft carrying an
  audience), `:3140` (the shape line), `:1220` (headline numbers);
  `event-approval.test.ts` for each read. No test asserts that the reads are
  separate transactions, and none asserts a read count — say so plainly.
- Lines: 163 + 124 + 450 → 95 + 92 + 340, because one read replaces three
  catalogue reads and one bundle type replaces a thirteen-field prop list.
- Risk: a `want` flag wrong for one status renders a panel empty. Every panel
  has a testid assertion in the blocks above, so an empty one fails there.
- Repointed tests: `event-approval.test.ts`'s `readEventAudience` and
  `readEventAudienceGroupSummary` blocks assert the same values through
  `readEventPage`.
- New dependency: none. Also the largest runtime win here — three catalogue
  reads become one per page view (LAN-227 owns speed; it is not the measure).

#### G02-03 — The roster form's three tables as one (saves ~115)

- Now: `roster-form-screen.tsx:381-413` and `:418-458` are the same table
  twice, differing in three column headings and three cell expressions, each
  repeating `component="table"/"thead"/"tr"/"th"` with `CELL` / `HEAD_CELL`
  spreads and a width per column. `:450-456` builds the blank coach rows with a
  third copy of the row markup. `roster-form/page.tsx:46-78` renders the same
  `Stack` plus `PageHeader` twice, once for the refusal and once for the screen.
- Smallest honest shape:
  ```tsx
  function PrintedTable<T>({
    columns,
    rows,
  }: {
    columns: { head: string; width: string; cell: (row: T) => ReactNode }[];
    rows: readonly T[];
  });
  ```
  Two column definitions of three entries each, one renderer, and the coach
  blanks as padding rows appended to `rows`. `page.tsx` renders one header and
  switches only the body.
- Behaviour held by: `roster-form/screens.test.tsx` (221) asserts the 94 jersey
  rows, the 12 coach rows, the three warning lines and the print-hide
  attributes; `roster-form.test.ts` and `roster-form-read.test.ts` pin the
  shaping.
- Lines: 581 → 441 across the route, of which ~115 is this proposal, because 74
  lines of two tables plus 7 of blank rows become one 30-line renderer and two
  8-line column lists.
- Risk: the printed form is the officials' document — a dropped column or a
  changed page break is a real failure. Column count and the 94/12 row counts
  are asserted; `pageBreakInside` is asserted by no test, so `PRINT_STYLES`
  stays untouched.
- Repointed tests: none.
- New dependency: none.

#### G02-04 — A ruled list in the kit (saves ~95 net)

- Now: seven surfaces in this section hand-build the same thing — a
  `Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}` of
  `Box component="li"` rows carrying `borderBottom: 1, borderColor: "divider"`:
  `audience-list.tsx:44-75`, `question-list.tsx:18-49`,
  `change-panels.tsx:87-127`, `amend/amend-form.tsx:337-356`,
  `audience-builder.tsx:224-255`, `roster-form/roster-form-screen.tsx:259-293`,
  and `messaging-plan.tsx` three times (claimed by G02-01). Fourteen files
  repo-wide carry the idiom.
- Smallest honest shape: `src/components/divided-list.tsx` —
  ```tsx
  <DividedList as="ul" testId="event-audience">
    {rows.map((r) => (
      <ListRow key={r.key} primary={r.title} secondary={r.note} trailing={r.side} />
    ))}
  </DividedList>
  ```
  `ListRow` takes `primary` / `secondary` / `trailing` as nodes and owns the
  border, the padding and the wrap behaviour. `RowCard` stays the phone half of
  a table; this is the ruled list inside a card, which the kit has no member
  for today.
- Behaviour held by: `events/screens.test.tsx:2658` (question rows), `:2560`
  and `:3140` (audience rows), `change-screens.test.tsx` (history rows),
  `roster-form/screens.test.tsx` (player rows). Each asserts a testid on the
  list and on rows, so both must be forwarded.
- Lines: 640 across those six blocks → ~510, plus 35 for the component.
- Risk: one padding change lands on seven surfaces at once. Caught by the kit's
  screenshot sampling, not by a test — say so plainly.
- Repointed tests: none, provided `DividedList` forwards `data-testid` and
  `ListRow` forwards a row testid.
- New dependency: none.

#### G02-05 — One preamble for the three approved-event writes (saves ~95)

- Now: `amend.ts:81-89`, `cancel.ts:62-70` and `cancel.ts:133-141` open with the
  identical nine lines — `lockEventIn`, `assertNotTerminal`, then
  `status !== "approved"` throwing `InvalidTransition` with a message and a
  rule. `amend.ts:113-119` and `cancel.ts:151-157` repeat the silence guard
  verbatim. `amend.ts:408-438` holds `snapshotOf` and `snapshotOfInput`: two
  thirteen-line copies of the same eleven-key object. `amend.ts:440-472`
  re-implements `listTermsIn` and its own `asDay`, because `seasons.ts:112`
  exports only the transaction-less `listTermWindows` — 33 lines duplicating
  `seasons.ts:124-139`, with a second spelling of the date coercion.
- Smallest honest shape: three helpers in `event-amendment/shared.ts` —
  ```ts
  export async function lockApprovedEventIn(
    tx: Tx,
    id: string,
    refusal: { message: string; rule: string },
  ): Promise<EventDetail>;
  export function assertSilenceConfirmed(needed: boolean, confirmed?: boolean): void;
  export function amendableOf(source: EventDetail | EventDraftInput): AmendableEvent;
  ```
  `amendableOf` is one pick over an `AMENDABLE_SNAPSHOT_KEYS` list, plus
  `export { listTermWindowsIn }` from `seasons.ts` (3 lines), which deletes
  `amend.ts:440-472` outright.
- Behaviour held by: `event-amendment.test.ts` (1937) asserts each refusal by
  rule — `event_amendment_requires_approved`,
  `event_cancellation_requires_approved`, `event_cancellation_is_terminal`,
  `event_change_silence_unconfirmed` — and the reschedule's term recompute;
  `tests/slice-walkthrough.test.ts:1274` walks the cancelled end state.
- Lines: 102 of duplication → ~37, because one lock helper serves three call
  sites, one pick replaces two snapshots, and the term reader already exists.
- Risk: the lock must happen before any decision is read — `lockEventIn`'s own
  comment says why. A helper that read status before locking would be a race no
  test reproduces, so the helper must take the lock itself; the amend and
  cancel races are caught by the `where status = 'approved'` update returning
  zero rows, which is asserted.
- Repointed tests: none.
- New dependency: none.

#### G02-06 — One action panel and one outcome type (saves ~87)

- Now: every client form here writes the same four things by hand —
  `useActionState(action, EMPTY_*)`, an optional `useOutcomeSlot`, a
  `{state.error ? <Notice .../> : null}` block and a pending button label:
  `renotify-panel.tsx:30-64`, `delete-draft.tsx:37-67` and `:90-102`,
  `audience-builder.tsx:72-75` and `:257-285`, `cancel-form.tsx:58,86-90`,
  `amend-form.tsx:93,250-254`, `share-panel.tsx:49-68`. The result shapes are
  three files restating the same thing: `form-state.ts:21-25` (`{error}`),
  `[id]/change-state.ts` (`{error, reason}`), `roster-form/action-state.ts`
  (`{generatedAt, error}`). Thirty-four client forms repo-wide use
  `useActionState`.
- Smallest honest shape: one kit member and one type.
  ```tsx
  <ActionPanel
    action={renotifyEventAction}
    slot="renotify"
    hidden={{ eventId }}
    label={renotifyLabel(recipients)}
    pendingLabel="Sending…"
    errorTestId="renotify-error"
  />
  ```
  `ActionPanel` owns `useActionState`, the slot claim, the error `Notice` and
  the pending label; `children` carries anything else the panel shows. The
  outcome type becomes `ActionOutcome<T = unknown> = { error: string | null } & T`,
  so `change-state.ts` and `roster-form/action-state.ts` both go.
- Behaviour held by: `change-screens.test.tsx` (renotify, cancel and amend
  errors), `events/screens.test.tsx:2995` (delete-draft error), `:2474` (share
  error against share blocked), `:1837+` (audience save error),
  `change-actions.test.ts` (the `reason` that survives a refusal).
- Lines: ~105 of per-form plumbing plus 12 lines of state files → 30 for the
  component, because one component holds what seven call sites repeat.
- Risk: standards rule 1 — two panels showing a result at once. Moving the slot
  claim inside the component makes it structural; `renotify-error` and
  `delete-draft-error` both assert it today.
- Repointed tests: none, provided each call site's error testid stays a prop.
- New dependency: none. Named for other sections: 34 forms share this shape.

#### G02-07 — The event page's facts and actions as data (saves ~86)

- Now: `event-detail-view.tsx:270-312` writes eight `<Fact>` elements with four
  inline conditionals; `:416-477` writes six action buttons, each its own
  `{permission && status ? <Button .../> : null}` stanza repeating `fullWidth`,
  `sx={{ minHeight: 44 }}` and a testid; `:78-98` (`HeadlineNumbers`) spells
  out three `Metric`s that differ only in value and label.
- Smallest honest shape: three tables and three maps.
  ```ts
  const DETAIL_FACTS: {
    label: string;
    value: (e: EventDetail) => ReactNode;
    when?: (e: EventDetail) => boolean;
    testId?: string;
  }[];
  const PAGE_ACTIONS: {
    label: string;
    href: (e: EventDetail) => string;
    variant: "contained" | "outlined" | "text";
    when: (c: Can, e: EventDetail) => boolean;
    testId?: string;
  }[];
  const HEADLINE_METRICS: {
    label: string;
    value: (s: AttendanceSummary) => string;
    testId: string;
  }[];
  ```
  The JSX becomes three `filter().map()` calls. The tables are then the only
  place a condition is written, which is also where a reviewer can read the
  whole permission matrix at once.
- Behaviour held by: `events/screens.test.tsx:1292` (draft actions), `:1489`
  (approved), `:1639` (no calendar role, and the read-only note), `:1718` (all
  four calendar roles), `:3091` (duplicate), `:1220` (headline numbers),
  `:2995` (delete draft); `change-screens.test.tsx` pins the approved-event
  action trio.
- Lines: 450 → 340 in total with G02-02's share, of which ~86 is this proposal,
  because eight facts, six actions and three metrics at about six JSX lines
  each become seventeen one-line table entries plus three six-line maps.
- Risk: a condition transcribed wrongly shows an action to the wrong role — the
  worst failure available here. The two role blocks above assert exactly that,
  per role and per status.
- Repointed tests: none — testids stay in the table rows.
- New dependency: none.

#### G02-08 — One gate for amend, cancel and edit (saves ~84)

- Now: `amend/page.tsx`, `cancel/page.tsx` and `edit/page.tsx` are the same page
  three times: `gateShellPage` with a capability, a try/catch around the read
  rendering a local `Refusal`, a `status !== X` branch rendering the same local
  `Refusal` with a second sentence, a `PageHeader`, then the form. The local
  `Refusal` wrapper is copied verbatim three times — `amend/page.tsx:102-114`,
  `cancel/page.tsx:65-77`, `edit/page.tsx:100-112` — differing only in `title`,
  `testId` and one label ("Back to event" against "Back to the event").
- Smallest honest shape: one sibling, `[id]/event-change-gate.tsx`:
  ```ts
  export async function gateEventChange<T>(args: {
    id: string;
    capability: Capability;
    title: string;
    testId: string;
    read: (id: string) => Promise<T>;
    requires: (value: T) => string | null;
  }): Promise<{ screen: ReactNode } | { value: T }>;
  ```
  `requires` returns the refusal's second sentence or `null`, so each route
  keeps its own words and loses its own plumbing; the status sentence comes
  from one `describeStatus` (product question 2).
- Behaviour held by: `change-screens.test.tsx:249`, `:392`, `:441`, `:798`,
  `:882` — including "the service is not called when the gate refuses" — and
  `events/screens.test.tsx:1576`, `:1742` (every event route guards itself).
- Lines: 274 → 155 plus 35 for the gate, because one helper replaces three
  try/catch, refusal and header stanzas.
- Risk: a capability passed wrongly opens a route to the wrong role.
  `screens.test.tsx:1742` walks every event route's guard.
- Repointed tests: none — the refusal testids are passed in unchanged.
- New dependency: none.

#### G02-09 — The approval review through the kit (saves ~80)

- Now: `approval-review.tsx:147-160` hand-builds a two-column grid of two
  `Metric`s, which is `MetricRow` (`src/components/metric.tsx:43`); `:171-214`
  hand-builds a second grid of four `Fact`s, which is `FactGrid`
  (`src/components/fact.tsx:130`). `:138-145` renders the audience shape as an
  overline over an `h6` — exactly what `AudienceList` already does at
  `audience-list.tsx:36-43` when given a `groupSummary`, and
  `approval-review.tsx:219` calls `AudienceList` without one. `:68-86` and
  `:92-109` are two refusal screens built from `Section` plus `Notice` plus a
  `Button`, when `src/components/refusal.tsx` exists for exactly that and the
  three sibling pages already use it.
- Smallest honest shape: `MetricRow` for the metrics, `FactGrid` for the facts,
  `<AudienceList heading="Who will be asked" groupSummary={groupSummary} />` for
  the shape, and `Refusal` with `action={{ href, label }}` for both refusals.
  `ApprovalLayout` stays — a header plus children, nine lines.
- Behaviour held by: `events/screens.test.tsx:2156` (the review), `:2138`
  (empty-audience refusal), `:3140` (the shape leads), plus the
  `audience-total`, `audience-defects` and `deadline-fact` testids.
- Lines: 230 → 150, because two hand-built grids, one duplicated shape block
  and two hand-built refusals become four kit calls.
- Risk: `Refusal` centres its card and `Section` does not, so the empty-audience
  and incomplete screens move on the page. That is a visible difference with no
  test to catch it — the screenshot pair must show it, and if Brian objects the
  answer is a `Section`-with-`Notice` helper instead.
- Repointed tests: none, provided `Refusal` carries the existing
  `empty-audience-refusal` and `incomplete-refusal` testids.
- New dependency: none.

#### G02-10 — One FormData draft reader and one action wrapper (saves ~72)

- Now: the same eleven-field `RawEventDraft` mapping is written three times —
  `change-actions.ts:33-47`, `amend/amend-form.tsx:155-176` (client side, over
  `new FormData(formRef)`) and `events/actions.ts:29` (the sibling section).
  `change-actions.ts:24-31` defines `text` and `checked`; `events/actions.ts:24`
  defines `text` identically. Each of the three actions in
  `change-actions.ts:69-154` then repeats the same five steps by hand:
  `requireCapability`, read fields, call the service, catch into a result
  object, then three or four `revalidatePath` calls and a `redirect`.
- Smallest honest shape: one pure reader in `event-input.ts` — which the client
  may import, it has no `server-only` — and one wrapper:
  ```ts
  export function eventDraftFromFormData(data: FormData): RawEventDraft; // ~16 lines
  // [id]/change-actions.ts
  async function runEventChange<S>(
    work: () => Promise<void>,
    onRefusal: (message: string) => S,
    revalidate: string[],
    to: string,
  ): Promise<S | never>;
  ```
  `runEventChange` owns the catch, the `not_permitted` rethrow, the
  `revalidatePath` calls it is given, and the redirect.
- Behaviour held by: `change-actions.test.ts` (314) asserts each refusal
  message, that `not_permitted` is rethrown rather than shown, and that the
  submitted values come back on a refusal; `events/actions.test.ts` (705)
  covers the sibling copy.
- Lines: 130 + 22 (the client copy) → 78 + 2, plus 16 in `event-input.ts`.
- Risk: the `revalidatePath` lists differ between the three actions —
  `renotifyEventAction` does not revalidate `/operate/events`. The wrapper must
  take the list rather than assume it; no test asserts revalidation, so this is
  the one place to be literal rather than tidy.
- Repointed tests: none.
- New dependency: none. Names `eventDraftFromFormData` for the section that
  owns `events/actions.ts`.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  `approval-review.tsx:147-160` -> `MetricRow`; `approval-review.tsx:171-214`
  -> `FactGrid`; `approval-review.tsx:68-86` and `:92-109` -> `Refusal`;
  `approval-review.tsx:138-145` -> `AudienceList`'s own shape line;
  `audience-list.tsx:36`, `change-panels.tsx:157`, `:170`,
  `amend-form.tsx:334`, `:360`, `:389`, `messaging-plan.tsx:315`, `:334`,
  `audience-builder.tsx:139` -> `Fact` (its stacked layout is precisely an
  overline label over a value: eleven local copies);
  `event-detail-view.tsx:78-98` -> `Metric` takes a node, so the `String(...)`
  wrappers go.
- Pieces two or more routes write that should become one component:
  `audience-list.tsx:44-75`, `question-list.tsx:18-49`,
  `change-panels.tsx:87-127`, `amend-form.tsx:337-356`,
  `audience-builder.tsx:224-255`, `messaging-plan.tsx:149-214`, `:231-271`,
  `:377-406`, `roster-form-screen.tsx:259-293` ->
  **`src/components/divided-list.tsx`** (`DividedList`, `ListRow`), fourteen
  files repo-wide. The seven client forms in G02-06 ->
  **`src/components/action-panel.tsx`** (`ActionPanel`), thirty-four forms
  repo-wide. `amend-form.tsx:433-475` and `cancel-form.tsx:171-211` ->
  **`[id]/silence-confirm.tsx`**, a sibling rather than a kit member: two
  callers, both in this directory.
- Kit members this section needs changed to absorb a local copy: `Refusal`
  needs nothing — it already takes `action`, `testId` and `message`, which is
  why the three sibling pages each wrap it in an identical local function.
  `Section`, `Fact` and `Metric` need nothing. `MetricRow` accepts `columns`
  2-5 and the approval review wants two at 160px maximum, so either `MetricRow`
  gains a `compact` prop or the review accepts the kit's width — a one-line
  visual decision for the screenshot pair, not a component change.

### Product questions

1. **Two refusals share one headline, and can appear together.**
   `EMPTY_AUDIENCE_HEADLINE` and `INCOMPLETE_EVENT_HEADLINE` are both "This
   event cannot be approved" (`events/presentation.ts:115` and `:243`), and
   `[id]/page.tsx:103-107` renders `IncompleteRefusal` and then
   `EmptyAudienceRefusal` when an event has neither a date nor an audience —
   two cards, same title, different actions ("Edit draft" and "Build
   audience"). One refusal listing both missing things would be smaller and
   clearer, but it changes what the approver reads. Screen: the review step of
   `/operate/events/{draft}`. A rewrite cannot choose between "two cards, one
   per cause" and "one card, two reasons".

2. **Four sentences for one event status in a refusal.**
   `event-approval/write.ts:280-284` says "a draft" / "already approved" /
   "cancelled"; `event-amendment/shared.ts:24-28` says "This event is a
   draft." / "This event is approved." / "This event is cancelled.";
   `amend/page.tsx:44-47` and `cancel/page.tsx:37-40` build the sentence again
   with an inline ternary; `edit/page.tsx:48` builds it a fourth way from
   `status.replace("_", " ")`. Folding them into one table is the obvious
   simplification, and it changes at least one message a user can see ("Only a
   draft can be approved. This event is already approved." against "... This
   event is approved."). Screens: the approve action, `/amend`, `/cancel`,
   `/edit`. Which wording survives is Brian's.

3. **The cancellation notify default is stated in two places.**
   `event-amendment-rules.ts:175` (`cancellationDefaultNotify`) is the recorded
   rule and has no production caller; `cancel-form.tsx:61` restates it as
   `useState(isFuture)`. They agree today, so the fold is safe and is proposed
   — this is listed only because it is the shape of a defect rather than of a
   simplification, and the rule file should be the one answer (standards rule
   7). No decision is needed unless the form's default is meant to be able to
   differ from the service's.

### Not proposed

- `event-approval/write.ts` (243): four writes only correct together, in a
  fixed order, each with an invariant named beside it. Already minimal.
- `event-audience.ts`'s catalogue query (195): one union statement for one
  consistent read is the smallest honest shape; only the four `counts` passes
  collapse into one.
- `roster-form.ts` (176): two queries, each carrying a comment that earns its
  place — the `distinct on` that stops a double-printed player, and the
  effective date taken at the game rather than today.
- `amend-event-fields.tsx` (156): ten real controls and a hidden template id.
  Its eighteen-line prop list is the cost of being controlled; a `values` plus
  `onChange` record would save ten lines and lose the type safety that keeps
  each control bound to its own field.
- `isFutureEvent` (`event-amendment-rules.ts:185`) is not folded into
  `derivedEventState` (`event-input.ts:39`) even though both compare
  `scheduledOn` against today on the same boundary: they disagree deliberately
  on a cancelled future event, and the cancel path's refusal order depends on
  it.
- `club-link.ts`'s token derivation, `timingSafeEqual` check and `skip locked`
  stamp: security-shaped code, left alone beyond folding the two stamp
  statements into one predicate.
- Dead weight worth only a line each, recorded so it is not lost: `selectionKey`
  (`audience-selection.ts:100`) has no production caller while four sites build
  `${capacity}:${anchorId}` by hand (`[id]/page.tsx:94`,
  `event-approval/read.ts:102`, `:140`, `event-approval/shared.ts:108`);
  `recordClubLinkUse` (`club-link.ts:194`) has no production caller;
  `cancellationDefaultNotify` has none; and
  `AmendmentContext.chaseThresholdDays`, `.chaseThresholdOn` and
  `.lastAmendment` (`event-amendment/read.ts:51-54`) are read by no screen
  while costing two queries on every amend and cancel page load.
- Carve-out files read for context only: `src/lib/db`, `src/lib/auth/guards`
  and `capabilities`, `src/lib/delivery/phone` and `config`,
  `src/lib/services/delivery.ts`, `src/lib/services/messaging-scheduler.ts`.

---

## G03 — Attendance, delivery, event import/export, the operator calendar, participation

Lines now: 6823 (measured as 7146 before the JSDoc correction). Lines after everything proposed: 5900. Saved: 1246 (17%).

"Lines after" counts the new shared components and helpers this section proposes once, in this
section (435 lines of them). Four of those pieces — `DataTable`, `ActionForm`, `CalendarArrangements`
and the additions to the existing `ListFilters` — are adopted by routes outside this section, so the
application-level saving is materially larger than 1246; each proposal names its out-of-section
figure.

### Files read

All 55 files in the brief. Read for context, not proposed on: `src/lib/services/delivery.ts`
(carve-out; `DELIVERY_STATE_EXPRESSION`, `MAX_ATTEMPTS`, `EventDelivery`), `src/lib/delivery/**`
(carve-out), `src/components/*` (kit), `src/app/operate/list-filters.tsx`,
`src/app/operate/filter-search.ts`, `src/app/operate/unavailable.tsx`, `src/app/calendar/**`,
`src/app/e/[token]/page.tsx`, `src/app/operate/events/[id]/page.tsx`,
`src/app/design-preview/(operator)/event/participation-preview.tsx`, `src/lib/club-time.ts`,
`src/lib/services/event-vocabulary.ts`, `src/lib/services/event-csv` callers, and the 17 test files
that reach this section (11,739 lines of test, all of which stays).

### Modules

| Module or surface                                                                       | Lines now | What it does                                                                                                                              | Proposed shape                                                                                                       | Lines after | Tests that prove it                                                                                                                            | Risk, and how it is caught                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance register route (`attendance/` 10 files)                                      |      1187 | The register: four states, per-row save, walk-up form, filters, groups                                                                    | rewrite as one filter-bar call, one locked screen, one form helper, copy at its use site                             |         940 | `attendance/screens.test.tsx` (1744), `attendance/actions.test.ts` (517), `tests/coach-attendance-boundary.test.ts`                            | The coach view omits Mismatches and Complete attendance (`page.tsx:177,205`); a shared filter bar or form must not reintroduce them. Screen tests assert both views by `data-view` |
| Attendance service (`attendance/*`, `attendance-vocabulary.ts`, `attendance-window.ts`) |       784 | Board read, headline counts, record/correct/remove/walk-up writes                                                                         | rewrite `read.ts` onto one shared participant read; fold `index.ts` away; keep the window and the vocabulary         |         603 | `services/attendance.test.ts` (1897), `attendance-window.test.ts`, `attendance-vocabulary.test.ts`, `tests/pilot-scenario-lan-80.test.ts`      | The closed-register branch returns zeroed counts (`read.ts:141-154`); a merged read must keep "closed means no participants" exactly                                               |
| Delivery screens (`delivery/` 9 files)                                                  |       878 | Overview, the attempt log, the repair panel, two repair actions                                                                           | rewrite the attempt log as a column list, the filters as one bar, the two forms as one `ActionForm`                  |         663 | `delivery/screens.test.tsx` (992), `delivery/actions.test.ts` (241), `tests/no-manual-delivery.test.ts`, `tests/pilot-scenario-lan-78.test.ts` | `no-manual-delivery` scans schema and service, not this directory, so the copy is free to move; the control inventory in `screens.test.tsx` is what holds the screens              |
| Operator calendar (`events/calendar/` 2 files)                                          |       279 | The operator's month grid and Oxford column, and the two view switches                                                                    | fold into one `CalendarArrangements` shared with `/calendar/view`                                                    |         110 | `events/calendar/screens.test.tsx` (876), `src/app/calendar/screens.test.tsx`                                                                  | Operator tiles link to `/operate/events/<id>`, public to `/e/...`; the tile function already abstracts that (`calendar/page.tsx:65`)                                               |
| Event import route (`events/import/` 6 files)                                           |       664 | Upload, the confirmation table, apply, the export download                                                                                | rewrite the confirmation table as a column list; keep the prompt block and the route                                 |         577 | `events/import/screens.test.tsx` (336), `services/event-csv.test.ts` (606)                                                                     | The confirmation shows replaced values struck through (`import-screen.tsx:361-382`); a generic cell renderer must keep the per-cell `previous`                                     |
| CSV and plan services (`csv.ts`, `event-csv/*`, `event-import.ts`)                      |      1083 | The dialect, the plan, the digest, the season export, the two transactions                                                                | rewrite `plan.ts`/`compare.ts` around a column rule table; keep `csv.ts`, `prompt.ts`, `export.ts`                   |         935 | `services/csv.test.ts` (147), `event-csv.test.ts` (606), `event-import.test.ts` (534)                                                          | Per-row refusal wording is asserted verbatim; a rule table must emit the same sentences in the same order                                                                          |
| Participation surface (`src/app/participation/` 10 files)                               |      1401 | The table both `/operate/events/[id]` and `/e/[token]` render, its filters, the record-answer dialog                                      | rewrite the table as columns, the filters as one bar, the dialog's two choice branches as one                        |         969 | `participation/screens.test.tsx` (1612), `record-answer-actions.test.ts` (193)                                                                 | The two tiers differ structurally (no Delivery at club link); column lists are built per tier and `participation.test.ts:763-795` proves it                                        |
| Participation services (`participation.ts`, `participation-view.ts`)                    |       842 | The tier reads, the headline, and the pure filter/sort engine                                                                             | rewrite the read onto the shared participant SQL; express the filters as one table                                   |         660 | `participation.test.ts` (954), `participation-view.test.ts` (764), `participation-authorisation.test.ts` (73)                                  | The club-link payload must never gain a delivery key; pinned with a positive control at `participation.test.ts:763`                                                                |
| `discrepancy-vocabulary.ts`, `response-deadline.ts`                                     |        28 | A drift-guard list for one view, and four type fields                                                                                     | delete because only tests read three of the four exports, and the deadline is four fields of one other module's type |           8 | `participation-view.test.ts:707-745`, `club-link-availability.test.ts:292`                                                                     | None: the constants move into the test that asserts them                                                                                                                           |
| New shared code this section proposes (counted once)                                    |         0 | `DataTable`, `event-roll.ts`, `ActionForm` + `form-action.ts`, `CalendarArrangements`, `ListFilters` additions, two club-clock formatters | add                                                                                                                  |         435 | each proposal names the tests                                                                                                                  | —                                                                                                                                                                                  |

### Proposals

#### G03-01 — One filter bar (saves ~235)

- Now: `src/app/operate/list-filters.tsx` already is the search-plus-selects bar, and five routes use
  it (`events/event-filters.tsx`, `roster/roster-filters.tsx`, `people/people-filters.tsx`,
  `people/missing/missing-filters.tsx`, `calendar/public-filters.tsx`). This section writes it again
  three times: `attendance-filters.tsx` (112 lines, search + two selects + the phone Filters
  toggle), `delivery-filters.tsx` (65, search + one select), `participation-filters.tsx` (185, search
  - four selects + a local `FilterSelect` at `:53-89` that is `SelectField` with a native `<select>`
    and an All option). All three already share `useFilterSearch`.
- Smallest honest shape: keep `ListFilters`, add four optional props it does not have —
  `fields[].testId`, `fields[].native`, `sort`/`direction` optional (attendance and delivery have no
  phone sort selects), `clearHref`, and `scroll: false` on pushes — roughly 20 lines. Then each call
  site is a `fields` array: attendance ~30 lines, delivery ~22, participation ~55 (it keeps the
  capacity/answer/attendance/delivery option mapping and the tier condition at `:111`).
- Behaviour held by: `attendance/screens.test.tsx` (`attendance-filters`, query-string round trip),
  `delivery/screens.test.tsx` (`delivery-filters`), `participation/screens.test.tsx:466-541`
  (`fireEvent.change` on `filter-capacity`, `filter-search`, and `filter-clear`'s href).
- Lines: 362 → 107 plus 20 in `ListFilters`, because three bars become three option tables.
- Risk: the one that matters. Participation deliberately renders **native** selects
  (`participation-filters.tsx:37-46`: "no portal, so the element a test drives is the element the
  operator drives"), while `ListFilters` renders MUI menus. Folding without a `native` flag would
  change the control an operator touches — a UX change, not a simplification — and would break
  `fireEvent.change` on `filter-capacity`. The flag is the acceptance condition; the participation
  screen tests fail immediately without it.
- Repointed tests: none, given the `native` flag. Without it, every participation filter assertion.
- New dependency: none.

#### G03-02 — One list component for the three tables (saves ~199)

- Now: three desktop tables and three phone card lists, written out cell by cell.
  `participation-table.tsx:236-421` is 185 lines of which seven `SortableHeading` blocks are six
  lines each (`:313-356`), the card half repeats the same five facts (`:260-300`) and the body half
  repeats the same five cells (`:375-411`). `delivery-diagnostics.tsx:62-123` writes a six-column
  table and then the same six fields again as `RowCard` sublines. `import-screen.tsx:336-397` does it
  a third time. A fourth copy, outside this section, is
  `design-preview/(operator)/event/participation-preview.tsx` (295 lines).
- Smallest honest shape: `src/components/data-table.tsx`, beside `sortable-header.tsx` and
  `row-card.tsx`, which it composes:

  ```tsx
  export interface Column<T> {
    key: string; label: string; sort?: { href: string; active: boolean; direction: "asc" | "desc" };
    cell: (row: T) => ReactNode; card?: "title" | "trailing" | "fact" | "omit"; minWidth?: number;
  }
  export function DataTable<T>({ columns, rows, rowKey, rowTestId, minWidth, testId }: {...}) {
    // DesktopOnly > TableFrame > Table: one TableCell per column, SortableHeader when column.sort
    // RowCardList: card==="title" is the title, "trailing" the trailing, the rest a FactGrid
  }
  ```

  Each call site then holds a `columns` array and nothing else: participation builds its list per
  tier (`operator ? [...] : [...]`), delivery builds six, import builds eleven from
  `SHOWN_COLUMNS`.

- Behaviour held by: `participation/screens.test.tsx` (row and card `data-testid`s, `data-person`,
  `data-question`, sort hrefs), `delivery/screens.test.tsx` (`attempt-log-row`,
  `attempt-log-card`), `events/import/screens.test.tsx` (`import-row-<line>`,
  `import-card-<line>`). Nothing pins the minimum table widths (`minWidth: operator ? 1080 : 940`,
  `1460` on import) — those are carried as props, not re-derived.
- Lines: 974 → 680 plus 95 for the component, because three hand-written header/body/card triples
  become three column arrays of roughly one line per column.
- Risk: a dropped `data-testid` or a changed cell order silently passes type checking. Caught by the
  three screen tests, which assert testids and cell text, and by the desktop/375px screenshot pair
  for each of the three screens.
- Repointed tests: none expected. If `DataTable` renders the card list before the table (as
  participation does today and delivery does after) any test asserting document order of the two
  halves would follow; none does today.
- New dependency: none.

#### G03-03 — One read of an event's participants (saves ~135)

- Now: the same full-outer-join over invitations and attendance records is written twice.
  `attendance/read.ts:49-91` and `participation.ts:84-136` have the same two CTEs, the same
  `coalesce(season_membership_id, person_id) as anchor_id`, the same `displayName("p")`, the same
  `current_rsvp` join; they differ by `issued_at`, `r.reason`, the delivery lateral, the
  `recorded_by` join and the ORDER BY. The five headline counts are written a third time:
  `summariseAttendance` over rows (`attendance-vocabulary.ts:56`), `readEventAttendanceSummary`'s SQL
  (`read.ts:250-276`) and `readHeadlineIn`'s SQL (`participation.ts:203-217`) — three definitions of
  "invited, said yes, showed, recorded". `participantKey` is declared twice (`attendance/shared.ts:30`,
  `participation.ts:169`) and `asIsoString` twice with a real difference: `read.ts:123` returns a
  string unchanged, `participation.ts:163` re-parses it through `new Date(...)`.
- Smallest honest shape: `src/lib/services/event-roll.ts` (server-only), holding
  `participantRollSql({ delivery, recordedBy })`, `ROLL_COUNTS_SQL`, `participantKey` and one
  `asIsoString`. `AttendanceBoard` drops `invitedCount`/`recordedCount`/`walkUpCount`/`mismatchCount`
  (`read.ts:26-29,149-152,227-230`) — only `attendance-locked-screens.tsx:71-74` reads them, and it
  can read `board.summary` plus one `filter(...).length`.
- Behaviour held by: `services/attendance.test.ts` (board rows, walk-up rows, recruit rows, the
  closed-register zeroes), `participation.test.ts` (row shape, no row multiplication on two delivery
  jobs at `:396`, the email fallback exclusion at `:523`), `participation.test.ts:763-795` (no
  delivery or invitationId key at the club-link tier), `participation-view.test.ts:707-745`.
- Lines: 705 → 450 plus 120 for the shared module, because two 50-line queries and three count
  blocks become one builder and one counts statement.
- Risk: the highest in this section, and it is a privacy risk, not a rendering one — a builder that
  always selected the delivery columns would widen the club-link tier. The builder takes the flag and
  `buildClubLinkParticipationIn` keeps its field-by-field projection (`participation.ts:430-441`);
  `participation.test.ts:763` fails with a positive control if either slips. Second risk: the two
  `asIsoString` implementations must be reconciled deliberately, not silently — `invitedAt` is a
  `timestamptz` and both spellings produce the same ISO string today, which is why nothing caught the
  difference.
- Repointed tests: none. `readEventAttendanceSummary` and `readAttendanceBoard` keep their
  signatures.
- New dependency: none.

#### G03-04 — Copy lives where it is used (saves ~100)

- Now: three route `presentation.ts` files export 118 names between them (38, 21, 59), and measured
  across all of non-test `src/`, 51 of those are plain strings read exactly once and by no test:
  `attendance/presentation.ts` 16 (for example `ATTENDANCE_HEADLINE_PREFIX:117`,
  `WALK_UP_SUBMIT:256`, `SAVE_FAILED_HEADLINE:218`), `delivery/presentation.ts` 10 (`NEEDS_ATTENTION_HEADING:22`,
  `VIEW_DIAGNOSTICS:46`, `REPAIR_HEADING:110`), `participation/presentation.ts` 25
  (`WHAT_DID_THEY_SAY:190`, `CANCEL:214`, `RECORDING:215`, the six `FILTER_*_LABEL`s at `:136-142`).
  Each costs one declaration line plus one line in the consumer's import list and buys nothing: the
  string has exactly one reader.
- Smallest honest shape: each of those 51 strings becomes the literal at its single use site. What
  stays in `presentation.ts`: every vocabulary table (`PRESENCE_LABELS`, `DELIVERY_STATE_LABELS`,
  `TABLE_HEADINGS`, `MISMATCH_LABELS`), every formatter (`describeRsvp`, `describeRetryability`,
  `answerLabel`, `capacityLabel`), every string two or more files read (`NOTHING`,
  `COACH_RETURN_TO_ELIGIBLE`, `WALK_UP_LABEL`), and every string a test imports as its assertion
  anchor (`EVENT_QUESTIONS_HEADING`, `RESPONSE_YES_LABEL`, `CLUB_LINK_UNAVAILABLE_HEADLINE`,
  `SORTABLE_NOTE`, `describeOperatorLock`, `describeCoachLock`, `COACH_BOARD_SUBTITLE`,
  `recordAnswerDialogTitle`, `recordAnswerEventSubtitle`).
- Behaviour held by: the three screen test files assert rendered text, not the constants — which is
  why none of the 51 is referenced by a test at all. The screenshot pairs are the second proof.
- Lines: 502 across the three files plus ~50 consumer import lines → ~450 and ~0, because a string
  with one reader does not need a name, an export, or an import.
- Risk: a retyped string drifts from the approved copy. Caught by the screen tests that assert the
  sentence and by the wireframe pairing; mechanically, the rewrite is a move of the literal, not a
  retype.
- Repointed tests: none, since no test references any of the 51. The Lead should rule on this once: every
  route in the application has this `presentation.ts` habit, so the same count exists in every other
  section.
- New dependency: none.

#### G03-05 — The CSV plan as a column rule table (saves ~96)

- Now: `plan.ts:175-336` parses eleven cells in sequence by hand — `said(cells.x) ? trimmed(...)`
  five times, `parseTimeCell` twice, `parseBooleanCell` twice, a date branch — then builds
  `PlannedInput` twice, once for a new row (`:245-258`) and once merged against the match
  (`:273-287`), the two differing only by `?? match.field`. Four `PlannedRow` literals follow
  (`:260-270`, `:293-303`, `:325-335`, `refused` at `:345-355`), each ten lines of the same nine
  keys. `compare.ts:34-58` is a 24-line switch over eleven columns, and `blankCells`/`newCells`/
  `currentCells`/`updatedCells`/`rawCells` (`:75-118`) are five builders of one record shape.
- Smallest honest shape: one table, `COLUMN_RULES: Record<ImportColumn, { read(cell, reasons): V |
null; of(event): string }>`, which replaces both the per-cell parse sequence and `valueOf`'s
  switch; `merged = { ...parsed, ...fallbacks(match) }` from one key list; one `plannedRow(outcome,
{...})` builder; one `cellsFrom(source, { id, changes })`.
- Behaviour held by: `services/event-csv.test.ts` (606 lines — header refusals, per-cell refusal
  sentences, duplicate ids, five-minute steps, the worked example parsing into two New rows) and
  `event-import.test.ts` (534 — digest moved, nothing-to-apply, draft-only).
- Lines: 451 → 355, because eleven hand-written cell parses and five record builders become one
  table and two builders.
- Risk: refusal sentences are asserted verbatim and their **order** within a row matters (the screen
  joins `reasons` with a space, `import/presentation.ts:53`). A table iterated in column order
  produces the same order as the current sequence only if the table is declared in
  `IMPORT_COLUMNS` order with date before start/end; `event-csv.test.ts` catches a reorder.
- Repointed tests: none.
- New dependency: none. A schema library (zod) would also express this, but it would not produce
  these sentences, so it would cost copy and a dependency to save nothing.

#### G03-06 — One shape for a server-action form (saves ~84)

- Now two halves of the same duplication. Server side: `text(formData, field)` is declared
  identically in 10 files, four of them here (`attendance/actions.ts:21`, `delivery/actions.ts:11`,
  `import/actions.ts:16`, `record-answer-actions.ts:20`); `messageFor(error)` in 8, four of them
  here. `attendance/actions.ts` then builds the same six-field state object by hand three times
  (`:46-53`, `:60-67`, `:69-76`) and once more at `:92-99`, while `EMPTY_SAVE_STATE` already exists
  (`action-state.ts:13`) and is never spread. Client side: "hidden inputs, a submit button with a
  pending label, a `Notice` for the error, claimed in the outcome slot" is written out at
  `repair-forms.tsx:37-65` and `:107-138`, `attendance-row.tsx:87-149` and `:192-222`,
  `walk-up-form.tsx:40-118`, `record-answer.tsx:252-399` — and in 22 further files outside this
  section (28 files call `useActionState`).
- Smallest honest shape: `src/lib/form-action.ts` with `text` and `messageFor` (12 lines, server
  only), and `src/components/action-form.tsx` (55 lines) with

  ```tsx
  export function ActionForm({ action, hidden, submit, pendingLabel, slotKey, testId, errorTestId,
    disabled, disabledReason, cancel, children }: {...})   // form + hidden inputs + ActionBar + Notice
  export function Disclosure({ openLabel, testId, children }: {...})  // the closed/open pair
  ```

  `RemoveAttendance` (`attendance-row.tsx:164-224`) and `RevokeAndReissueForm`
  (`repair-forms.tsx:74-139`) are the same disclosure-around-a-form twice.

- Behaviour held by: `attendance/actions.test.ts` (517 lines, every refusal path and the attempted/
  committed distinction), `delivery/actions.test.ts`, `record-answer-actions.test.ts`,
  `attendance/screens.test.tsx` (per-row Saving/Saved/failed), `delivery/screens.test.tsx`
  (`retry-unavailable`, `reissue-form`).
- Lines: 316 of actions → 254, and 449 of forms → 360, plus 67 of shared code, because the repeated
  parse/refuse/result literal becomes one call and the form chrome becomes one element.
- Risk: the per-row state rule — "what is recorded comes from server props only, never from `state`"
  (`attendance-row.tsx:51-54`) — is a found defect's fix and must survive; `ActionForm` therefore
  renders the error, never the committed value. Caught by `attendance/screens.test.tsx`'s
  remove-then-read assertions.
- Repointed tests: none expected; every assertion is on testids and text the props carry.
- New dependency: none. (This is the piece most used outside this section: 22 other files.)

#### G03-07 — One vocabulary, one clock (saves ~57)

- Now, two duplications with the same cause. Vocabulary: `PRESENCE_LABELS` is declared identically at
  `attendance/presentation.ts:8-13` and `participation/presentation.ts:68-73`; the seven delivery
  labels at `delivery/presentation.ts:8-16` and `participation/presentation.ts:82-90`;
  `NOT_DISPATCHED_NO_CHANNEL`/`WHATSAPP_UNRESPONSIVE` at `delivery/presentation.ts:19-20` and
  `participation/presentation.ts:95-96`; the three-line exception rule itself twice
  (`deliveryRowLabel`, `delivery/presentation.ts:34-38`, and `deliveryChipLabel`,
  `participation-table.tsx:130-134`); and the "needs attention" definition twice
  (`delivery/presentation.ts:96` and `participation-view.ts:282`, whose comment says "Matches
  delivery/presentation.ts"). `participation/presentation.ts` already re-exports four things from
  the attendance screen for exactly this reason (`:20-31`) — the habit exists, it is just not
  finished. Clock: there is no shared date-and-time formatter, so six files in this section write
  their own `Intl.DateTimeFormat` at Europe/London — `attendance/presentation.ts:72-86` and again
  inline at `:226-231`, `delivery/presentation.ts:147-158`, `participation-table.tsx:56-68`,
  `participation/event-facts.tsx:25-45`, plus `record-answer.tsx:50-65` — and four more files outside
  it do the same.
- Smallest honest shape: move the presence labels to `attendance-vocabulary.ts` (which owns
  `ATTENDANCE_PRESENCES`) and the delivery labels and the two exception strings to a new
  `src/lib/services/delivery-labels.ts` (a new file, not a change to the carved-out
  `delivery.ts`), each imported by both readers; keep one `deliveryLabelFor(row)`. Add
  `formatClubTimestamp(iso)` ("27 Aug 2026, 14:00"), `formatClubTime(iso)` ("20:07") and
  `clubNowAsLocalDate()` to `src/lib/club-time.ts`, beside `formatClubDay` and `todayInClubZone`
  (18 lines), and delete the six local formatters.
- Behaviour held by: `attendance/screens.test.tsx` (the `Saved - name - 20:07` line),
  `delivery/screens.test.tsx` (attempt times), `participation/screens.test.tsx` (the Invitation sent
  column), `attendance-vocabulary.test.ts`. The three spellings differ today —
  `formatAttemptTime` prints day and month with no year, `formatWhen` prints the year, the
  attendance line prints time only — so three named formatters are required, not one.
- Lines: 75 of duplicate tables and local formatters → 18 shared, because three copies of a
  seven-row label table and six copies of an `Intl` call become one each.
- Risk: a formatter consolidated too far changes a rendered string. The mitigation is that each of
  the three output shapes keeps its own function; the screen tests assert the rendered text, and
  `docs/ux/standards.md` rule 3 is what the shared home is for.
- Repointed tests: none.
- New dependency: none.

#### G03-08 — One calendar arrangement pair (saves ~54 here, ~150 across the application)

- Now: `events/calendar/calendar-views.tsx` (157) and `calendar/view/page.tsx:157-254` are the same
  two arrangements written twice — same `parseMonth`/`defaultMonth`/`buildMonthGrid`/`monthOf`
  sequence (`calendar-views.tsx:51-53` against `view/page.tsx:171-173`), same `GregorianControls`
  block, same `TypeLegend` + `GregorianMonth`, same `LeftOver`/`Undated` block (`:133-170` against
  `:228-253`, identical but for the testid), same `NO_TERMS_CONFIGURED` refusal. Both pages also
  write the same two `ViewSwitch` blocks (`calendar/page.tsx:88-123`, `view/page.tsx:109-144`).
- Smallest honest shape: `src/app/calendar/arrangements.tsx` exporting
  `CalendarArrangements({ mode, events, year, params, today, tile, paths, testIdPrefix, extras })`,
  where `extras` carries the operator-only "outside the year" block and `paths` carries the base
  path, the mode hrefs and the all-events link. Both pages then read their list, build their tile
  function and render one element.
- Behaviour held by: `events/calendar/screens.test.tsx` (876 lines, `gregorian-view`,
  `oxford-view`, `undated-events`, `outside-the-year`, month navigation),
  `src/app/calendar/screens.test.tsx`, `tests/public-calendar-side-effects.test.ts`.
- Lines: in this section 279 → 110 plus 115 for the shared component; `calendar/view/page.tsx` drops
  about 95 more in the section that owns it.
- Risk: the two surfaces' testid prefixes (`public-` or none) and the public page's absent
  "outside the year" block are the whole difference; a prefix mistake fails both screen test files
  immediately.
- Repointed tests: none.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  `participation-filters.tsx:53-89` (`FilterSelect`) -> `SelectField` in `components/field.tsx:34`
  (plus a `native` slot); `attendance-filters.tsx:89-116` and `delivery-filters.tsx:55-68` (bare
  `Field select` with hand-written `MenuItem` loops) -> `SelectField`'s `options`;
  `attendance/presentation.ts:16-23` (`PRESENCE_COLORS`) -> `STATUS_VOCABULARY.attendance` in
  `components/status-chip.tsx:78`, which already holds present/late/excused/absent with colours;
  `delivery-overview.tsx:96-153` (a hand-built row with a bottom border) -> `RowCard` /
  `RowCardList`.
- Pieces two or more routes write that should become one component:
  `participation-table.tsx` + `delivery-diagnostics.tsx` + `import-screen.tsx`
  (+ `participation-preview.tsx`, + the roster/people/events/follow-ups tables outside this
  section) -> `DataTable`
  in `src/components/data-table.tsx` (G03-02); the six action forms listed in G03-06 ->
  `ActionForm` and `Disclosure` in `src/components/action-form.tsx`; `copy-link.tsx:13-30` and
  `import-screen.tsx:250-281` (`CopyPromptButton`) are the same clipboard-with-fallback button
  twice -> one `CopyButton` (about 20 lines saved, listed here rather than as a proposal);
  `calendar-views.tsx` + `calendar/view/page.tsx` -> `CalendarArrangements` (G03-08).
- Kit members this section needs changed to absorb a local copy: `SelectField` — a `native` option,
  because `participation-filters.tsx:74-78` must keep a real `<select>`; `ListFilters` (not in the
  kit, but the shared bar) — optional sort/order selects, per-field `testId` and `native`, an
  optional clear link, and `scroll: false` (G03-01); `RowCard` — nothing, it already takes
  `sublines` as nodes, which is how `DataTable` renders the phone half.
- Placement, costing nothing but worth recording: `src/app/participation/` is ten files under
  `src/app/` with no `page.tsx`, rendered by `/operate/events/[id]`, `/e/[token]` and
  `design-preview`. By `docs/architecture/components.md`'s own rule ("a piece two routes render is
  written once in `src/components/`") it is a kit directory living in the route tree. Moving it
  saves no lines.

### Product questions

1. **Two screens answer "who is coming and who turned up" differently.** The attendance board
   (`/operate/events/<id>/attendance`) groups people into Recruits / Attending / Everyone else /
   Walk-ups (`attendance/presentation.ts:151-203`), filters by `rsvp` and `attendance`
   (`attendance-filter-logic.ts`), and says "RSVP: Attending" (`:26-31`). The participation table on
   the event page lists the same people flat, filters by `as`/`answer`/`att`/`delivery`
   (`participation-view.ts:253-284`), and says "Yes" (`participation/presentation.ts:61-66`). Two
   filter engines, two vocabularies and two groupings over one event's audience. Merging them would
   save several hundred lines; it cannot be done without choosing which screen's words and grouping
   win, so it is not proposed.
2. **Two headline rows for one event.** The register shows Invited / Recorded / Walk-ups /
   Mismatches (`attendance-locked-screens.tsx:70-75`); the event page and the club link show
   Invited / Said yes / Showed-over-invited (`participation/event-facts.tsx:93-105`). Both are
   correct and they agree, but they are two sets of numbers for one question and two derivations to
   keep honest (G03-03 makes the derivation one; the two displays stay).
3. **"Showed / invited" with nothing recorded.** `formatShowedAgainstInvited` renders `— / 47`
   while W7's note records `NA / 47`, and `participation/presentation.ts:19` says so in a comment
   and leaves it open. One glyph has to be chosen before the function can have one caller's answer.
4. **Mismatch and discrepancy are the same idea with two names and two class lists.** The
   stored view emits four classes (`discrepancy-vocabulary.ts:2-7`), the register drops one of them
   in code (`attendance/read.ts:173`, D74) while still carrying a label for it
   (`attendance/presentation.ts:34`), and the participation table derives a third set of three
   including one the view cannot emit (`never_answered_attended`). The register calls the column
   Mismatches; the table draws `≠` and calls it a discrepancy. One name and one class list would
   remove a label table and a derivation; which name and which list is the club's.

### Not proposed

- `src/lib/services/csv.ts` (114): keep. The character-scanning parser earns its length — BOM, lone
  CR, doubled quotes, a mid-field quote treated as literal (`:68-77`), the formula guard and its
  inverse. A regex tokeniser would be shorter and would change the mid-field-quote behaviour.
- `src/lib/services/attendance/write.ts` (385 -> 360): keep, with two tidies counted in the module
  table — the update/insert branch extracts `id`/`recorded_at` twice (`:233-266`) where one row
  variable does, and the recorder's name and the subject's name are two queries (`:278-290`) that
  are one with two scalar subselects (also one fewer round trip).
- `src/lib/services/attendance-window.ts` (48) and `attendance-vocabulary.ts` (55): keep. The
  two-pass London offset (`:45-46`) is the smallest correct form, and the vocabulary is the one
  place the four presences and the summary shape are defined.
- `src/lib/services/event-csv/prompt.ts` (37) and `export.ts` (39): keep. The prompt is the copy;
  the FNV digest and the export row are each one expression.
- `attendance-groups.tsx` (104): keep. The search/restore open-state dance (`:51-72`) is a
  deliberate render-time adjustment, and `ControlledSection` already owns the disclosure.
- `question-counts.tsx` (53), `origin.ts` (12), `import/export/route.ts` (27),
  `delivery-layout.tsx` (32), `action-state.ts` (27), `import-state.ts` (16),
  `record-answer-state.ts` (15): keep. The three `*-state.ts` files exist because a `"use server"`
  module may export only async functions; they are three interfaces and three empty constants.
- `src/app/operate/unavailable.tsx` (17 lines, not this section's file): it is `Refusal` with the
  same four props and no added behaviour, and the five-line try/catch that wraps every service read
  is written out in `attendance/page.tsx:66-79`, `delivery/page.tsx:33-46`, `import/page.tsx:16-29`,
  `calendar/page.tsx:44-53` and eight more routes. One `readOrRefuse(read, { title, testId, back })`
  would remove about 8 lines per route across twelve routes. Flagged for whichever section owns
  `src/app/operate/`, not proposed here.
- `discrepancy-vocabulary.ts:2-22` and `participation-view.ts:190-198` (`EMPTY_FILTERS`): only test
  files reference `STORED_MISMATCH_CLASSES`, `NOT_DERIVED`, `NOT_STORED` and `EMPTY_FILTERS`
  (measured over `src/`, `tests/` and `scripts/`). They are drift-guard fixtures living in `src/`;
  moving them into `participation-view.test.ts` and `club-link-availability.test.ts` removes 21
  measured lines and changes nothing else. Counted in the module table; recorded here because it is
  a measure-shaped move, not a rewrite, and the Lead may prefer to leave it.
- `response-deadline.ts` (11): four type fields read only by `event-approval/shared.ts` and
  `event-approval/write.ts`. Folding it there saves about 8 lines and touches another section's
  file.
- Stale comment, no lines: `delivery/presentation.ts:118` says the fallback copy is kept in one file
  "so `tests/no-manual-delivery.test.ts` can scan one file for the ban". That scan no longer exists
  — that test now checks schema, service and runbooks only, and says so at its own
  lines 17-31. The constant is free to move with G03-04.
- Carve-outs read for context, proposed on nowhere: `src/lib/services/delivery.ts`,
  `src/lib/delivery/**`, `src/lib/db/**`, `src/lib/auth/**`, `src/lib/rsvp/**`.

---

## G04 — the public calendar and feed, the operator shell, sign-in and the routes

Lines now: 5240 (measured as 5861 before the JSDoc correction). Lines after everything proposed: 5130. Saved: 731 (12%).

Two proposals host a shared piece in this section and spend most of their saving
elsewhere: a further **~250 lines fall in the operator-events section**
(`operator-list.tsx` −114, `operate/events/calendar/calendar-views.tsx` −136)
once the list and the arrangements are written once. Repo-wide this section's
proposals remove about 980 lines.

Counting note: the brief's measure is non-blank lines excluding `//` lines, so a
`/** */` block counts. Nothing below claims a saving for deleting a comment; a
deleted function takes its own doc block with it, and every new helper's
estimate includes one.

### Files read

All 77 files in the brief. Carve-outs read for context only and proposed
nothing in: `src/lib/auth/{capabilities,guards,operator,recovery,destination,
invitation,event-tier}.ts`, `src/lib/db`, `src/lib/supabase/*`,
`src/lib/rsvp/public-surface.ts`, `src/lib/delivery/{config,whatsapp-cloud,
phone-shape}.ts`, `src/lib/services/{delivery,messaging-scheduler}.ts`.
Also read for context (other sections' files, cited below):
`src/app/operate/events/{page.tsx,operator-list.tsx,calendar/calendar-views.tsx}`,
`src/lib/services/{event-vocabulary.ts,events/shared.ts,events/public-tier.ts,
event-input.ts}`, `src/components/{public-shell,sortable-header,row-card}.tsx`.

### Modules

| Module or surface                                                                                                                                 | Lines now | What it does                                                                                               | Proposed shape                                                                                                                                                                                                                                                                                    | Lines after | Tests that prove it                                                                                                                                                     | Risk, and how it is caught                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public list page — `calendar/page.tsx`, `public-filters.tsx`, `query.ts`, `routes.ts`                                                             |       324 | Reads the open season's public events, builds the year, buckets by period, renders the filter bar and list | Rewrite as one page: delete `public-filters.tsx` (a 57-line prop forwarder to `ListFilters`, no logic of its own), fold the read→year→buckets→sort-link block into `eventListFrame()` in `query.ts` (the operator page repeats it verbatim), collapse `emptyTestId`/`emptyMessage` into one table |         269 | `src/app/calendar/screens.test.tsx:200-364`; `tests/public-calendar-side-effects.test.ts`                                                                               | Wrong bucket boundaries or a changed empty sentence; the three empty states are asserted separately (`screens.test.tsx:331-350`)                                                       |
| The list itself — `public-list.tsx`, `sortable-header.tsx`, new `components/bucketed-list.tsx`                                                    |       188 | The desktop table and the phone card list, per period bucket                                               | Rewrite as G04-01: one kit list fed a column definition; `sortable-header.tsx` deleted into the kit member                                                                                                                                                                                        |         120 | `screens.test.tsx:211-330`                                                                                                                                              | A dropped column or a changed phone subline; every column is asserted by text                                                                                                          |
| Period and view switches — `period-switch.tsx`, `view-switch.tsx`                                                                                 |       124 | Period buttons/select; the List↔Calendar and Calendar↔Oxford link pairs                                    | Keep; both are already href-only and shared by the two tiers                                                                                                                                                                                                                                      |         118 | `screens.test.tsx:304-330,368-385`                                                                                                                                      | None beyond the `carry` keys, which the tests follow through                                                                                                                           |
| Calendar arrangements — `view/page.tsx`, `calendar-controls.tsx`, new `calendar/arrangements.tsx`                                                 |       369 | Gregorian month and continuous Oxford year, with month nav and the jump control                            | Rewrite as G04-02: `GregorianArrangement`/`OxfordArrangement`/`LeftOver` written once and shared with the operator calendar                                                                                                                                                                       |         350 | `screens.test.tsx:367-588`; `src/app/operate/events/calendar/screens.test.tsx`                                                                                          | Test ids and base paths differ per tier; both pass through props, and both suites assert them                                                                                          |
| The two grids — `gregorian-month.tsx`, `year-column.tsx`, `calendar-entry.tsx`, `type-legend.tsx`                                                 |       605 | Draw a month and an academic year as tables, plus a phone reflow of each                                   | Rewrite as G04-03: one day-number, one entry list, one head cell; grids keep their own frames                                                                                                                                                                                                     |         523 | `screens.test.tsx:386-588`; `src/lib/services/oxford-year.test.ts:390-405`                                                                                              | The accessible name on a cell; the hidden-then-visible pair is asserted per cell                                                                                                       |
| Calendar presentation — `presentation.ts`, `tile-status.ts`, `year.ts`, `public-shell.tsx`                                                        |       217 | Date/label formatting, the tier's tile word, the one built academic year                                   | Rewrite as G04-04: `formatCellDate` is `formatShortDate` verbatim; `templateColour`/`TypeColour` are aliases; `SHORT_ORDINALS` duplicates `OXFORD_WEEK_ORDINALS`; `public-shell.tsx` wraps the kit shell to compute one caption                                                                   |         144 | `src/app/calendar/presentation.test.ts` (all 138 lines); `screens.test.tsx:272-283,424-442`                                                                             | A changed date string anywhere on a calendar; `presentation.test.ts:36-58` pins the exact words                                                                                        |
| Public event page — `calendar/[id]/page.tsx`                                                                                                      |       150 | One event as a stranger sees it: facts, cancelled chip, joining link                                       | Keep the page; move `whereItIs` (duplicated at `public-list.tsx:150` and `operate/events/operator-list.tsx:182`) to `event-vocabulary.ts`                                                                                                                                                         |         141 | `screens.test.tsx:589-731`                                                                                                                                              | The joining-link rule; `screens.test.tsx:635-704` pins present, absent and never-explained                                                                                             |
| Subscribe and feed — `subscribe-dialog.tsx`, `feed.ics/route.ts`, `calendar-feed.ts`                                                              |       414 | W2: the two-screen dialog, the route, and the RFC 5545 document                                            | Keep the feed builder (folding, escaping and DST are all load-bearing); trim the dialog's hand-built tick circle and `labelFor`, and `calendar-feed.ts`'s three copies of trim-or-null                                                                                                            |         383 | `src/app/calendar/subscribe-dialog.test.tsx`; `src/lib/services/calendar-feed.test.ts`; `feed.ics/route.test.ts`; `tests/calendar-feed-side-effects.test.ts`            | A malformed VEVENT reaches real calendar apps; the feed test asserts the document line by line                                                                                         |
| Calendar/year services — `calendar.ts`, `oxford-year.ts`                                                                                          |       613 | Month grid, week arithmetic, the continuous year with vacation trimming                                    | Rewrite as G04-05: `oxford-year.ts` re-implements `dayMs`, `daysBetween`, `byStartTime`, `byDate` and `groupByDay` from `calendar.ts`; three copies of "nearest term span"                                                                                                                        |         540 | `src/lib/services/calendar.test.ts`; `oxford-year.test.ts` (604 lines)                                                                                                  | Undated ordering on the Oxford View, and vacation trimming; `oxford-year.test.ts:317-389,468-520`                                                                                      |
| Seasons — `seasons.ts`                                                                                                                            |       122 | The open season and every term row                                                                         | Rewrite: `Term` is field-for-field `TermWindow` (`event-input.ts:206-214`), and `listTermWindows` is a 12-line identity mapper over `listTerms`, which nothing else calls                                                                                                                         |         100 | `src/lib/services/seasons.test.ts:100-130`                                                                                                                              | Date coercion (`asDate`) is the only real logic and stays; the suite asserts `YYYY-MM-DD`                                                                                              |
| Operator shell — `shell-nav.tsx`, `operator-shell.tsx`, `operate/layout.tsx`, `destinations.ts`, `operate/page.tsx`                               |       436 | One nav element set laid out two ways; the destination tables                                              | Keep `shell-nav`'s layout (the `sx` array is documented as load-bearing at both widths); rewrite `destinations.ts`'s 11 entries without per-entry `Object.freeze` and `as CapabilityKey`; one `SignOutButton`                                                                                     |         388 | `src/app/operate/shell.test.tsx:442-900`                                                                                                                                | Breakpoint behaviour; `shell.test.tsx:700-860` asserts the declared `sx` at each width                                                                                                 |
| Gate and refusals — `gate.tsx`, `account-state.tsx`, `not-permitted.tsx`, `coach-not-permitted.tsx`, `unavailable.tsx`, new `refusal-screens.tsx` |       184 | The per-page gate and its four refusal screens                                                             | Rewrite as G04-07: four `Refusal` call sites with three copies of the same sign-out form become one `ShellRefusal` plus a copy table; `unavailable.tsx` kept (20 call sites, a rename not a wrapper)                                                                                              |         127 | `shell.test.tsx:298-696`; `tests/operate-route-protection.test.ts`; `tests/coach-attendance-boundary.test.ts`                                                           | The approved sentences are owner-fixed (LAN-107); `shell.test.tsx:299,340` assert them exactly                                                                                         |
| Filter bar — `list-filters.tsx`, `filter-search.ts`, `board-filter-controls.tsx`                                                                  |       351 | The shared search/filter bar, its debounce hook, the boards' own affordances                               | Keep both; delete `StatusPill` (`board-filter-controls.tsx:122-132`), which passes `StatusChip`'s three props straight through, and repoint its four importers                                                                                                                                    |         333 | `src/app/operate/list-filters.test.tsx`; `roster/board-screens.test.tsx`                                                                                                | Chip colour by domain; `status-chip.test.tsx` owns the table                                                                                                                           |
| Unbuilt privileged actions — `operate/actions.ts`, `not-implemented.ts`, `labels.ts`                                                              |        38 | Five `"use server"` actions that guard a capability then throw; a one-line re-export                       | Delete because nothing renders or calls them: no importer outside `actions.test.ts`, and guard parity is proven repo-wide by `tests/service-layer-guard-parity.test.ts`. `labels.ts` re-exports `labelFor` for three importers                                                                    |           0 | `src/app/operate/actions.test.ts`; `src/app/operate/labels.test.ts`                                                                                                     | Five server-action endpoints disappear; no UI reaches them, so no route renders differently                                                                                            |
| Sign-in — `login/page.tsx`, `login-form.tsx`, `login/actions.ts`, `app/page.tsx`, `auth-shell.tsx`, new `components/action-form.tsx`              |       161 | UX-01, shared by `/` and `/login`; the sign-in action                                                      | Rewrite as G04-06: the page builds the shell `AuthShell` already builds; the form is one of 34 hand-written `useActionState` forms                                                                                                                                                                |         172 | `src/app/login/screens.test.tsx`; `tests/auth-flow.test.ts`                                                                                                             | The redirect guard is in `@/lib/auth/destination` and untouched; `screens.test.tsx` asserts the `redirectTo` pass-through                                                              |
| Recovery — `forgot-password/*`, `reset-password/*`                                                                                                |       305 | Request a link, then set the password; the two actions                                                     | Rewrite as G04-06 for the two forms; keep both actions (constant-response timing and the `amr` recheck are the security)                                                                                                                                                                          |         241 | `forgot-password/{actions,screens}.test.ts(x)`; `reset-password/{actions,screens}.test.ts(x)`; `tests/auth-recovery-flow.test.ts`                                       | A changed refusal or a leaked account oracle; the action tests assert one shape, status and duration for every outcome                                                                 |
| Email-link exchange — `auth/invitation/route.ts`, `auth/recovery/route.ts`                                                                        |       122 | Exchange the emailed token for a session, then 303 to one fixed destination                                | Keep. They are the same 19 code lines twice under 40 lines of rationale each: sharing them saves ~2 code lines and costs the per-route reasoning                                                                                                                                                  |         122 | `auth/{invitation,recovery}/route.test.ts`; `tests/auth-{recovery,invitation}-configuration.test.ts`                                                                    | n/a                                                                                                                                                                                    |
| Policies — `(policies)/*`                                                                                                                         |       276 | Privacy, terms and deletion prose, with a shared heading/section pair                                      | Rewrite: `PolicySection` takes its paragraphs as a list instead of 28 hand-tagged `<Typography>` pairs; `PolicyHeading` is a local `PageHeader`; the layout's bare `Alert` is `Notice`                                                                                                            |         239 | `tests/link-preview-metadata.test.ts` only — the prose itself is pinned by no test, stated plainly                                                                      | Wording is legal text: the rewrite must move strings, not edit them; a reviewer diffs the rendered paragraphs                                                                          |
| `/dashboard`                                                                                                                                      |        64 | LAN-71's session-proof page, titled "Protected page"                                                       | Product question 1 — `design-system.md` §8 lists it as an open owner finding (B7). Delete would be −64                                                                                                                                                                                            |          64 | `src/app/dashboard/page.test.tsx`; `tests/operate-route-protection.test.ts`                                                                                             | Deleting a route is a product change, so it is not taken here                                                                                                                          |
| API routes — `api/{health,scheduler/messaging,venue-search,webhooks/whatsapp}`                                                                    |       192 | Deploy readiness, the sweep trigger, the geocoding proxy, Meta's callbacks                                 | Keep all four. Order of operations is the security in two of them, and every line is a distinct refusal                                                                                                                                                                                           |         192 | `api/{health,venue-search,webhooks/whatsapp}/route.test.ts`. `api/scheduler/messaging/route.ts` has no test: its 401/503 and token compare are unpinned, stated plainly | Both routes hand-roll a constant-time compare (`messaging/route.ts:25-29`, `whatsapp/route.ts:25-31`); the webhook's compares length first, the scheduler's hashes to a fixed 32 bytes |
| Venue search — `venue-search/{config,provider,photon,suggestion}.ts`                                                                              |       255 | One address search behind one provider, failing closed                                                     | Rewrite as two files: `config.ts`'s three-interface union is one inline return type; `describeMissingConfiguration` has no caller in `src/`; `suggestion.ts` is a types-and-constants file for its two siblings                                                                                   |         220 | `venue-search/{config,photon,provider}.test.ts`; `api/venue-search/route.test.ts`                                                                                       | Must keep failing closed on a bad base URL; `config.test.ts` asserts each refusal                                                                                                      |
| Club link — `e/[token]/{page,actions}.ts(x)`                                                                                                      |       132 | W7-03: the token-held participation view                                                                   | Keep; replace the local `interface PageProps` (`page.tsx:48-51`) with the generated `PageProps<"/e/[token]">`                                                                                                                                                                                     |         125 | `src/app/participation/screens.test.tsx`; `tests/token-link-preview-safety.test.ts`                                                                                     | The throttle-then-read order; the participation suite renders the live and unavailable states                                                                                          |
| Root layout and manifest — `app/layout.tsx`, `manifest.ts`                                                                                        |        82 | Fonts, theme, metadata template; the installable manifest                                                  | Keep; both are declaration, already one statement per fact                                                                                                                                                                                                                                        |          82 | `tests/link-preview-metadata.test.ts`                                                                                                                                   | n/a                                                                                                                                                                                    |
| Small shared libs — `club-time.ts`, `actor.ts`, `safe-uri.ts`, `sql-text.ts`, `validation/contact.ts`                                             |       137 | The club clock, the actor guard, the URI rule, shared SQL fragments, contact shape checks                  | Keep all five; each is already the one copy its many callers share                                                                                                                                                                                                                                |         137 | `club-time.test.ts`, `actor.test.ts`, `safe-uri.test.ts`, `validation/contact.test.ts`                                                                                  | `roster-board/shared.ts:54` declares a second `actorRequirement` — a finding for that section, not this one                                                                            |

### Proposals

#### G04-01 — One bucketed list fed a column definition (saves ~68 here, ~114 in operator-events)

- Now: `public-list.tsx` states the same five fields twice — as table cells
  (`public-list.tsx:75-110`) and again as card sublines
  (`public-list.tsx:116-142`) — and the column labels a third time as
  `PUBLIC_SORT_OPTIONS` (`calendar/page.tsx:174-180`) for the phone sort select.
  `operate/events/operator-list.tsx:1-16` is the same file with two more
  columns, and repeats the pair again. `calendar/sortable-header.tsx` is 37
  lines that turn `{link, sort, direction}` into the kit member's props and add
  nothing else.
- Smallest honest shape: one kit member `src/components/bucketed-list.tsx`:

```tsx
export interface ListColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  cell: (row: T) => ReactNode; // desktop cell
  text?: (row: T) => string; // card subline; defaults to cell when it is a string
}
export function BucketedList<T extends { id: string }>(props: {
  buckets: readonly PeriodBucket<T>[];
  columns: readonly ListColumn<T>[];
  sort: string;
  direction: string;
  sortLinkFor: (column: string) => SortLink;
  hrefOf: (row: T) => string;
  titleOf: (row: T) => string;
  chipsOf?: (row: T) => ReactNode;
  trailingOf?: (row: T) => string | undefined;
  struckOf?: (row: T) => boolean;
  testIds: { bucket: string; row: string; card: string };
}): ReactElement;
```

`public-list.tsx` becomes the five-entry column table plus one call; the sort
select reads `columns`, so a label cannot drift from its header again. The kit
member absorbs the local `SortableHeader` wrapper by taking `{link, sort,
  direction}` itself.

- Behaviour held by: `src/app/calendar/screens.test.tsx:211-330` (every column,
  the cancelled chip, the phone card, the row link, bucket grouping) and
  `src/app/operate/events/screens.test.tsx` for the operator twin.
- Lines: 188 → 120 here, because the 60 lines of duplicated cell/subline JSX
  become 5 column entries and one 75-line kit member; `operator-list.tsx`
  184 → ~70 in the operator-events section.
- Risk: a column silently dropped from the phone half, or a changed aria-label
  on a table. Both halves are asserted by visible text in the suites above, and
  the list is one of the paired screenshots.
- Repointed tests: `src/components/sortable-header.test.tsx` gains the
  `{link, sort, direction}` form; no assertion changes meaning.
- New dependency: none.

#### G04-02 — Both calendar arrangements written once (saves ~155 repo-wide; ~19 here)

- Now: `calendar/view/page.tsx:159-254` defines `GregorianArrangement`,
  `OxfordArrangement` and `Undated`.
  `operate/events/calendar/calendar-views.tsx:38-171` defines `GregorianView`,
  `OxfordView` and `LeftOver` — the same components with a different base path,
  different test ids, and one extra block. The empty state, the month nav, the
  legend, the grid and the undated list are assembled in the same order in both.
- Smallest honest shape: `src/app/calendar/arrangements.tsx` exporting
  `GregorianArrangement({ events, params, today, tile, basePath, allEventsHref,
testIds })` and `OxfordArrangement({ year, tile, testIds, leftOvers })`, with
  `LeftOver` private to it. `leftOvers` is a list of `{ events, testId,
headline, detail }`, which is exactly how the two tiers differ today.
- Behaviour held by: `src/app/calendar/screens.test.tsx:367-588` and
  `src/app/operate/events/calendar/screens.test.tsx` — both assert the view test
  ids, the month fallback on `?month=banana`, the no-terms warning and the jump
  control at both widths.
- Lines: 230 → 135 here plus an 85-line shared file (net −10);
  `calendar-views.tsx` 171 → ~35 (−136) in the operator-events section.
- Risk: a test id or base path crossing tiers, which would point a public reader
  at `/operate`. Both suites assert their own ids and hrefs; `tile` already
  carries the tier decision and stays a prop.
- Repointed tests: none — both suites render pages, not these components.
- New dependency: none.

#### G04-03 — One day cell and one entry list across both grids (saves ~82)

- Now: the tile block `const { href, status } = tile(event.id); return
<CalendarEntry … five props … />` is written four times
  (`gregorian-month.tsx:104-116,171-183`, `year-column.tsx:106-119,206-217`), at
  ~11 lines each. The visually-hidden-date-then-visible-number pair is written
  three times (`gregorian-month.tsx:95-102,150-151,166-169`,
  `year-column.tsx:199-204`). `year-column.tsx:252-264` has a `HeadCell`;
  `gregorian-month.tsx:48-64` inlines the same `th` with 12 lines of `sx`.
  `calendar-entry.tsx:18-29` holds two one-element frozen arrays and two
  predicates over them, whose only caller is `tile-status.ts`.
- Smallest honest shape: add to `calendar-entry.tsx` —
  `EntryList({ events, tile, showDate? })`, `DayNumber({ day, isToday,
emphasis })` and an exported `HeadCell`; delete `QUIET_STATUSES` and
  `STRUCK_STATUSES` and let `tile-status.ts` compare `status === "approved"` and
  `status === "cancelled"` where it already names both words.
- Behaviour held by: `src/app/calendar/screens.test.tsx:412-442` (tile href and
  the status word), `:386-411` (cells by `data-day`),
  `src/lib/services/oxford-year.test.ts:390-405` (every week is seven days).
- Lines: 605 → 523, because four 11-line tile blocks and three day-number blocks
  collapse to one call each against two ~12-line components.
- Risk: the accessible name losing the status the tile stays quiet about. That
  is asserted at `screens.test.tsx:424-442` and in the operator suite, which
  checks the quiet `approved` case explicitly.
- Repointed tests: none.
- New dependency: none.

#### G04-04 — The calendar's presentation layer is three formatters it already has (saves ~73)

- Now: `presentation.ts:52-58` `formatCellDate` produces `"Sat 21 Aug 2026"` —
  the same four parts in the same order as `event-vocabulary.ts:45-52`
  `formatShortDate`, which this section already imports at `public-list.tsx:12`.
  `formatDayNumber` and `formatMonthLabel` wrap one and two `formatDatePart`
  calls. `presentation.ts:71-76` declares `TypeColour` and `templateColour` as
  aliases of `TemplateColourSwatch` and `templateColourFor`. `year.ts:45-56`
  `SHORT_ORDINALS` is character-for-character `oxford-year.ts:66-77`
  `OXFORD_WEEK_ORDINALS`. `calendar/public-shell.tsx` is a 22-line component
  whose whole body is `width="wide"` plus one caption string.
- Smallest honest shape: delete `formatCellDate` (callers use `formatShortDate`,
  which is identical for a non-null day, and all three call sites already guard
  null), make `formatMonthLabel` one `formatDatePart(anchor, { month: "long",
year: "numeric" })`, drop the two colour aliases and import
  `templateColourFor` directly in `calendar-entry.tsx` and `type-legend.tsx`,
  export one ordinals table from `oxford-year.ts`, and replace the shell wrapper
  with `calendarCaption(seasonLabel)` beside the other presentation functions.
- Behaviour held by: `src/app/calendar/presentation.test.ts:36-58` (the month
  abbreviations, and that they do not depend on ICU), `:129-137` (month in
  full), `:83-127` (the colour swatches); `screens.test.tsx:272-283` (the
  caption names the season).
- Lines: 217 → 144, because seven wrappers and one duplicated table go and the
  three calendar pages gain one prop each. Also one `Intl.DateTimeFormat`
  construction per label instead of two (LAN-227 owns speed).
- Risk: a date string changing on a calendar cell. Every format is asserted as a
  literal in `presentation.test.ts`, and the cell text in `screens.test.tsx`.
- Repointed tests: `presentation.test.ts:54-58` asserts `formatCellDate`; the
  same assertion moves to `formatShortDate`, unchanged in meaning.
- New dependency: none.

#### G04-05 — `oxford-year.ts` stops re-implementing `calendar.ts` (saves ~73)

- Now: `oxford-year.ts:89-103` `dayMs`/`daysBetween`, `:154-174` `groupByDay`,
  and `:177-190` `byStartTime`/`byDate` are copies of `calendar.ts:27-57`,
  `:83-110` and `:75-81`, in a module that already imports `addDays` from it
  (`oxford-year.ts:1`). The "scan every term span and take the nearest" block is
  written three times: `:113-125`, `:333-338`, `:394-398`.
- Smallest honest shape: export `dayMs`, `daysBetween`, `byStartTime`, `byDate`
  and `groupByDay` from `calendar.ts` (the module that owns day arithmetic) and
  delete the copies; add one
  `nearestSpan(terms, { endingBefore | startingAfter })` and use it three times.
  `calendar.ts`'s `dayMs` is the stricter of the two — it refuses `2026-02-31`,
  which `oxford-year.ts`'s accepts — so the shared one is the safer direction.
- Behaviour held by: `src/lib/services/oxford-year.test.ts` (604 lines; segment
  order at `:171-206`, placement at `:317-389`, trimming at `:468-520`) and
  `src/lib/services/calendar.test.ts`.
- Lines: 613 → 540, because ~60 lines of duplicated helpers and two of the three
  span scans go, against ~4 lines of new exports.
- Risk: two real differences. `calendar.ts`'s `groupByDay` also sorts the
  undated list, which the Oxford column does not today, so the "No date recorded
  yet" list could reorder — `oxford-year.test.ts:345-352` asserts that list and
  would show it. And the stricter `dayMs` sends an impossible stored date to
  `undated` instead of a cell, which is the same destination the current code
  gives an unparseable one.
- Repointed tests: none, unless the undated ordering is taken as a change, in
  which case `oxford-year.test.ts:345-352` states the new order.
- New dependency: none.

#### G04-06 — One `ActionForm` for the three auth forms, and 31 others (saves ~53 here)

- Now: `login-form.tsx`, `forgot-password-form.tsx` and
  `reset-password-form.tsx` each do the same six things by hand: call
  `useActionState` with a local `initialState`, open `<Box component="form"
action={formAction}>` inside a `<Stack spacing={2}>`, carry a hidden
  `redirectTo`, render fields, render `state.error` as a `Notice`, and render a
  submit whose label switches on `pending` (`login-form.tsx:24,28-47`;
  `forgot-password-form.tsx:22,35-60`; `reset-password-form.tsx:21,34-64`).
  `git grep -l useActionState src` reaches 34 files. `login/page.tsx:36-41` also
  builds the shell and heading that `auth-shell.tsx` exists to build, and which
  the two recovery pages use.
- Smallest honest shape: `src/components/action-form.tsx` —

```tsx
export function ActionForm<S extends { error?: string | null }>({
  action,
  initialState,
  hidden,
  submit,
  pendingLabel,
  cancel,
  error,
  children,
}: {
  /* … */
}); // owns useActionState, the form element, the error Notice and ActionBar
```

with `children` taking `(pending) => ReactNode` only where a field needs it.
`login/page.tsx` renders `AuthShell` with its trailing paragraph as a child.

- Behaviour held by: `src/app/login/screens.test.tsx`,
  `forgot-password/screens.test.tsx`, `reset-password/screens.test.tsx` (each
  asserts the pending label, the error notice and the hidden `redirectTo`), plus
  `tests/auth-flow.test.ts` and `tests/auth-recovery-flow.test.ts`.
- Lines: 466 → 413 here (three forms 165 → 87, `login/page.tsx` 52 → 40, one
  45-line component), because the per-form boilerplate is ~20 of each form's
  lines. Each of the other 31 forms saves a further 10-15.
- Risk: a form losing its hidden `redirectTo`, or a second result showing beside
  the first (standards rule 1). The three screen suites assert the hidden input
  and the single notice.
- Repointed tests: none; the suites render pages.
- New dependency: none. Not a schema library: the messages are asserted verbatim
  and two of the three forms validate on the server only.

#### G04-07 — One shell refusal screen for four (saves ~63)

- Now: `account-state.tsx`, `not-permitted.tsx` and `coach-not-permitted.tsx`
  are the same file three times — a heading constant, a message constant, a
  `Refusal`, and a six-line inline `<Box component="form" action={signOut}>`
  sign-out button, which `operator-shell.tsx:46-54` writes a fourth time.
  `not-permitted.tsx:28-38` and `coach-not-permitted.tsx:23-32` differ only in
  which copy they pass and whether a `requirement` is set.
- Smallest honest shape: `src/app/operate/refusal-screens.tsx` with
  `SignOutButton()` and `ShellRefusal({ kind, requirement?, returnHref? })`,
  where `kind` keys one frozen copy table holding the four owner-approved texts
  (UX-03, UX-04, UX-05, UX-96). `gate.tsx` and `operate/layout.tsx` pass a kind
  instead of importing three components.
- Behaviour held by: `src/app/operate/shell.test.tsx:298-374` (each approved
  sentence, exactly), `:375-441` (neither state leaks anything), `:522-696` (the
  requirement and the return link), `tests/coach-attendance-boundary.test.ts`.
- Lines: 248 → 185, because three 6-line sign-out forms and three
  near-identical `Refusal` calls become one of each.
- Risk: the sentences are owner-fixed and must not be reworded; they move as
  string constants into one table, and `shell.test.tsx:299,340,349` assert them
  character for character, including that the two account states are not a
  shared euphemism.
- Repointed tests: `shell.test.tsx` imports `OperatorAccountState` and the two
  refusal screens directly in places; those imports follow to
  `refusal-screens.tsx`.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  `src/app/calendar/sortable-header.tsx` → `components/sortable-header.tsx`
  (`SortableHeader`); `src/app/calendar/public-shell.tsx` →
  `components/public-shell.tsx` (`PublicShell`);
  `src/app/(policies)/policy-content.tsx:7-19` (`PolicyHeading`) →
  `components/page-header.tsx` (`PageHeader`);
  `src/app/(policies)/layout.tsx:12` (a bare MUI `Alert`) →
  `components/notice.tsx` (`Notice`), which `components.md` says is the only way
  to reach `Alert`; `src/app/operate/board-filter-controls.tsx:122-132`
  (`StatusPill`) → `components/status-chip.tsx` (`StatusChip`);
  `src/app/calendar/page.tsx:174-180` (`PUBLIC_SORT_OPTIONS`) → the column
  definition G04-01 introduces.
- Pieces two or more routes write that should become one component:
  `calendar/public-list.tsx` + `operate/events/operator-list.tsx` (and the
  roster and people lists) → `src/components/bucketed-list.tsx` (G04-01);
  `calendar/view/page.tsx` + `operate/events/calendar/calendar-views.tsx` →
  `src/app/calendar/arrangements.tsx` (G04-02); 34 files' hand-written
  `useActionState` forms → `src/components/action-form.tsx` (G04-06); four
  inline sign-out forms → `SignOutButton` in
  `src/app/operate/refusal-screens.tsx` (G04-07); `whereItIs`, written three
  times (`calendar/public-list.tsx:150`, `calendar/[id]/page.tsx:151`,
  `operate/events/operator-list.tsx:182`) → one function in
  `lib/services/event-vocabulary.ts`; six hand-inlined 24×24 SVGs
  (`operate/shell-nav.tsx:252,266`, `board-filter-controls.tsx:51`,
  `admin/page-heading.tsx:46`,
  `roster/[membershipId]/attendance-table-bits.tsx:57`,
  `components/controlled-section.tsx:56`) → one `Glyph` beside
  `components/phone-icon.tsx`.
- Kit members this section needs changed to absorb a local copy:
  `components/sortable-header.tsx` — accept `{ link, sort, direction }` so the
  calendar's wrapper can go; `components/row-card.tsx` — accept `ReactNode`
  sublines, or let a column supply its own text, so one column definition feeds
  both halves of a list; `components/public-shell.tsx` — nothing, the local
  wrapper simply goes.

### Product questions

1. **`/dashboard` (64 lines).** Its own header calls it "not a real screen" and
   the page renders the title "Protected page"
   (`src/app/dashboard/page.tsx:14-20,34`); `docs/ux/design-system.md` §8 lists
   it as an open owner finding (B7). Deleting it removes a reachable route, so
   this analysis does not take it. Keep, or delete with
   `src/app/dashboard/page.test.tsx` and the `/dashboard` rows in
   `tests/operate-route-protection.test.ts`?
2. **Two spellings of a month.** `formatClubDay` (`src/lib/club-time.ts:33-42`)
   formats the short month through ICU, while `formatShortDate`
   (`lib/services/event-vocabulary.ts:45-52`) uses the repository's own
   `SHORT_MONTHS` table precisely because ICU prints September as "Sept" on some
   Node builds (`event-vocabulary.ts:24`). The two are used on different
   surfaces — refusal sentences and administration rows versus events — so a
   September date can read "Sept" in one place and "Sep" in another, which
   standards rule 7 forbids. Unifying them changes a visible string on the
   administration surfaces, and no test pins September
   (`src/lib/club-time.test.ts:68-92`).
3. **Events outside the academic year.** The operator calendar shows a block for
   dated events the year does not reach
   (`operate/events/calendar/calendar-views.tsx:107-113`, using
   `OUTSIDE_THE_YEAR_HEADLINE`/`_DETAIL` from this section's
   `calendar/presentation.ts:93-97`); the public Oxford View omits it
   (`calendar/view/page.tsx:217-224`), so a public reader sees neither the event
   nor a note. Two screens answer the same question differently, and G04-02
   writes both from one component. Should the public view gain the block, or the
   operator lose it?

### Not proposed

- `auth/invitation/route.ts`, `auth/recovery/route.ts` — 19 code lines each; the
  rest is the rationale for one fixed destination and no error code. Sharing
  them saves ~2 real lines.
- `api/health`, `api/scheduler/messaging`, `api/webhooks/whatsapp`,
  `api/venue-search` — every line is a distinct refusal, and in two of them the
  order of operations is the security. The duplicated constant-time compare
  (`messaging/route.ts:25-29` vs `whatsapp/route.ts:25-31`) is 12 lines across
  two files; one shared primitive saves ~4 and would change which compare the
  webhook uses, so it is named here rather than proposed.
- `lib/services/calendar-feed.ts` — RFC 5545 folding, TEXT escaping and the
  two-pass DST conversion are each already the smallest correct form.
- `calendar/view-switch.tsx`, `operate/filter-search.ts`,
  `operate/list-filters.tsx`, `operate/unavailable.tsx` — already the one copy
  several screens share; `unavailable.tsx` is 15 lines against 20 call sites.
- `operate/shell-nav.tsx`'s layout — the three-entry `sx` array and the
  `height`/`alignSelf`/`overflowY` trio are documented as load-bearing at both
  widths and asserted at `shell.test.tsx:700-779`.
- `club-time.ts`, `services/actor.ts`, `services/safe-uri.ts`,
  `services/sql-text.ts`, `validation/contact.ts`, `app/layout.tsx`,
  `manifest.ts`, `app/page.tsx`, `operate/page.tsx`, `operate/layout.tsx` — one
  statement per fact already.
- `/dashboard` — product question 1.
- Carve-outs read for context and proposed nothing in: `src/lib/auth/**`,
  `src/lib/db/**`, `src/lib/supabase/**`, `src/lib/rsvp/**`,
  `src/lib/delivery/**`, `src/lib/services/delivery.ts`,
  `src/lib/services/messaging-scheduler.ts`.

---

## G05 — the season roster: board, inline editing, CSV import, returner intake

Lines now: 6382 (measured as 6640 before the JSDoc correction). Lines after everything proposed: 4999. Saved: 1641 (25%).

"Lines after" includes **628 lines of new shared code counted in this section**
(listed under Proposals). Six of those helpers also delete a near-identical copy
in another section — the recruitment board, the events CSV import, the player
record, people/new — worth roughly 900 further lines that this section does not
claim. Each proposal therefore gives its gross in-section reduction; the shared
lines are subtracted once, at the end. The module table below sums to 6640 now
and 4371 after; 4371 + 628 shared = 4999.

### Files read

All 44 files in the brief. Read for context, proposed nothing in: `src/lib/db/**`
(`withTransaction`, `isServiceError`), `src/lib/auth/guards.ts`,
`src/lib/auth/capabilities.ts`. Read outside the brief to check duplication:
`src/app/operate/recruitment/{board-columns,board-data,recruitment-board-view}.ts(x)`,
`src/app/operate/{board-filter-controls,list-filters,gate,unavailable,labels}.ts(x)`,
`src/app/operate/events/import/*`, `src/lib/services/event-csv/*`,
`src/lib/services/{csv,person-duplicate,event-vocabulary,actor}.ts`,
`src/components/{candidate-row,page-header,row-card,status-chip}.tsx`,
`src/theme.ts`, `src/app/operate/roster/[membershipId]/{record-actions,season-facts-section}.ts(x)`.

### Modules

| Module or surface                                                                                   | Lines now | What it does                                                                                                  | Proposed shape                                                                                                                          | Lines after | Tests that prove it                                                                                  | Risk, and how it is caught                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Column model — `board-columns.ts`                                                                   |       452 | 26 column definitions plus band colours and a redaction map                                                   | rewrite as a `col()` builder with defaults and one loop for the seven onboarding columns; fold `COLUMN_ROW_FIELDS` into the definitions |         170 | `board-columns.test.ts`, `board-screens.test.tsx:198` (the 28 approved columns)                      | a column's width, label or order drifts; the column test asserts the built list, the board test the rendered head                           |
| Board view — `roster-board.tsx`, `roster-board-header.tsx`                                          |       730 | state, URL sync, chips, drawer, banded sticky head, row render, commit switch                                 | rewrite as `src/app/operate/board/*` shared with the recruitment board; roster keeps pinned filters, empty states, row cells            |         150 | `board-screens.test.tsx` (filters never re-fetch, URL kept via history, bands, stickiness)           | the band seam or sticky offsets change; `board-screens.test.tsx:186`/`:258` plus a desktop and 375px screenshot pair                        |
| Board data — `board-data.ts`                                                                        |       209 | search, filter and sort in memory; cell display text                                                          | rewrite: generic half into `board/data.ts`; roster keeps `rawValue` as a lookup table and its label rules                               |          95 | `board-data.test.ts` (362 lines: nulls-last, filter options, labels)                                 | a sort or "Not recorded" rule changes; `board-data.test.ts` is per column                                                                   |
| Board server actions — `board-actions.ts`, `actions.ts`, `board-action-state.ts`, `action-state.ts` |       258 | ten near-identical guarded commits, plus the status and onboarding-item actions and two identical state types | fold into one `commitCellAction` plus a column-to-service table; both state types become one shared `ActionState`                       |          90 | `board-actions.test.ts` (capability, refusal, `not_permitted` rethrow), `board-screens.test.tsx:571` | a column commits through the wrong service; the table is one object a test can walk                                                         |
| Board cell — `roster-board-cell.tsx`, `jersey-picker.tsx`                                           |       334 | the read value, or the column's own control; the 99-number picker                                             | keep the picker; fold the cell's three open `Select`s into one local `CellSelect` and the value ladder into a renderer map              |         275 | `board-screens.test.tsx:598`–`:660`, `:275` (not recorded)                                           | the editable predicate (the subs-paid gate) changes; asserted in `board-screens.test.tsx` and refused again in `write-items.ts:98`          |
| Board phone card — `roster-board-card.tsx`                                                          |        87 | name, status, missing flag, call button                                                                       | keep — the kit's `RowCard` would change its pixels (product question 4)                                                                 |          85 | `board-screens.test.tsx:660`–`:687`                                                                  | the call target only; the card is asserted by test id                                                                                       |
| Board heading — `roster-heading.tsx`, `add-players-menu.tsx`                                        |        92 | the title/season/count row and the two-entry add menu                                                         | keep both; drop the theme-redundant `minHeight: 44`; `PageHeader` adoption is product question 5                                        |          70 | `board-screens.test.tsx:177`, `:343`                                                                 | the heading's type scale if folded into `PageHeader`; screenshot pair                                                                       |
| Roster page — `page.tsx`, `presentation.ts`                                                         |        83 | gate, read, search-param normalising, status words, two date formatters                                       | rewrite over a shared search-param reader and `src/lib/club-dates.ts`; keep the status words                                            |          44 | `board-screens.test.tsx:398` (a filter naming a column outside the grant is ignored)                 | a date renders `Sept` or in local time; `src/lib/club-time.ts` rules and the admin presentation tests                                       |
| Dead filter bar — `roster-filters.tsx`                                                              |        64 | a `ListFilters` bar no route renders                                                                          | delete because the board replaced it at LAN-186; its own test file says so (`roster-screens.test.tsx:4`–`:15`)                          |           0 | `roster-screens.test.tsx`, `list-filters.test.tsx`                                                   | none in the application; both tests must move (G05-05)                                                                                      |
| CSV import screen — `import/import-screen.tsx`, `import-state.ts`, `presentation.ts`, `page.tsx`    |       658 | the three-state import screen, its sentences, the gate                                                        | keep the sentences; fold the table/card pair into a kit `DataList` and the two applied lists into one local list                        |         512 | `import/screens.test.tsx` (311 lines, all three states)                                              | an outcome word or count changes; every sentence is asserted as a literal                                                                   |
| CSV import actions — `import/actions.ts`, `import/export/route.ts`                                  |       147 | propose/apply/cancel intents, duplicate answers, the template download                                        | rewrite over the shared action helper and one `csvDownload()` route helper                                                              |          93 | `import/screens.test.tsx`, `tests/operate-route-protection.test.ts`                                  | the 403/409 shape of the template route; the route-protection test asserts it                                                               |
| Returner intake — `new/returner-intake-form.tsx`, `intake-state.ts`, `page.tsx`                     |       390 | three steps in one form, one action                                                                           | keep the three steps; delete the provably dead `none ?` branches at `:196`–`:238`; drop `MIN_TOUCH_TARGET`                              |         337 | `screens.test.tsx` (546 lines, UX-10..13 labels as literals)                                         | a button label or intent changes; asserted as literals                                                                                      |
| Intake validation — `new/validation.ts`                                                             |        64 | a four-field shape check and the focus order                                                                  | rewrite as a rule table over the same messages                                                                                          |          35 | `new/validation.test.ts` (177 lines)                                                                 | a message's wording changes; the test holds each sentence                                                                                   |
| Intake action — `new/actions.ts`                                                                    |       118 | one action, five intents, refusal mapping                                                                     | keep; read values through the shared FormData helper                                                                                    |         100 | `new/actions.test.ts` (425 lines, every intent and the I2 refusal)                                   | the membership-refused branch; pinned by name                                                                                               |
| Membership read — `membership/read.ts`, `shared.ts`, `index.ts`                                     |       385 | the roster list, one membership record, its onboarding items                                                  | rewrite: delete the filter and sort machinery no caller reaches; row mappers through a shared helper; drop the barrel                   |         292 | `membership.test.ts` (1747 lines)                                                                    | the nulls-last order and the two copies of the gating predicate; `membership.test.ts` asserts the copies agree                              |
| Membership writes — `write-status.ts`, `write-items.ts`                                             |       369 | the status ladder; one onboarding item's state, with cascade                                                  | keep both — real distinct rules; fold the item+history+audit triple into one local helper                                               |         330 | `membership.test.ts`, `board-screens.test.tsx:508`                                                   | the subs-invoiced cascade; covered directly in `membership.test.ts`                                                                         |
| Board read — `roster-board/read.ts`                                                                 |       383 | the whole board: eleven season reads folded into rows                                                         | rewrite the eleven hand-written folds through `indexBy`/`groupBy`; one banded season query                                              |         280 | `roster-board.test.ts`, `board-screens.test.tsx`                                                     | a column silently reads null; every column has a row in `roster-board.test.ts`. Ten fewer round trips is a side effect (LAN-227 owns speed) |
| Board writes — `write-misc.ts`, `write-position.ts`, `write-jersey.ts`, `shared.ts`, `index.ts`     |       579 | seven read-compare-upsert-audit commits, plus position and jersey                                             | rewrite the seven as specs over one `commitBoardValue`; keep position and jersey; table-map `closeCurrentRow`; drop the barrel          |         373 | `roster-board.test.ts:443`–`:530`, `player-record.test.ts:147`                                       | the no-op short-circuit and each column's audit `action`; both asserted by name                                                             |
| Roster CSV — `roster-csv.ts`                                                                        |       284 | what a column means, the header read, row shape checks, plan types                                            | rewrite the header and cell machinery onto a shared reader; row checks as a rule table                                                  |         215 | `roster-csv.test.ts` (253 lines)                                                                     | a refusal sentence changes; every reason string is asserted                                                                                 |
| Roster import — `roster-import.ts`                                                                  |       377 | plan a file against the roster, apply under a digest                                                          | rewrite `planRow` to one construction; shared FNV digest                                                                                |         295 | `roster-import.test.ts` (626 lines), `tests/pilot-scenario-lan-74.test.ts`                           | an outcome flips (new / carried forward / unchanged); every branch has a test                                                               |
| Roster intake services — `roster/write.ts`, `duplicate-check.ts`, `shared.ts`, `index.ts`           |       577 | one transaction for a returning player; the candidate query                                                   | keep the SQL; drop the barrel, the duplicated `currentDate` and status-event inserts, the second `trimmedOrNull`                        |         530 | `roster.test.ts` (1045 lines), `tests/slice-walkthrough.test.ts`                                     | the one-transaction guarantee; `roster.test.ts` asserts all-or-nothing                                                                      |

### Proposals

#### G05-01 — one column definition table (saves ~282)

- Now: `board-columns.ts:104`–`419` spells out 26 objects. Every one carries
  `sortable: true`, `filterable: true` and
  `requires: "person_record_authority"` — 78 identical lines. The seven
  onboarding columns (`:182`–`:265`) differ only in `key`, `label` and
  `itemCode`; the three position columns (`:290`–`:325`) only in side. A second
  table, `COLUMN_ROW_FIELDS` (`:430`–`:459`), restates all 26 keys to name the
  row fields each exposes.
- Smallest honest shape: one builder and three lists.

  ```ts
  const col = (c: Partial<ColumnDef> & { key: string; label: string; band: Band; width: number }) =>
    ({ edit: "none", sortable: true, filterable: true, requires: "person_record_authority", ...c });
  const ONBOARDING = [["subsInvoiced", "Sub invoiced", "subs_invoiced", 132], …] as const;
  ```

  `fields` moves onto the definition
  (`col({ key: "contactable", …, fields: ["hasMobile", "hasEmail"] })`), so
  `redactRow` reads `column.fields` and the second table goes.

- Behaviour held by: `board-columns.test.ts` (the list, its order, the
  redaction), `board-screens.test.tsx:198` (the 28 rendered columns, raw email
  and phone absent), `:186` (banding).
- Lines: 452 → 170, because 26 objects of ~9 lines become 16 one-line calls plus
  two generated families, and one of the two key tables disappears.
- Risk: a width or option list changes silently. Both tests read the built array,
  so a drift fails without needing a screenshot.
- Repointed tests: none — `buildColumns()` keeps its signature and its output.
- New dependency: none.

#### G05-03 — one board frame, shared with the recruitment board (saves ~474 gross, ~109 net)

- Now: `roster-board.tsx` and `recruitment/recruitment-board-view.tsx` are the
  same component twice. Both declare `buildUrl` (`roster-board.tsx:51`,
  `recruitment-board-view.tsx:49`), the same five state hooks, the same
  `history.replaceState` sync (`:137` / `:103`), the same `setFilter` and sort
  toggle, the same "Filtered by" chip row, the same bottom `Drawer` of pinned
  filters, the same `TableContainer` / `Table stickyHeader`, and the same
  `ColumnFilterMenu` mount. The two-row banded sticky head is
  `roster-board-header.tsx:35`–`191` and again inline at
  `recruitment-board-view.tsx:330`–`420`, down to `zIndex: 6` and
  `borderRightColor: "background.paper"`. Each board also keeps its own
  `applyBoard` / `comparable` / `filterOptions` / `optionListLabel`
  (`roster/board-data.ts:199`, `recruitment/board-data.ts:77`).
- Smallest honest shape: `src/app/operate/board/` with
  `useBoardView({ basePath, rows, valueOf, initial })` returning
  `{ visible, filters, sort, setFilter, setSort, setSearch, clearAll, isFiltered }`;
  `<BoardTableHead pinned={{ label, width, sortKey }} bandOf={…} columns={…} />`;
  `<BoardChrome chips pinned drawer menu>{rows}</BoardChrome>`; and
  `board/data.ts` holding `applyBoard`, `comparable`, `matches`, `searchMatches`
  and the `filterOptions` skeleton, each taking the board's own
  `valueOf(row, key)`.
- Behaviour held by: `board-screens.test.tsx:412`–`:483` (no `router.push`, the
  URL kept by history), `:186` (bands), `:258` (the named scroll container),
  `:390` (chips); `recruitment-board-view.test.tsx` for the other caller.
- Lines: 629 → 155 in this section, with 365 new shared lines
  (`use-board-view.ts` 70, `board-table-head.tsx` 130, `board-chrome.tsx` 90,
  `data.ts` 75). The recruitment section drops ~330 against the same 365.
- Risk: the sticky offsets, the 2px band seam and the 28px band row are pixel
  facts Brian complained about once already (`roster-board.tsx:95`–`:105`). Held
  by the band tests plus a desktop and 375px screenshot pair of both boards.
- Repointed tests: `board-data.test.ts` imports `applyBoard` from
  `./board-data`; it would import the same name from the roster module, which
  re-exports the generic one bound to `rawValue`.
- New dependency: none.

#### G05-02 — one cell-commit table, client and server (saves ~250)

- Now: `roster-board.tsx:198`–`:328` is a 130-line `switch` naming every column
  twice — once as a case, once as the action call — and `board-actions.ts` is ten
  exported actions (`:48`–`:201`) differing only in which service they call: each
  repeats `requireCapability`, `try`, `stateFor(error)`, `refresh()`,
  `return OK`. `action-state.ts:1` and `board-action-state.ts:1` declare the same
  `{ error: string | null }`.
- Smallest honest shape: one action and one table.

  ```ts
  const COMMITS = {
    blues: (p) => commitBlues({ ...p, value: p.value as BluesValue }),
    offencePosition: (p) => commitPosition({ ...p, column: "offence", code: p.value || null }),
    subsPaid: (p) => resolveOnboardingItem({ ...p, itemId: p.itemId!, status: p.value }),
  } as const;
  export async function commitCellAction(input: CellCommit): Promise<ActionState> { … }
  ```

  The client calls
  `commitCellAction({ column: column.key, membershipId, seasonId, value, itemId })`
  once; the status column keeps its extra
  `revalidatePath("/operate/roster/:id")` as a flag on its table entry.

- Behaviour held by: `board-actions.test.ts` (capability refusal,
  `not_permitted` rethrown, the service called with the actor),
  `board-screens.test.tsx:487`–`:596` (the status and BPS paths end to end).
- Lines: 325 → 75, because ten 14-line actions and a 130-line switch become one
  ~35-line action and a ~40-line table.
- Risk: a column wired to the wrong service, or a column outside the table
  silently no-opping (today's `default: return`). The table is one object a test
  can walk against `buildColumns()`; that walk does not exist today and belongs
  in the rewrite.
- Repointed tests: `board-actions.test.ts` and `board-screens.test.tsx` mock the
  per-column actions by name; both would mock `commitCellAction` and assert the
  column in its payload. Same assertions, new shape.
- New dependency: none.

#### G05-04 — the board's seven commits as specs, not procedures (saves ~146)

- Now: `write-misc.ts` holds seven functions (`:19`, `:64`, `:104`, `:160`,
  `:202`, `:270`, `:313`) with one body: `actorRequirement`, open a transaction,
  select the current value, compute `before`, `if (before === next) return`,
  upsert, `recordAudit` with that column's action word. Only the SQL and the
  action word differ.
- Smallest honest shape: `commitBoardValue(spec, params)` in
  `roster-board/commit.ts`, where a spec is
  `{ read: { sql, args, valueOf }, write: (tx, p) => …, action: "blues_changed", context }`.
  The seven exported names stay — the record page
  (`[membershipId]/record-actions.ts:18`) and
  `recruitment-prospect/flip.ts:73` call them directly — each a three-line
  wrapper.
- Behaviour held by: `roster-board.test.ts:443`–`:530` (each commit writes its
  row and its audit action; the BPS no-op asserted explicitly),
  `player-record.test.ts:147`.
- Lines: 316 → 170, because seven ~45-line procedures become seven ~15-line
  specs plus one ~40-line runner.
- Risk: the no-op short-circuit is real behaviour — a repeat commit writes no
  audit row. It moves into the runner, where one test covers all seven instead of
  one each; `roster-board.test.ts:477` pins it for BPS today.
- Repointed tests: none — the exported signatures are unchanged.
- New dependency: none.

#### G05-05 — delete the roster filter surfaces nothing reaches (saves ~114)

- Now: `roster-filters.tsx` (64 lines) is rendered by no route. The board builds
  its own pinned controls at `roster-board.tsx:330`–`:365`, and this component's
  own test file says so — `roster-screens.test.tsx:4`–`:15`: "the board that
  replaced the six-column list … no longer uses this component at all", kept
  alive only so `list-filters.test.tsx`'s reasoning holds. Behind it,
  `membership/read.ts:116`–`:149` and the search/status/entry predicates at
  `:241`–`:252` exist for a `filters` argument only tests pass: the one
  application caller is `roster-board/read.ts:128` —
  `listCurrentSeasonRoster()`, no arguments — because the board filters in
  memory (`board-data.ts:12`).
- Smallest honest shape: delete `roster-filters.tsx`; reduce
  `listCurrentSeasonRoster()` to no parameters, dropping `RosterFilters`,
  `ROSTER_SORT_COLUMNS`, `rosterOrderBy` and the three predicate arms, keeping
  the `order by` the board's default sort matches.
- Behaviour held by: nothing in the application reaches either. The tests that do
  are `roster-screens.test.tsx` (180 lines, all of it this component) and
  `membership.test.ts:1547`–`:1679`, including an SQL-injection probe on `sort`.
- Lines: 114 → 0, because both surfaces go whole.
- Risk: the injection probe disappears with the parameter it probes. That is the
  consequence of deleting the parameter, not a weakening — no caller can supply
  `sort` any more. Say it in the PR rather than quietly.
- Repointed tests: `list-filters.test.tsx:8` imports `RosterFilters` as its
  example — repoint to `PeopleFilters` or `events/event-filters.tsx`.
  `roster-screens.test.tsx` and the `sort`/`search`/`status` cases in
  `membership.test.ts` go with the code they test.
- New dependency: none.

#### G05-07 — one list component for the table-and-cards pair (saves ~117 gross, ~42 net)

- Now: `import/import-screen.tsx:252`–`:295` builds a desktop `Table` and
  `:458`–`:480` the phone `RowCard` list from the same `SHOWN_COLUMNS` /
  `COLUMN_HEADINGS` pair, each cell written twice. Fourteen route files do this
  by hand (`git grep -l DesktopOnly src`: `people-table.tsx`,
  `people/missing/queue-board.tsx`, `events/import/import-screen.tsx`,
  `admin/operators/page.tsx`, `participation-table.tsx`, …). `Applied`
  (`:486`–`:568`) then writes the same Section-plus-list twice, once for arrivals
  and once for refusals.
- Smallest honest shape: a kit member
  `DataList<T>({ columns: { key, head, cell, width? }[], rows, title, testId, card })`
  rendering `TableFrame`+`Table` inside `DesktopOnly` and `RowCardList`
  otherwise, from one column array; plus a local
  `<OutcomeList title rows empty>` for the two applied lists.
- Behaviour held by: `import/screens.test.tsx` (all three states, per-row test
  ids, the refusal colour), `row-card.test.tsx`, `sortable-header.test.tsx`.
- Lines: 527 → 410 here, with 75 new shared lines in
  `src/components/data-list.tsx`; thirteen other call sites drop roughly 40 each.
- Risk: the phone card loses a field, or the desktop column order changes. Held
  by the import screen's per-row assertions and a 375px screenshot pair; the kit
  member gets its own `data-list.test.tsx`.
- Repointed tests: none in this section.
- New dependency: none.

#### G05-09 — the board read without eleven hand-written folds (saves ~103 gross, ~73 net)

- Now: `roster-board/read.ts:142`–`:347` runs eleven sequential queries and then
  eleven bespoke folds into `Map`s — `coachGroupByMembership` (`:306`),
  `eligibilityByMembership` (`:329`), `availabilityByMembership` (`:332`) and
  `bpsByMembership` (`:335`) are one line each conceptually and three in fact;
  `formalwearByMembership` (`:310`), `bluesByMembership` (`:321`) and
  `onboardingItemsByMembership` (`:339`) are six to nine.
- Smallest honest shape: `src/lib/services/rows.ts` with
  `indexBy(rows, key, pick)` and `groupBy(rows, key, pick)`, and one season query
  where the nine season-scoped single-table selects at `:203`–`:247` become CTEs
  in one statement. `listRosterBoard` keeps its return shape exactly.
- Behaviour held by: `roster-board.test.ts` (a case per column),
  `board-screens.test.tsx:275` (a player with almost nothing recorded still
  renders "Not recorded" everywhere).
- Lines: 383 → 280, with 30 new shared lines in `rows.ts`.
- Risk: a column reads null where it used to read a value — invisible on screen
  except as "Not recorded". Every column has a row-level assertion in
  `roster-board.test.ts`; that is the only thing standing between this rewrite
  and a silent data loss, so it must run before and after.
- Repointed tests: none.
- New dependency: none.

#### G05-08 — `planRow` builds its row once (saves ~82)

- Now: `roster-import.ts:111`–`:231` returns the same seven-field object literal
  nine times (`:120`, `:134`, `:150`, `:159`, `:174`, `:186`, `:199`, `:211`,
  `:222`), differing in `outcome`, `reasons`, `duplicate` and
  `matchedPersonId`. `digestOf` (`:234`–`:247`) is the FNV-1a idiom also written
  at `event-csv/export.ts`.
- Smallest honest shape: one `decide(row, candidates, answers)` returning
  `{ outcome, reasons, duplicate, matchedPersonId }`, then a single
  `return { line, name, cells, ...decision }`; the digest moves to
  `src/lib/services/digest.ts`.
- Behaviour held by: `roster-import.test.ts` (626 lines: every outcome, the
  phone-confirmed path, stale and unanswered duplicate answers, the digest
  refusal), `tests/pilot-scenario-lan-74.test.ts`.
- Lines: 377 → 295, because nine literals become one.
- Risk: an outcome flips, which changes who gets a membership and a welcome. The
  outcome matrix is fully covered; no screenshot needed.
- Repointed tests: none.
- New dependency: none.

#### G05-10 — one action helper instead of ten hand-rolled ones (saves ~80 gross, ~36 net)

- Now: `actions.ts:17`, `import/actions.ts:22` and `new/validation.ts:67` each
  write their own `text(formData, field)`; ten files under `src/app` do
  (`git grep -c "function text(formData"`). `actions.ts:22` and
  `board-actions.ts:40` each write `stateFor(error)` — the `isServiceError` /
  rethrow-`not_permitted` pair appears in over 40 files. `page.tsx:16`–`:17`
  hand-writes a `first(value)` search-param reader that `recruitment/page.tsx`
  also writes, and `page.tsx:19`–`:25` plus `import/page.tsx:16`–`:30` repeat the
  read-or-`UnavailableScreen` dance that 25 pages repeat.
- Smallest honest shape: `src/lib/actions/` exporting
  `type ActionState = { error: string | null }`, `formText(formData, field)`,
  `formFirst(params, key)` and `runAction(fn): Promise<ActionState>` (rethrowing
  `not_permitted` exactly as today); `src/app/operate/page-read.ts` exporting
  `readOrUnavailable({ title, testId, action }, fn)`.
- Behaviour held by: `actions.test.ts` (345 lines), `board-actions.test.ts`,
  `new/actions.test.ts`, `tests/operate-route-protection.test.ts`.
- Lines: 389 → 309 here (`actions.ts` 63→30, `import/actions.ts` 120→85,
  `new/actions.ts` 118→100, `page.tsx` 54→30, `import/page.tsx` 34→14), with 44
  new shared lines. The same helpers delete the same boilerplate in every other
  section.
- Risk: `not_permitted` must still escape to the 403 screen rather than become a
  field error. That single rule is what the helper centralises;
  `board-actions.test.ts:122` and `actions.test.ts` both assert it.
- Repointed tests: none.
- New dependency: none — a schema library is not worth four fields.

#### G05-06 — one CSV import spine (saves ~88 gross, ~3 net here, ~170 app-wide)

- Now: `roster-csv.ts:142`–`:183` (`normaliseHeaderCell`, `isImportColumn`,
  `readHeader`), `:80` (`cellsOf`), `:46` (`said`), `:50` (`trimmedOrNull`) and
  the empty/oversized checks at `:229`–`:241` are the same code as
  `event-csv/plan.ts:102`–`:171` and `event-csv/shared.ts:47`, down to the shape
  of the refusal sentences. `import/export/route.ts` is
  `events/import/export/route.ts` with a different body and filename.
- Smallest honest shape: `src/lib/services/csv-header.ts` exporting
  `readCsvHeader(rows, columns, required)`, `cellsOf(row, index, columns)` and
  `said`; `src/app/operate/csv-download.ts` exporting
  `csvDownload(capability, () => ({ csv, fileName }))`.
- Behaviour held by: `roster-csv.test.ts` (every refusal sentence), the
  `events/import` tests for the other caller,
  `tests/operate-route-protection.test.ts` for the route's 403/409 shape.
- Lines: 311 → 223 here, with 85 new shared lines the events-import section would
  otherwise need; whichever section the Lead makes their owner counts them once.
- Risk: a refused file's sentence changes and an operator is told the wrong
  thing. Both suites assert the sentences verbatim.
- Repointed tests: none.
- New dependency: none.

#### G05-11 — the intake form's dead branches and one validation table (saves ~73)

- Now: `returner-intake-form.tsx:196`–`:238` sits inside `none ? (…) : (…)`, so
  `variant={none ? "contained" : "outlined"}` at `:202` is always `"contained"`,
  at `:231` always `"outlined"`, and the nested `{none ? null : (…)}` at `:210`
  always renders — about 18 lines that cannot take their other branch.
  `MIN_TOUCH_TARGET` (`:36`) is applied to eight medium buttons the theme already
  sizes (`src/theme.ts:115`, `sizeMedium: { minHeight: 44 }`).
  `validation.ts:47`–`:64` hand-writes four checks and a focus order.
- Smallest honest shape: collapse the `ActionBar` to its two real cases; delete
  the constant; express validation as
  `RULES: { field, required?, message, shape?, shapeMessage? }[]` walked once,
  with `firstInvalidField` reading the same array for order.
- Behaviour held by: `screens.test.tsx` (546 lines, every label as a literal, the
  unauthorized-DOM assertions), `new/validation.test.ts` (177 lines, every
  message and the focus order).
- Lines: 408 → 335.
- Risk: the button set on the candidates step changes for the "no matches" case.
  `screens.test.tsx` asserts both cases by label; the 44px target is a 375px
  screenshot check and `src/theme.test.ts` asserts the theme rule.
- Repointed tests: none.
- New dependency: none.

#### G05-12 — barrels and duplicated transaction helpers (saves ~90)

- Now: `membership/index.ts` (6), `roster-board/index.ts` (23) and
  `roster/index.ts` (4) re-export and nothing else.
  `roster-board/shared.ts:18`–`:52` is a 35-line `if` ladder writing the same two
  statements against three table names. `roster/write.ts:147` duplicates
  `roster-board/shared.ts:7` (`currentDateOf`); `roster/write.ts:312` duplicates
  `membership/write-status.ts:34` (the status-event insert, also at
  `recruitment-prospect/flip.ts:65`); `roster/shared.ts:70` (`trimmedOrNull`)
  duplicates `membership/shared.ts:13` (`optional`) and eleven further copies
  across `src/lib/services`.
- Smallest honest shape: import from `./read`, `./write-misc` and their siblings
  directly and delete the three barrels; replace the ladder with one
  `const TABLE = { position_assignments: "public.position_assignments", … } as const`
  and two template statements; one `currentDateOf` and one
  `recordStatusEventIn` in `membership/shared.ts`; one `trimmedOrNull` in
  `src/lib/services/text.ts`.
- Behaviour held by: `roster-board.test.ts` (a same-day supersede deletes rather
  than closes), `membership.test.ts`, `roster.test.ts`.
- Lines: 225 → 135 plus 17 shared lines, because the barrels go whole and the
  ladder collapses to a map.
- Risk: the table map must stay a closed literal — a table name must never come
  from a caller's string. The union type does that today and keeps doing it.
- Repointed tests: imports in `roster-board.test.ts:23` and
  `membership.test.ts:27` move from the barrel to the sibling modules.
- New dependency: none.

#### New shared code counted in this section (628 lines)

`src/app/operate/board/use-board-view.ts` 70 · `board-table-head.tsx` 130 ·
`board-chrome.tsx` 90 · `board/data.ts` 75 · `src/components/data-list.tsx` 75 ·
`src/lib/actions/index.ts` 30 · `src/app/operate/page-read.ts` 14 ·
`src/app/operate/csv-download.ts` 16 · `src/lib/services/csv-header.ts` 55 ·
`src/lib/services/digest.ts` 14 · `src/lib/services/rows.ts` 30 ·
`src/lib/services/text.ts` 5 · `src/lib/club-dates.ts` 12 ·
`recordStatusEventIn` in `membership/shared.ts` 12.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  - `new/returner-intake-form.tsx:262` `CandidateRow` →
    `@/components/candidate-row`. The kit member has **no application caller at
    all** — only `design-preview/(operator)/kit/page.tsx:225` renders it, while
    three routes write their own (`roster/new`,
    `people/new/create-person-form.tsx:143`,
    `recruitment/new/add-recruit-form.tsx:468`). Product question 2.
  - `roster-heading.tsx:16` → `@/components/page-header` (`PageHeader`): the same
    `Stack direction={{ xs: "column", sm: "row" }} … justifyContent="space-between"`
    with `actions`, differing only in the title's type scale (`h6` here,
    `display` there). Product question 5.
  - `roster-board-card.tsx:16` → `RowCard` with `actions` and `PhoneIcon`.
    Product question 4.
  - `unavailable.tsx:5` `UnavailableScreen` adds nothing to `Refusal` but renames
    `action` to `children`; 25 pages import it, two of them mine. Deleting it is
    ~12 lines and 25 one-line edits, for the Lead to place.
- Pieces two or more routes write that should become one component:
  - `roster-board.tsx` + `recruitment-board-view.tsx` →
    `src/app/operate/board/` (G05-03). The approved design system deliberately
    keeps the boards out of `src/components/`; `src/app/operate/board/` respects
    that — shared between the two boards, not promoted into the kit.
  - `import/import-screen.tsx` + thirteen other routes →
    `src/components/data-list.tsx` (G05-07).
  - `roster-csv.ts` + `event-csv/plan.ts` → `src/lib/services/csv-header.ts`;
    `import/export/route.ts` + `events/import/export/route.ts` →
    `src/app/operate/csv-download.ts` (G05-06).
- Kit members this section needs changed to absorb a local copy:
  - `candidate-row.tsx` needs a selection control
    (`control?: ReactNode`, or `select={{ name, value }}`) and a facts grid before
    it can absorb `returner-intake-form.tsx:262`, which is a radio inside a
    `RadioGroup`.
  - `row-card.tsx` needs nothing; the board's card is a layout choice, not a gap.
- Vocabulary that should not live in a route: `board-columns.ts:73`–`:99`
  (`STATUSES`, `ENTRIES`, `COACH_GROUPS`, `FORMALWEAR_ITEMS`, `BLUES_VALUES`,
  `ELIGIBILITY_VALUES`, `AVAILABILITY_VALUES`) is imported by the record page
  (`[membershipId]/season-facts-section.tsx:7`–`:14`,
  `[membershipId]/formalwear-field.tsx:11`) and the design preview, so a route
  module is the vocabulary source for three surfaces. It belongs in
  `src/lib/services/roster-vocabulary.ts`. The same five membership statuses are
  declared three times — `presentation.ts:5`, `board-columns.ts:73`, and again as
  a literal array at `roster-board.tsx:346` — while the kit's
  `status-chip.tsx:36` holds their colours. One list, keyed once.

### Product questions

1. **Two duplicate-person matchers.** `roster/duplicate-check.ts:44`
   (`findPersonCandidates`, used only by `/operate/roster/new` and the CSV
   import) and `person-duplicate.ts:110` (`findPersonDuplicates`, used by
   `/operate/people/new`, `/operate/recruitment/new`, `/join/[code]` and
   `people/[personId]/edit`) answer the same question — "who might this already
   be" — with different match vocabularies (`"given name"` against
   `"given_name"`), different candidate facts and different phone comparison.
   Consolidating saves roughly 150 lines but changes what one of the two screens
   shows. Which matcher is the club's answer?
2. **Three candidate rows, one unused kit member.** `roster/new` shows a radio
   grid with Known as / Email / Phone / Current season / Matched on;
   `people/new` and `recruitment/new` each show their own; the kit's
   `CandidateRow` (name, facts, matched, chips, one action) is rendered nowhere
   but the preview. Unifying them onto the kit member saves ~45 lines here and
   ~90 in the other two sections, and changes the layout of at least two screens.
   Unify, or delete the kit member as a sibling that wandered?
3. **The availability dot's colours.** `roster-board-cell.tsx:18` hardcodes
   `#2e7d32` / `#ed6c02` / `#c62828` — MUI's defaults, not the club's, and the
   only raw hex in this section. `docs/ux/design-system.md` §4 records
   availability as Green `success`, Orange `warning`, Red `error`. Taking the
   theme's tokens deletes the table but changes the rendered colour of every
   availability cell.
4. **The board's phone card.** `roster-board-card.tsx` is hand-built where the
   kit's `RowCard actions` exists, but the design system names the boards as
   deliberately outside the kit. Adopting `RowCard` saves ~50 lines and changes
   the card's padding, divider and title size at 375px.
5. **The board's heading.** `roster-heading.tsx` is `PageHeader` with a smaller
   title (`h6` rather than the kit's `display`), so `/operate/roster` is the one
   operate page whose heading is not the kit's. Folding it in saves ~20 lines and
   makes the board's title the same size as every other page's.
6. **Column redaction that cannot redact.** All 26 columns carry
   `requires: "person_record_authority"` (`board-columns.ts:70`), exactly the
   capability `page.tsx:11` already gates the whole page on, so `visibleColumns`
   (`:422`) can never drop a column and `redactRow` (`:462`) can never drop a
   field. That is ~55 lines of inert machinery kept against a future narrowing.
   This analysis proposes keeping it; removing it is a security-posture decision,
   not a refactor.

### Not proposed

- `jersey-picker.tsx` — 86 lines for all 99 numbers with another player's number
  ticked, named and unclickable; Brian asked for it exactly, and it is already
  one `map`.
- `membership/write-items.ts` — the derived-item, allowed-state, subs-paid and
  reason-only-correction rules are four distinct refusals with four distinct
  sentences; only the item+history+audit triple repeats.
- `membership/write-status.ts`, `roster-board/write-position.ts`,
  `roster-board/write-jersey.ts` — each is one transaction of real rules (status
  ladder seeding, special-teams slot mapping, predominant-number promotion) with
  nothing restated.
- `roster/duplicate-check.ts` — one CTE query and one mapper; the query is the
  behaviour.
- `roster/write.ts` — nine small helpers, each one statement; the savings are the
  duplicated `currentDate` and status-event inserts only.
- `import/presentation.ts`, `import/import-state.ts`, `presentation.ts` — the
  club's sentences and words. A route module is the right home for them and they
  are already short.
- The subs-paid gate is stated three times on purpose — `board-data.ts:72` (what
  the cell reads), `roster-board-cell.tsx:154` (whether the cell opens) and
  `write-items.ts:98` (the refusal). Two are presentation of one rule and the
  third is the rule; collapsing them would put a refusal in a client component.
- Carve-outs read for context, proposed nothing in: `src/lib/db/**`
  (`withTransaction`, `isServiceError`, the error classes) and `src/lib/auth/**`
  (`requireCapability`, `requireGeneralOperator`, `roleCodesPermit`).

---

## G06 — One player's record, onboarding state and chase, the missing-data queue, follow-ups

Lines now: 5621. Lines after everything proposed: 4053. Saved: 1568 (27.9%).
The module table's **Lines after** column sums to 4053. The nine proposals
account for 1381 of the saving; the remaining 187 is in five table rows too small
to carry a proposal (the onboarding item row 49, the send control 22, the
dispute service's column lists 55, `follow-ups.ts` 12, the `onboarding-chase`
fold 49).

### Files read

All 44 files in the brief. Also read for context, proposed nothing in: the kit
(`src/components/record-field.tsx`, `row-card.tsx`, `sortable-header.tsx`,
`status-chip.tsx`, `fact.tsx`, `empty-state.tsx`), the two shared bars
(`src/app/operate/list-filters.tsx`, `src/app/operate/filter-search.tsx`), the
neighbouring vocabularies (`src/app/operate/roster/presentation.ts`,
`board-columns.ts`, `src/app/operate/people/presentation.ts`,
`src/app/operate/admin/presentation.ts`), the recruit twin
(`src/app/operate/recruitment/[prospectId]/send-questionnaire-button.tsx`),
`src/app/participation/participation-table.tsx`, and the colocated tests named
below. Carve-outs read only as call sites: `src/lib/db/**`,
`src/lib/auth/guards.ts`, `src/lib/services/messaging-scheduler.ts`,
`src/lib/services/delivery.ts`, `src/lib/delivery/phone.ts`.

### Modules

| Module or surface                                                                                                                                                                                           | Lines now | What it does                                                                                                               | Proposed shape                                                                                                                                                     | Lines after | Tests that prove it                                                                                                                              | Risk, and how it is caught                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player record page and view (`[membershipId]/page.tsx`, `record-view.tsx`, `record-view-presentation.ts`)                                                                                                   |       509 | Gates, reads, redacts, then lays out six bands and owns every season field's commit                                        | rewrite as a layout plus one action table (G06-03) — the 93-line commit `switch` and three copies of one link button go                                            |         372 | `[membershipId]/screens.test.tsx` (1542 lines, 60+ cases)                                                                                        | A mis-keyed action table sends a field to the wrong service; every field's edit is already asserted by name                                          |
| Season band and its field editors (`season-facts-section.tsx`, `position-field.tsx`, `jersey-field.tsx`, `formalwear-field.tsx`)                                                                            |       455 | 15 labelled season facts, eight of them editable in place                                                                  | rewrite as a field descriptor list over one `RecordField` that accepts an editor (G06-02); `position-field.tsx` deleted                                            |         155 | same `screens.test.tsx`; `src/components/record-field.test.tsx`                                                                                  | The three local editors repeat `RecordField`'s own click target; losing `data-testid="editable-field"` or the underline would show as failures there |
| Onboarding item row (`onboarding-row.tsx`)                                                                                                                                                                  |       169 | One item: required/never-blocks chips, its own state list, provenance sentence                                             | keep the provenance derivation (60 lines of real rules); fold the editable display into `RecordField`                                                              |         120 | `screens.test.tsx` "W6 — provenance", "B-001", "D-002"                                                                                           | The provenance wording is per-state and heavily pinned; no change proposed to it                                                                     |
| Record lists (`activity-log.tsx`, `status-history.tsx`, `other-seasons.tsx`)                                                                                                                                |       141 | Three divider-separated lists, each with its own empty sentence                                                            | fold into one `record-lists.tsx` over a local `DividedList` (G06-09)                                                                                               |          75 | `screens.test.tsx` "the activity log", "a departed membership"                                                                                   | The three empty sentences differ and must stay verbatim; each is asserted by `data-testid`                                                           |
| Attendance band (`attendance-section.tsx`, `attendance-filters.ts`, `attendance-table-bits.tsx`)                                                                                                            |       555 | This season's RSVP/attendance, four filters, a sortable table, a phone card list, a mandatory score                        | rewrite the two list halves over `DataList` (G06-01); keep the score and the filter controls                                                                       |         305 | `screens.test.tsx` "the Attendance band" (14 cases)                                                                                              | The score reads the filtered set; `DataList` must not re-filter. The score is asserted to the percent                                                |
| Send onboarding questionnaire (`send-onboarding-questionnaire-button.tsx`)                                                                                                                                  |       142 | A confirm dialog, one action, four outcome sentences, two caption lines                                                    | rewrite over a shared `ConfirmActionButton` (Kit, below)                                                                                                           |          50 | `screens.test.tsx` "Send onboarding questionnaire" (6 cases)                                                                                     | Outcome wording is per-outcome and asserted; the component carries only the shape                                                                    |
| Record server actions (`record-actions.ts`)                                                                                                                                                                 |       220 | Ten server actions, each: capability, call service, map error, revalidate                                                  | rewrite as one `guardedRecordAction` helper plus ten one-line exports (G06-05)                                                                                     |         100 | `record-actions.test.ts` (170 lines)                                                                                                             | `not_permitted` must keep rethrowing rather than becoming a field error; that is asserted per action                                                 |
| Missing queue page and plumbing (`missing/page.tsx`, `missing-filters.tsx`, `empty-queue.tsx`, `missing-query.ts`, `missing-sortable-header.tsx`)                                                           |       402 | Parses eight query keys, reads the queue, three sort passes, two scope toggles, filter bar, empty states                   | rewrite: `missing-filters.tsx` folded into the page, one comparator, shared `QuerySortHeader` (G06-04)                                                             |         279 | `missing/screens.test.tsx` (372 lines)                                                                                                           | The three stacked sorts have a load-bearing order (reachability outermost); one comparator must reproduce it — asserted by row order                 |
| Missing queue board (`queue-board.tsx`)                                                                                                                                                                     |       286 | Selection state, nudge, then the same eight columns drawn twice (table, cards)                                             | rewrite over `DataList` (G06-01), keeping selection and nudge local                                                                                                |         150 | `missing/screens.test.tsx`                                                                                                                       | `missing-row` / `missing-card` test ids and the per-row Nudge/Correct buttons must survive; both asserted                                            |
| Chase wording and nudge action (`missing/chase-presentation.ts`, `missing/actions.ts`)                                                                                                                      |        82 | Five chase states in words; the batch nudge and its four notices                                                           | keep — both are already at their smallest: a lookup-shaped `switch` over a five-member union and one action                                                        |          82 | `chase-presentation.test.ts` (146 lines), `missing/screens.test.tsx`                                                                             | —                                                                                                                                                    |
| Follow-ups surface (`follow-ups/page.tsx`, `queue-filters.ts`, `presentation.ts`, `follow-ups-filter.tsx`, `follow-ups-table.tsx`, `follow-ups-cards.tsx`)                                                  |       523 | Six query keys, flatten, filter, sort, then the same six columns drawn twice                                               | rewrite the two halves and the sort-value `switch` as one column table over `DataList` (G06-01, G06-04); `follow-ups-cards.tsx` deleted                            |         378 | `follow-ups/screens.test.tsx` (486 lines)                                                                                                        | Undated rows sort last and are never filtered out; both asserted                                                                                     |
| `player-record.ts`                                                                                                                                                                                          |       515 | Assembles one membership's whole season: season facts, jersey holders, attendance, item history, activity log, send status | rewrite the reads: seven single-row queries become one, the milestones query folds in, the activity-log display reader becomes one joined query (G06-07, G06-08)   |         415 | `player-record.test.ts` (508 lines), `tests/service-layer-record.test.ts`                                                                        | A combined season-facts query must keep `null` meaning "never recorded" for availability and eligibility; asserted field by field                    |
| `onboarding-chase/` (`chase-state.ts`, `send-status.ts`, `settings.ts`, `index.ts`)                                                                                                                         |       620 | Chase progress from idempotency keys, candidates, next-chase derivation, the record's send status, the settings singleton  | fold the four files into one `onboarding-chase.ts` — `index.ts` only re-exports, and the import path is unchanged by the fold; batch `readOnboardingLastContactIn` |         557 | `onboarding-chase.test.ts`, `onboarding-chase-dispatch.test.ts`, `tests/seed-onboarding-chase.test.ts`                                           | Four test files `vi.mock("@/lib/services/onboarding-chase")`; folding to a single module of that name keeps every mock working                       |
| Onboarding write/read services (`onboarding-activity-log.ts`, `onboarding-agreements.ts`, `onboarding-ask.ts`, `onboarding-item-history.ts`, `onboarding-welcome.ts`)                                       |       476 | Append-only logs, versioned agreements, the compiled ask, the welcome emitter                                              | rewrite the row mappers away (G06-06) and delete the readers nothing but a test reaches (G06-07)                                                                   |         318 | `onboarding-activity-log.test.ts`, `onboarding-agreements.test.ts`, `onboarding-ask.test.ts`, `onboarding-welcome.test.ts`, `membership.test.ts` | Three `ConstraintViolated` rules in the activity-log write are asserted by `rule`; the write path is untouched                                       |
| `onboarding-item-shapes.ts`                                                                                                                                                                                 |        75 | Each item code's own state list and label                                                                                  | keep — it is already one data table plus three three-line readers                                                                                                  |          75 | `onboarding-item-shapes.test.ts`                                                                                                                 | —                                                                                                                                                    |
| `person-fact-dispute.ts`                                                                                                                                                                                    |       203 | Raise, settle and list a disputed person fact                                                                              | rewrite: one column-list constant instead of four copies, `camelRow` instead of `toDispute`, `updateFor`'s nine cases become two                                   |         122 | `person-fact-dispute.test.ts` (222 lines)                                                                                                        | `updateFor` currently type-checks each field/value pairing; the smaller form needs one cast — see G06-06's risk                                      |
| `follow-ups.ts`                                                                                                                                                                                             |       182 | The cross-event outstanding queue, grouped by event                                                                        | keep the grouping and the status ladder; only the duplicated `QueueRow` spelling goes                                                                              |         170 | `follow-ups.test.ts` (517 lines)                                                                                                                 | The four-way status ladder order is load-bearing and asserted case by case                                                                           |
| `chase-position.ts`                                                                                                                                                                                         |        66 | Where one invitation's chase has got to, in one sentence                                                                   | keep — pure, two callers, no branch unreached                                                                                                                      |          66 | `chase-position.test.ts`                                                                                                                         | —                                                                                                                                                    |
| New shared files (`components/data-list.tsx`, `components/confirm-action-button.tsx`, `lib/services/rows.ts`, `operate/query-sort-header.tsx`, plus +10 in `record-field.tsx` and +25 in `status-chip.tsx`) |         0 | —                                                                                                                          | new, counted once here; named below so other sections can adopt rather than re-propose                                                                             |         264 | own colocated tests, written with them                                                                                                           | A kit change is a change to every page that renders it; each gets a colocated test and the pages above are its visual sample                         |

### Proposals

Each number is the net saving over exactly the files the proposal names, with any
new shared file counted inside it. No file appears in two proposals' arithmetic.

#### G06-01 — One `DataList` for the three table-and-card pairs (saves ~353)

- Now: three lists in this section draw every row twice by hand, once as a
  `Table` and once as `RowCard`s. `attendance-section.tsx:182-267` is the
  desktop table and `:273-397` the phone half of the same six columns;
  `queue-board.tsx:125-233` and `:235-298` are the same eight columns twice;
  `follow-ups-table.tsx:61-100` and `follow-ups-cards.tsx:17-48` are the same
  six. The column vocabulary is then a third copy: `attendance-filters.ts:8-17`
  (`COLUMNS`) and `queue-filters.ts:12-19` plus `presentation.ts:14-19`
  (`TABLE_PERSON`…`TABLE_STATUS`). Fifteen files across the application pair
  `TableHead` with `RowCardList` this way.
- Smallest honest shape: `src/components/data-list.tsx`, about 120 lines:
  ```tsx
  export interface Column<R> {
    key: string; label: string;           // also the card Fact label
    cell: (row: R) => ReactNode;          // desktop cell and card value
    card?: "title" | "chips" | "subline" | "fact" | "omit";
    sort?: { href: (k: string) => string; active: boolean; dir: "asc" | "desc" }
         | { onClick: (k: string) => void; active: boolean; dir: "asc" | "desc" };
  }
  export function DataList<R>({ rows, columns, rowKey, empty, leading, trailing,
    actions, tableTestId, rowTestId, cardTestId, ariaLabel }: …)
  ```
  Desktop: `TableFrame` + `Table` + the kit's `SortableHeader` per sortable
  column. Phone: `RowCardList` with `title` from the `card: "title"` column,
  `chips` from the chip column, `sublines` from the sublines plus one `FactGrid`
  of the `fact` columns. `leading`/`trailing` carry the checkbox and the row's
  buttons. Each list then supplies a column array and its own state only.
- Behaviour held by: `[membershipId]/screens.test.tsx` (the Attendance band's 14
  cases, including the filtered score and the `not recorded` cells),
  `missing/screens.test.tsx:310` (row order and the per-row controls),
  `follow-ups/screens.test.tsx:159-219` (row count, order, and that the table is
  absent when empty). Pinned by test id, so `rowTestId`/`cardTestId`/
  `tableTestId` are contract, not convenience: `attendance-row`, `missing-row`,
  `missing-card`, `follow-ups-row`, `follow-ups-card`, `follow-ups-table`,
  `attendance-desktop`, `attendance-phone`. Nothing pins the phone/desktop
  breakpoint pair itself except the screenshots.
- Lines: `attendance-section.tsx` 399 → 185, `attendance-filters.ts` 91 → 75,
  `attendance-table-bits.tsx` 65 → 45, `queue-board.tsx` 286 → 150,
  `follow-ups-table.tsx` 97 → 12, `follow-ups-cards.tsx` 47 → 0, new
  `follow-ups-columns.tsx` 45, new `data-list.tsx` 120 — 985 → 632, because
  three of the six hand-drawn halves disappear into one component and the three
  column vocabularies become the one place each column is described.
- Risk: the phone card and the desktop cell can silently diverge from what they
  render today (a chip that becomes text, a `Fact` that loses its label). Caught
  by the per-case assertions above and by the desktop/375px screenshot pair for
  `/operate/roster/[membershipId]`, `/operate/people/missing` and
  `/operate/admin/follow-ups`.
- Repointed tests: none expected. `follow-ups/screens.test.tsx:197` asserts the
  table element is absent on an empty queue — `DataList` must render its `empty`
  slot instead of an empty frame, as the page does today.
- New dependency: none.

#### G06-02 — The season band as a field list, not 15 hand-wired elements (saves ~290)

- Now: `season-facts-section.tsx` is 213 lines of JSX in which every editable
  field repeats the same six props (`editing === key`, `readOnly={closed}`,
  `error`, `onOpen`, `onClose`, `onCommit`) — see `:55-81`, `:158-169`,
  `:180-223`. Three sibling components exist only because `RecordField` cannot
  take a custom editor: `position-field.tsx` is `RecordField` with the option
  label formatted `code — label` (`:48-52`), `jersey-field.tsx` swaps in
  `JerseyPicker`, `formalwear-field.tsx` swaps in a multi-select. All three, plus
  `onboarding-row.tsx`, re-copy `record-field.tsx:92-120`'s click target verbatim
  — the same nine-line `sx` block appears in six files (`git grep -l
"textUnderlineOffset: 3"`).
- Smallest honest shape: two small changes to the kit member, then one list.
  `RecordField` takes `options?: readonly (string | { value: string; label: string })[]`
  and `editor?: ReactNode` (rendered in place of its own `Select` when
  `editing`). `position-field.tsx` then has nothing left and goes.
  `season-facts-section.tsx` becomes:
  ```tsx
  const wire = (key: string) => ({ editing: editing === key, readOnly: closed,
    error: errorFor(key), onOpen: () => setEditing(key), onClose: () => setEditing(null),
    onCommit: (next: string | string[]) => commitSeasonField(key, next) });
  const SELECTS = [ { key: "status", label: "Status", value: …, rawValue: …,
    options: [...STATUSES], optionLabels: STATUS_OPTION_LABELS, status: {…}, note: … }, … ];
  const READ_ONLY = [["Confirmed", record.confirmedOn], ["Activated", record.activatedOn], …];
  ```
  and maps each array. `jersey-field.tsx` and `formalwear-field.tsx` keep only
  their editor JSX.
- Behaviour held by: `[membershipId]/screens.test.tsx` — "Person · Onboarding ·
  Season banding", "a departed membership" (every editor absent rather than
  disabled, `:1097`), "F1 — REQ-no-narrative" (`:761`, which asserts Formalwear
  and Half/Full Blue carry no caption), and the activation case at `:1116`.
  `src/components/record-field.test.tsx` pins the click target and the underline.
  Nothing pins that `position-field.tsx` exists.
- Lines: 455 → 155 in these four files, plus 10 in `record-field.tsx` (carried
  in the table's shared-files row), because eight editable fields × ~13
  lines of repeated wiring become eight × ~4 descriptor lines plus one 8-line
  `wire()`, and one of the three local editors stops existing.
- Risk: a field that loses its `rawValue` would open its `Select` on the display
  label instead of the stored code, and a field that loses `optionLabels` would
  show raw enum values. Both are asserted per field; the 375px screenshot pair
  catches layout drift in the row.
- Repointed tests: none. `record-field.test.tsx` gains cases for the two new
  props.
- New dependency: none.

#### G06-03 — The record view: one action table instead of a 93-line switch (saves ~137)

- Now: `record-view.tsx:111-203` is a `switch` over nine field keys in which
  every arm does the same three things — pick a service action, build its
  argument from `record`, hand it to `runCommit`. Three arms exist only to map a
  key to a literal (`:134-139` position column, `:187` kit). The Person band
  (`:316-350`) is eleven `RecordField`s that differ only in label and value.
  Three buttons carry the identical seven-property `sx` to make a link look like
  a link (`:255`, `:309`, `:450`). `:460` is `{pending ? null : null}` — dead.
- Smallest honest shape: one table keyed by field, values being
  `(record, next) => Promise<{error: string | null}>`:
  ```ts
  const COMMIT: Record<string, (r: PlayerRecordData, next: string | string[]) => Promise<BoardActionState>> = {
    status: (r, v) => recordSetStatusAction({ membershipId: r.membershipId, status: v as MembershipStatus }),
    offencePosition: (r, v) => recordCommitPositionAction({ …ids(r), column: "offence", code: (v as string) || null }),
    … };
  function commitSeasonField(key: string, next: string | string[]) {
    const run = COMMIT[key]; if (!run) return;
    startTransition(() => { void runCommit(key, () => run(record, next)); });
  }
  ```
  plus one `<RecordLink href label testId />` sibling (6 lines) for the three
  link buttons, and a `PERSON_FACTS` descriptor array for the Person band.
- Behaviour held by: `[membershipId]/screens.test.tsx` — every field's commit is
  asserted through the rendered control, including the activation path
  (`:1116`, `:1142`) and the read-only departed membership (`:1097`);
  `record-actions.test.ts` pins the actions themselves.
- Lines: `record-view.tsx` 428 → 295, `page.tsx` 49 → 45, because nine × ~10
  lines of dispatch become nine × ~2 table rows and eleven × ~3 lines of Person
  JSX become eleven × 1.
- Risk: a wrong table entry would send a field to the wrong service — louder,
  not quieter, than today's `switch`, since every field has a named case.
- Repointed tests: none.
- New dependency: none.

#### G06-04 — The two queues' query plumbing (saves ~131)

- Now: `missing-filters.tsx` (72 lines) is a pure props adapter onto
  `ListFilters`; its 20-line parameter list restates what `page.tsx` already
  holds. `missing-sortable-header.tsx` (40) recomputes "active, next direction,
  carry the other five query keys, render the kit header" — and
  `follow-ups-table.tsx:32-51` plus `participation-table.tsx:192-213` do the
  same thing twice more (the latter also re-exports the kit member under a
  second name, `participation-table.tsx:190`). `missing/page.tsx:102-117`
  applies three successive `[...entries].sort()` passes where one comparator
  would do. `empty-queue.tsx` (45) nests two conditionals to choose one of three
  actions. Status labels are restated per route:
  `follow-ups/presentation.ts:27-32` and `:38-44` name four `delivery` statuses
  the kit already colours (`status-chip.tsx:54-68`), and
  `attendance-filters.ts:49-68` names three more domains' labels.
- Smallest honest shape: delete `missing-filters.tsx` and call `ListFilters`
  from `missing/page.tsx` with the field array inline (the bar's contract is
  already "every word stays with the screen"). Add one
  `src/app/operate/query-sort-header.tsx`:
  `QuerySortHeader({ basePath, query, carry, column, label, defaultColumn, defaultDirection })`
  (~25 lines) and use it from both queues. Replace the three sort passes with one
  comparator (`reachability, then lastContact, then name`). Move the label text
  into `STATUS_VOCABULARY` so `StatusChip` can default its own label and the
  filter option lists derive from it.
- Behaviour held by: `missing/screens.test.tsx` (row order under each sort, the
  two empty states by test id, the scope toggles) and
  `follow-ups/screens.test.tsx` (sort links, `follow-ups-empty`, the search echo).
  No test pins that `missing-filters.tsx` is its own file.
- Lines: `missing-filters.tsx` 72 → 0, `missing-sortable-header.tsx` 40 → 8,
  `empty-queue.tsx` 45 → 28, `missing/page.tsx` 222 → 220,
  `follow-ups/page.tsx` 92 → 85, `queue-filters.ts` 140 → 105,
  `follow-ups/presentation.ts` 32 → 16, new `query-sort-header.tsx` 25, kit
  labels +25 — 643 → 512.
- Risk: the three stacked sorts are order-dependent (reachability must win over
  the delegated longest-waiting order, which must win over name) and
  `explicitSort` must still beat both; one comparator can get that wrong
  silently. Caught by `missing/screens.test.tsx`'s row-order assertions, which
  stage exactly those cases.
- Repointed tests: none expected. If a test imports `MissingFilters` directly it
  follows the fields into `page.tsx`; today's tests render the page.
- New dependency: none.

#### G06-05 — One guarded server action instead of ten (saves ~120)

- Now: `record-actions.ts:55-192` and `:231-251` are ten exported actions whose
  bodies are identical but for the service they call — capability, `try`,
  spread `actorPersonId`, `stateFor(error)`, `refresh`, `OK`. Ten × 17 lines.
- Smallest honest shape: one helper in the same file (it must stay in a
  `"use server"` module, and every export of one must be an async function):
  ```ts
  type Params<F> = Omit<Parameters<F>[0], "actorPersonId">;
  const guarded =
    <F extends (p: never) => Promise<unknown>>(commit: F) =>
    async (params: Params<F> & { membershipId: string }): Promise<BoardActionState> => {
      const operator = await requireCapability("person_record_authority");
      try {
        await commit({ actorPersonId: operator.personId, ...params } as never);
      } catch (error) {
        return stateFor(error);
      }
      refresh(params.membershipId);
      return OK;
    };
  export const recordCommitEntryAction = guarded(commitEntry);
  ```
  `recordSendOnboardingQuestionnaireAction` keeps its own body (it reads the
  refusal reason back and revalidates a second route).
  `../board-actions.ts` — another section's file — wraps the same eight commit
  functions for the board; the helper belongs where both can import it.
- Behaviour held by: `record-actions.test.ts` (170 lines) asserts, per action,
  that a `not_permitted` error rethrows rather than becoming a field message and
  that a `ConstraintViolated` returns `{ error }`; `screens.test.tsx:230-254`
  pins the capability gate.
- Lines: 220 → 100, because ten × 17 become ten × 1 plus a 14-line helper.
- Risk: the cast in the helper loses the per-action argument typing that ten
  explicit signatures give today, so a caller could pass the wrong shape and
  only fail at runtime. The ten call sites are all in `record-view.tsx`'s action
  table (G06-03) and all asserted; if that trade is unacceptable, keep the ten
  signatures as one-line `export async function … { return guarded(commitX)(p) }`
  and the saving halves to ~60.
- Repointed tests: none.
- New dependency: none.

#### G06-06 — One row mapper for every snake_case row (saves ~116)

- Now: six modules in this section declare a `*Row` interface, a camelCase twin
  with the same fields, and a `toX(row)` function that renames them one field at
  a time: `onboarding-item-history.ts:13-49`, `onboarding-agreements.ts:12-45`
  and `:69-87`, `onboarding-activity-log.ts:14-50`,
  `onboarding-chase/settings.ts:11-34`, `person-fact-dispute.ts:25-67`,
  `onboarding-ask.ts:28-33` with its mapper at `:67-72`. Nothing in any of them
  does more than rename.
- Smallest honest shape: `src/lib/services/rows.ts`, about 14 lines:
  ```ts
  type Camel<S extends string> = S extends `${infer H}_${infer T}` ? `${H}${Capitalize<Camel<T>>}` : S;
  export type CamelKeys<T> = { [K in keyof T as Camel<K & string>]: T[K] };
  export function camelRow<T extends object>(row: T): CamelKeys<T> { … }
  export function camelRows<T extends object>(rows: readonly T[]): CamelKeys<T>[] { … }
  ```
  Each module then keeps its `*Row` interface (the query still needs it) and
  declares `export type OnboardingAgreement = CamelKeys<AgreementRow>`, deleting
  the hand-written twin and the mapper. `person-fact-dispute.ts` also gets one
  `DISPUTE_COLUMNS` constant for the column list it spells out four times
  (`:103-105`, `:174-176`, `:204-206`, `:231-233`), and its `updateFor`
  (`:122-151`) becomes two cases — text fields and the two numeric ones.
- Behaviour held by: `onboarding-agreements.test.ts` (179),
  `person-fact-dispute.test.ts` (222), `onboarding-activity-log.test.ts` (172),
  `onboarding-ask.test.ts`, `membership.test.ts` (item history), all of which
  assert the camelCase objects field by field.
- Lines: removals of 24 (activity log), 34 (agreements), 26 (item history), 6
  (ask), 14 (settings) and 26 (dispute) against a 14-line helper.
- Risk: a column whose name is not plain snake_case, or a deliberate rename
  (`row.count` → `ordinal`), would silently change a key. Those stay hand-mapped;
  the field-by-field assertions above catch any that do not. `updateFor`'s
  collapse needs one `as` cast and loses a compile-time pairing check — it is
  the one place in this proposal where a type guarantee is traded for 20 lines,
  and `person-fact-dispute.test.ts` covers all nine fields.
- Repointed tests: none. Exported interfaces become type aliases of the same
  shape.
- New dependency: none.

#### G06-07 — The onboarding services: one activity-log read, and the readers nothing calls (saves ~95)

- Now: one screen section travels through four shapes.
  `onboarding-activity-log.ts:117-130` reads flat rows, `:133-145` groups them,
  `player-record.ts:166-212` then re-maps them and issues a _second_ query for
  the actors' names (`:183-188`) before sorting twice. Meanwhile five exported
  functions have no production caller at all: `onboarding-ask.ts:78-91`
  (`hasLiveOnboardingLinkIn`), `onboarding-welcome.ts:60-69`
  (`onboardingWelcomeAlreadyQueuedIn`), `onboarding-agreements.ts:156-161`
  (`readOnboardingAgreements`, the wrapper), `onboarding-activity-log.ts:117`
  (the flat reader, reached only by its own and `onboarding-welcome`'s tests) and
  `onboarding-item-history.ts:88-102` (reached only by `membership.test.ts`).
  `onboarding-agreements.ts` spells one column list four times; `optional()` is
  defined identically in `onboarding-activity-log.ts:52` and
  `person-fact-dispute.ts:69`.
- Smallest honest shape: one reader,
  `readOnboardingActivityDisplayIn(tx, membershipId)`, whose single query joins
  `people` for the actor name and orders newest-first, returning the sectioned
  shape the view renders; `player-record.ts` calls it and does nothing else.
  Delete the four genuinely unreached exports. Keep
  `readOnboardingItemHistoryIn` — `membership.test.ts` is the only reader but it
  is the proof for six write-path cases, and replacing it would weaken them.
  Move `optional()` to `rows.ts` as `blankToNull`.
- Behaviour held by: `screens.test.tsx:693` ("one entry per ask and per answer,
  individually, grouped by section — never a count") and `:737` (the empty log),
  `player-record.test.ts` (the activity log's order and actor names),
  `onboarding-activity-log.test.ts` (the three `ConstraintViolated` rules on the
  write, untouched).
- Lines: `onboarding-activity-log.ts` 123 → 70, `player-record.ts` −27 for the
  display reader, `onboarding-agreements.ts` −14, `onboarding-ask.ts` −14,
  `onboarding-welcome.ts` −11.
- Risk: the actor fallback chain is load-bearing — person name, then
  `actorLabel`, then the literal `"the club"` (`player-record.ts:199-202`). A
  `left join` must reproduce all three. `screens.test.tsx:693` asserts the
  rendered actor for each kind.
- Repointed tests: `onboarding-activity-log.test.ts:88`/`:129` and
  `onboarding-welcome.test.ts:110` read the flat list; they follow to the new
  reader and assert the same rows. The three tests covering the four deleted
  exports go with the code they cover — `onboarding-ask.test.ts:130-150`,
  `onboarding-welcome.test.ts:136`, `player-questionnaire.test.ts:861`/`:921`
  (the last reads agreements through the wrapper and would use the `…In` form).
  That is a deletion of tests, not a weakening, but it is the one place in this
  section where the suite shrinks, so it is Brian's call to take it or keep the
  five functions.
- New dependency: none.

#### G06-08 — `player-record.ts`: seven queries for one season's facts (saves ~73)

- Now: `readSeasonFactsIn` (`:249-344`) issues seven single-row queries against
  seven tables all keyed by the same `season_membership_id`, then unpacks each
  result in its own loop. `readMilestonesIn` (`:480-495`) is an eighth query for
  two columns of `season_memberships` — a row `readMembership()` has already
  read. `seasonId` is passed in and explicitly discarded (`:330`,
  `void seasonId`). `OnboardingItemHistoryEntry` is declared here (`:89-97`) and
  again, differently, in `onboarding-item-history.ts:13-23`.
- Smallest honest shape: one query with seven `left join lateral`s (or
  aggregates) returning one row, and one mapper; `departed_on` and
  `expected_return_on` join it as two more columns of the same row. Drop the
  unused `seasonId` parameter. Import the history entry type rather than
  redeclaring it.
- Behaviour held by: `player-record.test.ts` (508 lines) asserts each season
  fact, including the `null`-means-never-recorded cases for availability and
  eligibility and the `"None"`/`"Half"`/`"Full"` blues derivation;
  `tests/service-layer-record.test.ts` pins the service boundary.
- Lines: 515 → 415 with G06-07's −27 included; ~73 here, because 95 lines of
  seven queries and seven unpacking loops become ~45, and a 16-line query
  disappears.
- Risk: a `join` that multiplies rows would change `blueNumbers` or the
  formalwear set; an inner join would turn "nothing recorded" into a missing
  membership. Both are asserted. One query also removes seven round trips per
  record view — LAN-227 owns speed, and this is not the measure.
- Repointed tests: none.
- New dependency: none.

#### G06-09 — Three record lists, one divided list (saves ~66)

- Now: `activity-log.tsx`, `status-history.tsx` and `other-seasons.tsx` are the
  same component three times: an empty sentence with its own test id, then a
  `Stack` of `Box`es carrying `borderTop: index === 0 ? "none" : 1` and a
  bold head, a body line and a caption (`activity-log.tsx:26-43`,
  `status-history.tsx:18-42`, `other-seasons.tsx:19-53`). That `borderTop`
  idiom occurs in exactly these three files and nowhere else in `src/`.
- Smallest honest shape: one `record-lists.tsx` beside the page, exporting the
  three components over a local
  `DividedList({ testId, empty, items: { key, head, body, meta, trailing }[] })`
  (~22 lines). Not a kit member: one route renders it.
- Behaviour held by: `screens.test.tsx:693`, `:737` (`activity-log-empty`),
  `:361` (the history link), and the departed-membership case; each empty state
  is addressed by its own test id.
- Lines: 141 → 75, because the empty branch and the row scaffolding are written
  once instead of three times.
- Risk: the three empty sentences and the three test ids must stay exactly as
  they are — they are different sentences for different absences, and rule 5's
  "offer a way forward" does _not_ apply to them today (none carries an action).
  Replacing them with `EmptyState` would be a UX change; it is not proposed.
- Repointed tests: none.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  `attendance-table-bits.tsx:7-15` (`ValueOrNotRecorded`) → `NotRecorded` from
  `components/fact.tsx`, inline as `{v ?? <NotRecorded />}`;
  `position-field.tsx:55-81`, `jersey-field.tsx:39-65`,
  `formalwear-field.tsx:60-86`, `onboarding-row.tsx:149-175` → the click target
  inside `components/record-field.tsx:92-120`;
  `follow-ups-table.tsx:11` reaches the kit's `SortableHeader` through an alias
  re-exported by another route (`participation-table.tsx:190`) — import the kit
  member.
- Pieces two or more routes write that should become one component:
  `attendance-section.tsx` + `queue-board.tsx` + `follow-ups-table.tsx`/
  `follow-ups-cards.tsx` (and twelve more files outside this section that pair
  `TableHead` with `RowCardList`) → `src/components/data-list.tsx` (G06-01);
  `send-onboarding-questionnaire-button.tsx:64-130` and
  `recruitment/[prospectId]/send-questionnaire-button.tsx:71-150` are the same
  dialog twice → `src/components/confirm-action-button.tsx`
  (`{ label, resendLabel, everSent, blocked, canSend, withheldReason, slotKey,
action, renderOutcome, testId }`, ~70 lines). That saves ~22 net in this
  section (142 → 50, plus the 70 counted here) and about the same again in the
  recruitment section, which is why it is worth writing;
  `missing-sortable-header.tsx` + `follow-ups-table.tsx:32-51` +
  `participation-table.tsx:192-213` → `src/app/operate/query-sort-header.tsx`
  (G06-04); `attendance-table-bits.tsx:18-68` (`FilterButton`) is a declared copy
  of `roster-board.tsx`'s funnel (`:17` says so) → one `components/filter-button.tsx`,
  owned jointly with the roster-board section;
  `queue-board.tsx:303-310` (`GapsCell`), `onboarding-row.tsx:114-129` and
  `attendance-section.tsx:115-143` are three `Stack`s of chips with the same
  wrap rules → a `ChipRow` in `components/status-chip.tsx`.
- Kit members this section needs changed to absorb a local copy:
  `record-field.tsx` — accept `options` entries as `{ value, label }` and an
  `editor?: ReactNode` for `editing` (G06-02; this alone deletes
  `position-field.tsx` and thins two more files);
  `status-chip.tsx` — `STATUS_VOCABULARY` holds the colour for every
  (domain, status) but not the word, so every route keeps a label table:
  `follow-ups/presentation.ts:27-32` (four `delivery` statuses),
  `attendance-filters.ts:49-68` (`rsvp`, `attendance`, `event`), and, outside
  this section, `roster/presentation.ts:5-11` and `people/presentation.ts:7-14`
  hold the same five `membership` words twice over. Put the word beside the
  colour, default `StatusChip`'s `label` from it, and standards rule 7 is
  structural rather than a convention. Checked: no two surfaces use a different
  word for the same (domain, status) today, so this moves text without changing
  any screen.

### Product questions

1. **Three filter idioms for three lists.** `/operate/people/missing` uses the
   shared `ListFilters` bar (a search box, selects behind a phone-only
   **Filters** toggle, phone-only Sort and Order selects).
   `/operate/admin/follow-ups` hand-builds its own always-visible row with two
   `DateField`s and no sort controls (`follow-ups-filter.tsx:54-124`). The
   Attendance band uses a third: per-column funnel buttons opening a menu,
   removable chips, a **Clear all**, and at phone width four compact selects
   plus a sort picker and a direction toggle (`attendance-section.tsx:115-143`,
   `:273-340`). One list component can render any of the three, not all three at
   once. Which is the club's filter bar?
2. **Sorting that survives a reload, or sorting that does not.** The missing
   queue and follow-ups sort through the URL, so a sort survives a refresh and
   works without scripting; Attendance sorts in client state and loses the
   choice on reload (`attendance-section.tsx:52-55`, `:108-113`). Unifying means
   picking one.
3. **"Clear" means two things.** Attendance's **Clear all** deliberately removes
   the default Event status filter too — "widen it to everything"
   (`attendance-section.tsx:61-64`) — while the missing queue's **Clear filters**
   returns to a URL that keeps `scope` and restores the defaults
   (`empty-queue.tsx:32-42`). Same word, two behaviours.
4. **One chase fact, two sentences.** LAN-266 asked the record to use "the same
   words the queue already uses", and it does import `formatChaseNext`
   (`record-view.tsx:21`), but the record then prefixes a count —
   `Chase 2 of 4 sent · next 14 Sep 2026` — where the queue's Next column shows
   the bare date (`send-onboarding-questionnaire-button.tsx:155-159`,
   `chase-presentation.ts:25-38`). Deliberate, or drift to be closed?
5. **Two `formatDay`s, two failure behaviours.** This section renders dates
   through both: `roster/presentation.ts:29-36`, which returns the value
   **raw** when it will not parse, and `admin/presentation.ts:250-258`, which
   returns an explicit unreadable-date sentence — imported by
   `chase-presentation.ts:1`. `docs/ux/standards.md` names the first as the
   violation of its own rule 3 and records it as unreachable in practice because
   the values come from `date`/`timestamptz` columns. Folding the section onto
   one formatter is a behaviour change on an unreachable path, which is Brian's
   to take, not mine.

### Not proposed

- `chase-position.ts` (66) — pure, two callers, every branch reached by
  `chase-position.test.ts`; already its smallest form.
- `onboarding-item-shapes.ts` (75) — a data table plus three three-line readers;
  compressing the literals would be formatting, which Prettier owns.
- `missing/chase-presentation.ts` (38) and `missing/actions.ts` (44) — a
  five-case `switch` over a five-member union and one action with four named
  notices. Nothing to remove without losing a sentence.
- `follow-ups.ts`'s status ladder and event grouping (`:145-208`) — four
  statuses in a deliberate precedence order, each asserted; the grouping loop is
  one pass.
- `onboarding-activity-log.ts`'s write path (`:60-114`) — three refusals with
  their own rules, ahead of the database's own checks. Untouched.
- `record-view-presentation.ts` (32) — three pure functions, each with exactly
  one caller and one job.
- `onboarding-item-history.ts`'s reader (`:88-102`) — production never calls it,
  but it is the only way `membership.test.ts` proves six write-path transitions;
  deleting it would weaken the suite.
- `follow-ups-filter.tsx` (115) — cannot be folded into `ListFilters` without
  changing what the screen renders (product question 1).
- Carve-outs, read only as call sites, nothing proposed and nothing moved into
  them: `src/lib/db/**` (`withTransaction`, `Tx`, the error classes),
  `src/lib/auth/guards.ts`, `src/lib/services/messaging-scheduler.ts`
  (`sendOnboardingNudges`, `currentPresidentIn`), `src/lib/services/delivery.ts`
  (`MAX_ATTEMPTS` and the three SQL fragments), `src/lib/delivery/phone.ts`
  (`selectMobileNumber`).

---

## G07 — People: directory, record, edit, create, duplicates and merge

Lines now: 6680. Lines after everything proposed: 5439. Saved: 1241 (19%).

### Files read

All 49 files in the brief.

### Modules

One row per file, grouped by surface. Four files fold into other files and say so.

#### The People list — W1

| Module or surface        | Lines now | What it does                                                                                    | Proposed shape                                                                                                                                                                                                          | Lines after | Tests that prove it                                                                                           | Risk, and how it is caught                                              |
| ------------------------ | --------: | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `people/page.tsx`        |       139 | Reads six query keys, calls `listPeople`, draws the header, the filter bar and two empty states | Keep. Rewrite `EmptyPeople`'s 3-deep title ternary (`:122-128`) as a 4-entry lookup; take `first()` (`:18`) from one shared module                                                                                      |         115 | `people/screens.test.tsx:88` (six columns, season subline), `:220` (widened view), `:251` (both empty states) | Wrong empty-state copy; `:251` asserts both testids and both sentences  |
| `people-table.tsx`       |       225 | The desktop table: six sortable headers and six cells                                           | Rewrite as a column definition fed to `DataList` (G07-03). `PeopleSortableHeader` (`:27-60`) is deleted for a kit `SortableHeader` that carries the query                                                               |          95 | `people/screens.test.tsx:88,124,163,192`                                                                      | A sort link dropping `q`/`scope`; `:124` follows the Type header's href |
| `people-cards.tsx`       |        40 | The phone half: the same six facts as cards                                                     | Delete — the column definition renders both halves                                                                                                                                                                      |           0 | Nothing. No file outside `people-cards.tsx:20` names the `people-card` testid                                 | Unpinned; rests on the 375px screenshot pair                            |
| `people-filters.tsx`     |        63 | The search box and two thin filters over the shared `ListFilters`                               | Keep — it is already a config object over a shared bar; status options come from the folded word table                                                                                                                  |          55 | `operate/list-filters.test.tsx`, `people/screens.test.tsx:163`                                                | A lost filter key; the list test covers the bar                         |
| `people/presentation.ts` |        40 | The list's words: status labels, filterable rungs, person type, missing-field labels            | Fold `STATUS_LABELS` (`:7`) and `PERSON_TYPE_LABELS` (`:35`) onto `roster/presentation.ts:5`'s `MEMBERSHIP_STATUS_LABELS` plus one `recruit` row; the five membership words are written out three times in this section |          25 | `people/screens.test.tsx:88,124`                                                                              | A renamed status word; the list test reads the chip labels              |

#### One person's record — W1-05…W1-12

| Module or surface                  | Lines now | What it does                                                                                       | Proposed shape                                                                                                                                                                                                                  | Lines after | Tests that prove it                                                                                                          | Risk, and how it is caught                                                                                                                                                     |
| ---------------------------------- | --------: | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[personId]/page.tsx`              |       166 | Reads and redacts the record, fans out to five services, lays out three notices and seven sections | Keep the layout. Rewrite `clubRoleSummary`'s 13-line status chain (`:93-104`) as a set test; replace the five-way `Promise.all` (`:69-75`) with one transactional read (G07-02); share `first()`                                |         120 | `[personId]/screens.test.tsx:134,209,243,264,289,316`                                                                        | A changed club-role subtitle; `:134` and `:209` read it for a player and a recruit                                                                                             |
| `identity-contact-sections.tsx`    |       100 | "Who they are" and "How to reach them"                                                             | Rewrite the four contact rows (`:92-109`) as a row table mapped once; inline `By` (`:10-17`, one call site); export `currentContact` (`:20-30`) — `edit/actions.ts:337` and `person-merge/preview.ts:133` are the same function |          78 | `[personId]/screens.test.tsx:134` (absent reads _not recorded_), `:146` (the stored source), `:358` (the unclassified email) | `Fact` renders a bare string at `body2` and a fragment at inherited `body1` (`src/components/fact.tsx:54-62`), so dropping `<>…</>` shrinks every value — screenshot pair only |
| `academic-restricted-sections.tsx` |        75 | "Academic" (six facts) and "Restricted" (date of birth, under-18, emergency contact)               | Rewrite Academic's six near-identical blocks (`:12-42`) as a `[label, value, note]` table and one map; Restricted keeps its emergency-contact block                                                                             |          45 | `[personId]/screens.test.tsx:134,179`, `person-authority.test.ts` (restricted absent from the payload)                       | A restricted fact leaking into the DOM for the wrong role; the page gates on `visible.dateOfBirth`, and `person-authority.test.ts` inspects the payload                        |
| `status-section.tsx`               |        76 | "Where they stand": status chip, alumni standing, role assignments                                 | Keep; the roles list and the override caption are one-offs                                                                                                                                                                      |          60 | `[personId]/screens.test.tsx:134,209`                                                                                        | —                                                                                                                                                                              |
| `seasons-section.tsx`              |        49 | "Their seasons": one row per membership, linking to the roster record                              | Keep. `FactList` would give the ruling for free but moves the label into a 200px column — a visible change                                                                                                                      |          45 | `[personId]/screens.test.tsx:134`                                                                                            | —                                                                                                                                                                              |
| `history-section.tsx`              |       162 | "What changed": three recent entries, or all with a field/actor filter                             | Keep the two states; collapse the duplicated row list and the two action buttons (`:85-102`, `:141-166`) to one each                                                                                                            |         130 | `[personId]/screens.test.tsx:289` (collapsed at three), `:299` (expanded, with both filters)                                 | Losing the three-entry cap; `:289` counts the rows                                                                                                                             |

#### Correcting a record — W2

| Module or surface           | Lines now | What it does                                                                           | Proposed shape                                                                                                                                                                                                                                                                                         | Lines after | Tests that prove it                                                                                                                                              | Risk, and how it is caught                                                                                                                            |
| --------------------------- | --------: | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit/page.tsx`             |        31 | Reads the record and the version, renders the form                                     | Keep                                                                                                                                                                                                                                                                                                   |          31 | `edit/screens.test.tsx:54,65`                                                                                                                                    | —                                                                                                                                                     |
| `edit/edit-state.ts`        |       117 | 33 form keys, their error keys and their reason keys, read one `formData.get` per line | Rewrite as types and one loop derived from the shared person-field table (G07-01)                                                                                                                                                                                                                      |          40 | `edit/actions.test.ts:292,344`                                                                                                                                   | A dropped key stops a field saving; `:292` and `:344` read every field back                                                                           |
| `edit/actions.ts`           |       344 | One submission: validate, then thirteen "if changed, write" blocks                     | Rewrite the field ladders as two loops (G07-01). The contact blocks keep their conflict handling; `buildFailureState` (`:321-328`) `void`s both its arguments; `currentMobile`/`currentEmail` (`:330-343`) are one shared function                                                                     |         203 | `edit/actions.test.ts:147,165,177,199,218,243,252,269,292,329,344,377`                                                                                           | A field no longer written, or a refusal firing on a different condition; the twelve named cases cover fill, correct, refuse, conflict and concurrency |
| `edit/edit-person-form.tsx` |       415 | Sixteen reason-governed fields, the alias editor, the mobile preview, three banners    | Rewrite the sixteen `CorrectableField` blocks (`:111-257`) as a section/field map (G07-01). `CorrectableField` (`:280`), `MobilePreview` (`:356`) and `AliasesEditor` (`:394`) stay — one caller each, correctly siblings. `MIN_TOUCH_TARGET` (`:27`) is used once while `:423` and `:433` hardcode 44 |         325 | `edit/screens.test.tsx:65` (sectioned as the record reads), `:176` (reason box appears and disappears), `:202` (emergency group), `:223` (inline mobile preview) | A changed label or a lost helper sentence; `:65` asserts the labels section by section                                                                |

#### Adding or linking a person — W3

| Module or surface            | Lines now | What it does                                                               | Proposed shape                                                                                                                                                                                                         | Lines after | Tests that prove it                                     | Risk, and how it is caught                                                                                  |
| ---------------------------- | --------: | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `new/page.tsx`               |         7 | Gate, then the form                                                        | Keep                                                                                                                                                                                                                   |           7 | `new/screens.test.tsx:43,53`                            | —                                                                                                           |
| `new/create-state.ts`        |        43 | Four values, their errors, the candidate list, the exact match             | Keep the state. `readCreateValues` (`:40-51`) becomes one loop over a key list; `GENERIC_FAILURE` (`:36`) is the same sentence as `edit-state.ts:64` and `merge-state.ts:8`                                            |          25 | `new/actions.test.ts:91,104`                            | —                                                                                                           |
| `new/actions.ts`             |       174 | Three intents on one action: check, create, link                           | Keep the three intents. Export `person-create.ts:101`'s `duplicateQuery` rather than building the same object at `:39` and `:101`; one `failure()` helper for the five hand-built state objects (`:47,70,110,122,133`) |         140 | `new/actions.test.ts:66,91,104,151,180,207,232`         | A lost candidate list on a failed create; `:104` and `:232` assert it survives the round trip               |
| `new/create-person-form.tsx` |       157 | Three stages driven by one state, with the duplicate answer above the form | Delete the local `CandidateRow` (`:143-173`) for the kit member                                                                                                                                                        |         130 | `new/screens.test.tsx:53,66`, `new/actions.test.ts:104` | A different candidate card; `actions.test.ts:104` asserts what matched, and the kit member has its own test |

#### Merging two records — W4

| Module or surface             | Lines now | What it does                                                        | Proposed shape                                                                                                                                                                       | Lines after | Tests that prove it                                | Risk, and how it is caught                                                                                              |
| ----------------------------- | --------: | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------: | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `merge/page.tsx`              |        56 | Either the find step or the comparison, or a refusal                | Keep. Inline the local `Refusal` (`:55-64`), which only re-passes four props to the kit member                                                                                       |          48 | `merge/screens.test.tsx:55,66,84`                  | `:84` asserts a refusal renders as content, not a crash (standards rule 6)                                              |
| `merge/merge-state.ts`        |         8 | Two optional error strings and the shared failure sentence          | Keep the two fields; take `GENERIC_FAILURE` from one shared module                                                                                                                   |           3 | `merge/actions.test.ts:120`                        | —                                                                                                                       |
| `merge/actions.ts`            |        55 | Reads the reason and three families of answers out of `FormData`    | Rewrite the two `Object.keys(LABELS)` loops (`:30-42`) as one pass over the preview's row names (G07-04); the dynamic `consent_<seasonId>` scan stays                                |          45 | `merge/actions.test.ts:100,120,140`                | An answer silently unread; `merge-comparison.test.tsx:129` pins the posted names and `write.ts:438` refuses server-side |
| `merge/find-other-record.tsx` |        62 | W4-01's search, its empty state and the candidate list              | Keep — `RowCard`, `EmptyState` and `Field` already carry it                                                                                                                          |          55 | `merge/screens.test.tsx:66`                        | —                                                                                                                       |
| `merge/merge-comparison.tsx`  |       319 | The comparison, the survivor swap, what moves, the reason, the gate | Rewrite so the rows arrive shaped (G07-04): `ComparisonRow` (`:22-32`) and the three mappings (`:60-95`) go, and `CONSENT_STATE_LABELS` (`:35-41`) moves beside the states it labels |         260 | `merge-comparison.test.tsx:93,101,108,129,150,158` | Merge becoming available with a row unanswered; `:101` and `:108` count outstanding answers                             |

#### The read services

| Module or surface                                                                 | Lines now | What it does                                                                                 | Proposed shape                                                                                                                                                                                                                                                                  | Lines after | Tests that prove it                                                   | Risk, and how it is caught                                                                                                                |
| --------------------------------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `person-record.ts`                                                                |       429 | Assembles one person from five reads; `searchPeople` for W4-01 and `PersonSummary` for lists | Keep the shape and the restricted-field isolation. Four hand-written mappers (`:197,225,253,298`) go through `camelKeys` (G07-02); the 19-line contact-presence fragment (`:461-479`) is identical to `people-directory/shared.ts:181-200` and becomes one `sql-text.ts` helper |         360 | `person-record.test.ts` (518 lines), `person-authority.test.ts`       | A renamed key breaks redaction, which is keyed by field name (`person-authority.ts:130`); `person-authority.test.ts` inspects the payload |
| `people-directory/shared.ts` + `list-people.ts` + `missing-queue.ts` + `index.ts` |       422 | One directory query, two filtered views, one barrel                                          | Fold into one `people-directory.ts`: the two views are 41 and 54 lines of which 29 are imports from their own sibling. Rewrite `compareBy`'s six-case switch (`shared.ts:328-354`) as a comparator table                                                                        |         360 | `people-directory.test.ts` (654 lines)                                | A changed sort or a changed total; the directory test covers every column, the tie-break and both totals                                  |
| `people-directory/roles-seasons.ts` + `merge.ts` + `history.ts`                   |       228 | The record page's four extra reads, each opening its own transaction                         | Fold into one `readPersonRecordExtras(personId)` in one transaction (G07-02) — each function has exactly one caller, the record page — and map rows with `camelKeys`                                                                                                            |         190 | `people-directory.test.ts`, `[personId]/screens.test.tsx:243,264,289` | A lost history source; the history test asserts both audit and status-event rows                                                          |

#### The merge services

| Module or surface             | Lines now | What it does                                                                                   | Proposed shape                                                                                                                                                                                                                                                                                                                                                                                                                        | Lines after | Tests that prove it                                                                                   | Risk, and how it is caught                                                                                       |
| ----------------------------- | --------: | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `person-merge/preview.ts`     |       492 | The comparison, the per-tuple combinations, and the re-point helpers the write calls           | Keep the SQL. Delete `readSideLabelIn` (`:437-448`): `readMergeSide` already returns the record (whose `displayName` is the same derivation) and its `createdAt`, so this is three queries and twelve lines for nothing. Drop `statusLabel`/`createdAt` from `PersonMergePreview` (`:79-80`) — no surface reads either. Rewrite `fieldValue`'s nested ternary (`:92-111`) as the shared table's accessor; return shaped rows (G07-04) |         400 | `person-merge.test.ts` (959 lines), `merge-comparison.test.tsx`                                       | A different survivor name in the header; `merge/screens.test.tsx:66` and `merge-comparison.test.tsx:150` read it |
| `person-merge/write.ts`       |       543 | Re-points every reference, applies the chosen values, marks and dates the loser, one audit row | Rewrite `applyFieldChoices` (`:302-428`): 127 lines that are a five-branch emergency block and a seven-branch `updatePersonField` ladder differing only in the field name and a `Number()`; its `loserId` parameter is unused (`:427`). `assertEveryDifferenceAnswered` (`:438-475`) iterates the same label maps a fourth time. The 125 lines of reference catalogue (`:47-172`) stay — data, read by a test                         |         430 | `person-merge.test.ts`, `tests/person-merge-reference-catalogue.test.ts`, `merge/actions.test.ts:140` | A field no longer written when the loser's value is chosen; the merge suite exercises the choices field by field |
| `person-merge/eligibility.ts` |       115 | The two refusals, read-only, and the per-side read                                             | Keep both refusals as written; `findSeasonOverlaps`' mapper (`:64-69`) goes through `camelKeys`                                                                                                                                                                                                                                                                                                                                       |         100 | `person-merge.test.ts` (both refusals, and the Q-16 clearance)                                        | A refusal that stops firing; the named cases assert rule and message                                             |
| `person-merge/types.ts`       |        28 | Two label maps and the choice union                                                            | Fold the labels into the shared person-field table (G07-01); keep `MergeChoice` and `MergeFieldChoices`                                                                                                                                                                                                                                                                                                                               |          12 | `person-merge.test.ts`, `merge-comparison.test.tsx:150`                                               | A changed row label; the comparison test reads labels                                                            |
| `person-merge/index.ts`       |         4 | Barrel                                                                                         | Keep — deleting it moves import lines into callers                                                                                                                                                                                                                                                                                                                                                                                    |           4 | —                                                                                                     | —                                                                                                                |

#### The write services

| Module or surface                   | Lines now | What it does                                                           | Proposed shape                                                                                                                                                                                                                                    | Lines after | Tests that prove it                                            | Risk, and how it is caught                                                                                              |
| ----------------------------------- | --------: | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `person-write/shared.ts`            |       117 | The reason rule, the row lock, the version and the concurrency refusal | Keep all four, and add one `inPersonWrite(params, body)` wrapper: six functions in this package repeat `withTransaction` → `lockPersonRow` → `assertNoConcurrentPersonChange` → … → `readPersonRecordIn`                                          |         120 | `person-write.test.ts` (704 lines), `edit/actions.test.ts:269` | The guard skipped on one path; `actions.test.ts:269` drives a real stale save                                           |
| `person-write/fields.ts`            |       105 | Overwrites one durable person field, audited                           | Keep the two refusals. `PERSON_FIELD_COLUMNS` (`:42-52`) is an identity map over a closed union; `PERSON_FIELD_LABELS` (`:30-40`) is the shared table's                                                                                           |          75 | `person-write.test.ts`, `edit/actions.test.ts:292,329`         | A wrong column name; every field is written and read back                                                               |
| `person-write/contact.ts`           |       168 | Supersedes a contact point, refuses a shared email                     | Keep the supersede rule. The same nine-column row type is declared three times (`:41-51,97-107,159-169`) and `toContactValue` (`:41`) is `person-record.ts:225`'s mapper again; the 8-line `fieldLabel` ternary (`:119-126`) is a three-entry map |         130 | `person-write.test.ts`, `edit/actions.test.ts:177,252`         | A changed refusal sentence — `:252` asserts the shared-email message and the merge handoff                              |
| `person-write/emergency-contact.ts` |       105 | Creates or corrects one field of the one emergency-contact row         | Keep the create-then-correct rule and the value-free audit; the label map (`:23-31`) is the shared table's                                                                                                                                        |          85 | `person-write.test.ts`, `edit/actions.test.ts:344`             | A value reaching the audit trail (`REQ-restricted-fields`); the write test asserts `fromState`/`toState` are `recorded` |
| `person-write/aliases.ts`           |       129 | Add, remove and set-display-name, each audited                         | Keep; three writes through the new wrapper                                                                                                                                                                                                        |         100 | `person-write.test.ts`, `[personId]/screens.test.tsx:134`      | —                                                                                                                       |
| `person-write/index.ts`             |         7 | Barrel                                                                 | Keep                                                                                                                                                                                                                                              |           7 | —                                                              | —                                                                                                                       |

#### The rules

| Module or surface         | Lines now | What it does                                                                    | Proposed shape                                                                                                                                                                                                                                                                                                                                            | Lines after | Tests that prove it                                                        | Risk, and how it is caught                                                                                                                                   |
| ------------------------- | --------: | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `person-create.ts`        |       193 | W3's write: validate, re-check duplicates in-transaction, mint or link          | Keep. `validateMinimum` (`:52-98`) repeats validate-then-throw five times; one loop over `[value, validator]` pairs produces the same message and rule                                                                                                                                                                                                    |         175 | `person-create.test.ts` (208 lines), `new/actions.test.ts:232`             | A refusal rule string changing; both tests assert rules                                                                                                      |
| `person-duplicate.ts`     |       224 | The one duplicate check, and the QR probe                                       | Keep the matching rule. The five predicates are written twice — boolean columns (`:134-169`) then the same five in the `where` (`:172-190`); filtering a subquery on the flags removes fourteen lines and evaluates each once. `matchedOnFrom` (`:99-107`) is a five-entry table; `displayNameFrom` (`:89-97`) is `person-record.ts:144`'s function again |         195 | `person-duplicate.test.ts` (219 lines)                                     | A candidate lost, or `matchedOn` reordered; the test asserts the matched set per case                                                                        |
| `person-required.ts`      |        82 | Three required tiers and what a record lacks                                    | Keep the tiers. `PRESENCE_KEY_FOR_FIELD` (`:80-93`) exists only to camel-case the field names; keying `PersonFactPresence` by `RequiredField` deletes it                                                                                                                                                                                                  |          70 | `person-required.test.ts` (151 lines)                                      | A field dropping out of a tier; the test enumerates all three                                                                                                |
| `person-validation.ts`    |       195 | Email, phone, year, date-of-birth and the Oxford rule, shared by seven surfaces | Keep — already at its smallest: every branch is a refusal sentence some surface renders. `DEFAULT_CALLING_CODE` is declared here (`:4`) and again at `phone-parts.ts:11`                                                                                                                                                                                  |         193 | `person-validation.test.ts`                                                | —                                                                                                                                                            |
| `phone-parts.ts`          |       151 | Splits, joins and validates the two-box phone control                           | Keep; 39 lines are the calling-country table, which is data                                                                                                                                                                                                                                                                                               |         148 | `phone-parts.test.ts` (round-trip, and every country)                      | —                                                                                                                                                            |
| `person-whatsapp-seam.ts` |        20 | Describes what changing a number costs a WhatsApp-consenting person             | Delete because its only caller passes the third argument as the literal `false` (`edit-person-form.tsx:368-373`), so `{warn: false, message: null}` is the only reachable result and `:379`'s `Notice` can never render                                                                                                                                   |           0 | `person-whatsapp-seam.test.ts` — the module's own test, which goes with it | Nothing renders differently. This is the only test this section proposes removing, and it exists solely for the deleted module; see product question 2 first |

#### New shared files

| Module or surface                                                    | Lines now | What it does                 | Proposed shape                                                                                                                                                                                                                                                                | Lines after | Tests that prove it                                                            | Risk, and how it is caught                                                                   |
| -------------------------------------------------------------------- | --------: | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/lib/services/person-fields.ts`                                  |         0 | —                            | New: one table of the nine person fields, five emergency fields and three contact kinds, carrying column, label, accessor and value kind (G07-01)                                                                                                                             |          90 | The existing edit, write and merge suites                                      | A missing row silently removes a field; `edit/actions.test.ts:292,344` read every field back |
| `src/components/data-list.tsx`                                       |         0 | —                            | New: desktop table plus phone cards from one column definition, composing `TableFrame`, `SortableHeader`, `DesktopOnly`, `RowCard` (G07-03)                                                                                                                                   |          70 | A colocated `data-list.test.tsx`, as every kit member has                      | A changed table shape on five boards; the kit test plus each board's own assertions          |
| `src/lib/row-case.ts`                                                |         0 | —                            | New: `CamelKeys<T>` and `camelRows` (G07-02)                                                                                                                                                                                                                                  |          14 | The service suites that assert every mapped field                              | A column whose camel form is not the field name disappears; asserted field by field          |
| `src/lib/query-params.ts`, `src/lib/services/messages.ts`            |         0 | —                            | New: `first()` (three copies in this section: `people/page.tsx:18`, `people-table.tsx:17`, `[personId]/page.tsx:26`, plus two outside it) and the one save-failure sentence (three copies: `edit-state.ts:64`, `create-state.ts:36`, `merge-state.ts:8`, plus two outside it) |          11 | `edit/actions.test.ts`, `new/actions.test.ts`                                  | —                                                                                            |
| `src/components/sortable-header.tsx`, `src/lib/services/sql-text.ts` |         — | Existing kit and SQL helpers | Changed: the header takes `basePath`, `carry`, `query` and a per-column default direction; `sql-text.ts` gains the contact-presence fragment                                                                                                                                  |         +20 | `sortable-header.test.ts`, `people-directory.test.ts`, `person-record.test.ts` | —                                                                                            |

#### Patterns hunted

- **Per-route `presentation.ts` / `*-state.ts` restating a vocabulary or a result shape.** Occurs: `people/presentation.ts:7` restates `roster/presentation.ts:5`'s five membership words, and `people-directory/history.ts:32-38` restates them a third time; `edit-state.ts:64`, `create-state.ts:36` and `merge-state.ts:8` each hold the same failure sentence; all three states carry their own `formError` field.
- **Actions parsing `FormData`, building a result and routing refusals by hand.** Occurs throughout: `edit-state.ts:97-134` is 33 `formData.get` lines; `new/actions.ts` builds five state objects by hand (`:47,70,110,122,133`); `validationFieldErrors` (`:191-199`) is a rule-prefix table written as four `if`s.
- **Hand-written validation per form where one rule table would do.** Occurs: `edit/actions.ts:59-87` validates mobile, college email and date of birth with three bespoke changed-and-non-empty blocks; `person-create.ts:72-95` repeats validate-then-throw five times. The validators themselves are correctly shared (`person-validation.ts`, seven callers).
- **`read`/`write`/`shared`/`index` quartets.** Occurs in `people-directory/` (a 318-line `shared.ts` with two 41- and 54-line callers and a 9-line barrel) — folded by G07-02. Does **not** occur in `person-write/` (each sibling is a real write with its own rules) or `person-merge/` (preview, write, eligibility, types are four different jobs, though `preview.ts:261-390` holds three write helpers that the write calls).
- **Repeated SQL fragments differing only in a column list.** Occurs: the contact-presence fragment twice (`people-directory/shared.ts:181-200`, `person-record.ts:461-479`); the nine-column `contact_points` list four times (`person-record.ts:218`, `person-write/contact.ts:108,172`, plus the row types); the duplicate check's five predicates twice in one statement (`person-duplicate.ts:134-190`).
- **N-way `Promise.all` reads that are one query.** Occurs: `[personId]/page.tsx:69-75` calls five services, four of which open their own transaction, so one page render is five connections and five snapshots. `person-record.ts:342-347`'s `Promise.all` is already inside one transaction and is fine.
- **A vocabulary, label or colour table in a service and again in a route.** Occurs: the membership words (above); `merge-comparison.tsx:35-41` holds the `messaging_consent_state` words in the route while the service supplies the states; `person-merge/types.ts:13-30` holds labels that are also the edit form's.
- **Table + card pairs built by hand.** Occurs: `people-table.tsx` plus `people-cards.tsx` — G07-03, which also names the four other boards with the same pair.
- **Envelope or "event" layers wrapping one call site.** Occurs once: `person-whatsapp-seam.ts`, whose one caller can only produce the empty result. `recordAudit` is not an instance — it has callers across the application and writes a real row.
- **Components re-wrapping MUI or a kit member without adding behaviour.** Occurs: `merge/page.tsx:55-64` around `Refusal`; `identity-contact-sections.tsx:10-17` (`By`) around `Typography`; `people-table.tsx:27-60` and the two other copies around `SortableHeader`. Local copies of a kit member: `create-person-form.tsx:143` (`CandidateRow`).
- **Long `switch`/`if` ladders over a status that a lookup table expresses.** Occurs: `person-merge/write.ts:369-425` (seven branches), `preview.ts:92-111` (eight-deep ternary), `people-directory/shared.ts:328-354` (six-case comparator switch), `[personId]/page.tsx:93-104` (five-way status chain), `person-write/contact.ts:119-126`, `people/page.tsx:122-128`.
- **Types declared twice.** Occurs: `ComparisonRow` (`merge-comparison.tsx:22-32`) over the service's three comparison shapes; `CreateFormValues` (`create-state.ts:3-8`) over `CreatePersonInput` (`person-create.ts:21-29`); `toContactValue`'s row type three times in `person-write/contact.ts`.
- **Anything the workflow map does not reach.** No dead surface: every file is reached by M5 W1–W4 or W7. Unreachable _branches_: the WhatsApp seam's warning (above); `PersonMergePreview.statusLabel` and `.createdAt` (`preview.ts:79-80`), which no surface reads; `PersonListEntry.membershipId` (`people-directory/shared.ts:35`) is set by the directory query and read only by the missing queue, which is honest and documented.

### Proposals

#### G07-01 — One person-field table drives the edit form, its action, and the merge (saves ~346)

- Now: the same nine person fields, five emergency-contact fields and three contact kinds are enumerated by hand in eight places. `edit-state.ts:3-24` lists the error keys, `:30-46` the reason keys, `:72-95` the value keys, and `:97-134` reads all 33 of them out of `FormData`, one `formData.get` per line. `edit/actions.ts:151-296` is thirteen `if (values.x.trim() !== (current.x ?? "")) await updatePersonField({…})` blocks differing only in the field name, a blank-is-null clause and `Number()`. `edit-person-form.tsx:111-257` is sixteen `<CorrectableField name reasonName label original>` blocks. `person-merge/write.ts:302-428` is the same list again as an if/else-if ladder. `person-merge/preview.ts:92-111` maps field to record key as a 19-line nested ternary. `person-merge/types.ts:13-22`, `person-write/fields.ts:30-40` and `person-write/emergency-contact.ts:23-31` hold three label maps over the same unions, and `fields.ts:42-52` an identity column map.
- Smallest honest shape: one client-safe data module, `src/lib/services/person-fields.ts`:

  ```ts
  export const PERSON_FIELDS = [
    {
      key: "given_name",
      form: "givenName",
      label: "First name",
      of: (r: PersonRecord) => r.givenName,
      kind: "text",
      required: true,
    },
    {
      key: "matriculation_year",
      form: "matriculationYear",
      label: "Matriculation year",
      of: (r) => r.matriculationYear,
      kind: "number",
    },
    // … 7 more person fields; 5 emergency fields (scope: "emergency");
    //    3 contact kinds (scope: "contact", contact: { kind, scope })
  ] as const;
  export type PersonFormKey = (typeof PERSON_FIELDS)[number]["form"];
  ```

  `EditFormValues` and `EditFieldErrors` become `Record<PersonFormKey | ReasonKey, string>` and its `Partial`; `readEditFormValues` becomes one loop. The action becomes one loop per scope — compare `f.of(current)` with `values[f.form]`, write through `updatePersonField` or `updateEmergencyContactField`. The form becomes `EDIT_SECTIONS.map(s => … s.fields.map(f => <CorrectableField … />))`. `applyFieldChoices` becomes one loop with a numeric-coercion test. `fieldValue` becomes `f.of(record)`, stringified. The three label maps and the identity column map go; `key` is already the column.

- Behaviour held by: `edit/actions.test.ts:165` (fill with no reason), `:177` (reason required, old value kept and dated), `:199` (per-field refusals naming the rule), `:218` (future date of birth refused before any write), `:292` (six fields corrected at once, each read back), `:329` (the same six refused without a reason), `:344` (every emergency field), `:269` (concurrent save), `:377` (nothing moves on the ladder); `edit/screens.test.tsx:65,176,202`; `person-merge.test.ts` (the loser's value applied per field); `person-write.test.ts`; `merge/actions.test.ts:140`. Pinned by no test: the order of fields inside a section, and which three fields carry an `unchangedHelperText` (`edit-person-form.tsx:163,202,209`) — the table has to carry both deliberately.
- Lines: 587 → 241, because 33 hand-read keys, thirteen write blocks, sixteen JSX blocks, a 127-line ladder, a 19-line ternary and four maps become one 90-line table plus six loops of about ten lines.
- Risk: a field omitted from the table stops being editable, and a wrong `kind` writes a string where a number belongs. `edit/actions.test.ts:292` and `:344` correct every field and read the record back; a wrong label fails `edit/screens.test.tsx:65`, which asserts labels section by section.
- Repointed tests: none need rewriting — `edit/actions.test.ts` builds `FormData` by field name, which does not change. `merge-comparison.test.tsx:29-35` drops the two preview keys nothing reads.
- New dependency: none.

#### G07-02 — One read layer: `camelKeys`, one transaction per surface (saves ~145)

- Now: eleven row mappers spell snake-to-camel out by hand — `person-record.ts:197-203,225-235,253-259`, `people-directory/history.ts:112-139`, `roles-seasons.ts:34-40,61-65`, `merge.ts:47-52`, `person-merge/eligibility.ts:64-69`, `preview.ts:253-258`, `person-write/contact.ts:52-62`, `person-duplicate.ts:205-217`. Separately, `[personId]/page.tsx:69-75` calls five services in one `Promise.all` and four of them open their own `withTransaction` (`roles-seasons.ts:15,52`, `merge.ts:17,30`, `history.ts:49`); `list-people.ts` and `missing-queue.ts` spend 29 of their 95 lines importing from their own sibling.
- Smallest honest shape: `src/lib/row-case.ts` with a key-remapped mapped type —

  ```ts
  type Camel<S extends string> = S extends `${infer H}_${infer T}`
    ? `${H}${Capitalize<Camel<T>>}`
    : S;
  export type CamelKeys<T> = { [K in keyof T as Camel<K & string>]: T[K] };
  export function camelRows<T extends object>(rows: readonly T[]): CamelKeys<T>[];
  ```

  Each mapper becomes `camelRows(result.rows)`, with a spread where a default or a coercion is genuinely needed (`{...camelKeys(row), actorDisplayName: row.actor_display_name ?? "Unknown"}`). The record page's four extra reads become one `readPersonRecordExtras(personId)` in one transaction; `shared.ts`, `list-people.ts`, `missing-queue.ts` and `index.ts` fold into one `people-directory.ts`; the doubled contact-presence SQL becomes one `sql-text.ts` helper.

- Behaviour held by: `people-directory.test.ts` (654 lines — every column, both totals, the sorts), `person-record.test.ts` (518 lines), `person-duplicate.test.ts`, `person-merge.test.ts`, `[personId]/screens.test.tsx:134,146,179,243,289`.
- Lines: 264 → 119, because eleven mappers (~105 lines) become eleven calls, three transaction wrappers and 29 import lines go, and one SQL fragment is written once.
- Risk: a column whose camel form is not the field name silently disappears from a row. Every mapper's output is asserted field by field by the suites above, and `person-authority.test.ts` fails if a `PersonRecord` key is renamed, because redaction is keyed by name.
- Repointed tests: none — the public shapes and the module's import path are unchanged.
- New dependency: none.

#### G07-03 — One `DataList` renders the desktop table and the phone cards from one column definition (saves ~100)

- Now: `people-table.tsx` (225) and `people-cards.tsx` (40) render the same six facts twice. Forty-five lines of the table (`:196-240`) are six near-identical `PeopleSortableHeader` elements, and that wrapper (`:27-60`) rebuilds the query string; `people/missing/missing-sortable-header.tsx` is the same 44 lines with a different key list and one column's default direction, and `calendar/sortable-header.tsx` a third variant.
- Smallest honest shape: `src/components/data-list.tsx` exporting `DataList<T>({ rows, columns, sort, direction, basePath, query, testId })`, composing the kit's existing `DesktopOnly`, `TableFrame`, `SortableHeader`, `RowCard` and `RowCardList`. A column is `{ key, label, cell(row), card?: "title" | "chip" | "subline", href?(row), defaultDirection? }`. `src/components/sortable-header.tsx` gains `basePath`, `carry: readonly string[]` and `query`, so no route writes a header wrapper again. People keeps six `cell` functions and one `<DataList>`.
- Behaviour held by: `people/screens.test.tsx:88` (six columns and the season subline), `:124` (the Player/Recruit chip, sortable, carrying filters), `:163` (the matched-alias subline), `:192` (the missing count's link and its scoping), `:220` (the widened view); plus `src/components/sortable-header.test.tsx`. The phone card list is pinned by nothing — no file outside `people-cards.tsx:20` names its testid — so its conformance rests on the 375px screenshot pair.
- Lines: 265 → 95 locally, plus 70 in `src/components/data-list.tsx` and about 12 added to `sortable-header.tsx`, because six header elements, one query-carrying wrapper and a second pass over the same columns become one definition.
- Risk: a sort link dropping a filter, or a phone card losing a subline. The first fails `people/screens.test.tsx:124`, which follows the Type header's href and asserts `q` and `scope` survive; the second is caught only by the screenshot pair.
- Repointed tests: none — `people/screens.test.tsx` asserts rendered cells and hrefs, not the component. A new `data-list.test.tsx` becomes the kit member's own contract.
- New dependency: none.

#### G07-04 — The merge preview hands over the comparison rows (saves ~65)

- Now: `preview.ts` returns three differently shaped arrays (`:36-52`, `:218-223`) plus an alias pair, and `merge-comparison.tsx:22-32,60-95` declares a fourth shape and re-maps all of them into it — 28 lines whose only content is renaming `field`, `kind` and `seasonId` to one `name`. `merge/actions.ts:30-42` then iterates the two label maps again to read the answers back, and `merge-comparison.tsx:35-41` keeps the `messaging_consent_state` words in the route while the service supplies the states.
- Smallest honest shape: `previewPersonMerge` returns `rows: MergeComparisonRow[]` — `{ name, label, survivorValue, loserValue, differs, needsChoice, choosable }` — already in form-name order, with the consent words beside the states they label. The route renders `preview.rows.map(…)`; `merge/actions.ts` reads answers back by iterating the same names. The aliases row carries `choosable: false` instead of the route's `bothSidesAlways` prop.
- Behaviour held by: `merge-comparison.test.tsx:93` (nothing pre-selected), `:101` (the outstanding count), `:108` (Merge offered once every difference is answered), `:129` (what is posted, and that a non-question posts nothing), `:150` (an agreeing row renders one value), `:158` (a refusal asks nothing); `merge/actions.test.ts:140`; `person-merge.test.ts` for the server-side backstop.
- Lines: 80 → 35, plus the inlined `Refusal` (`merge/page.tsx:55-64`, 10 → 5), because the row shape is declared once instead of four times.
- Risk: a changed row name silently drops an answer, since the action reads names out of `FormData`. `merge-comparison.test.tsx:129` asserts the exact posted names, and `write.ts:438` refuses server-side when an answer is missing.
- Repointed tests: `merge-comparison.test.tsx:20-90` builds a `PersonMergePreview` fixture; it would build `rows` instead of `fields`, `contacts` and `consentCombinations`, asserting the same rendered output.
- New dependency: none.

Savings under 60 lines are carried by the table's own numbers: the `Fact` row tables in the record sections (~72), the `person-write` transaction wrapper and `contact.ts`'s thrice-declared row type (~55), `first()` and the failure sentence three times each (~30), the local `CandidateRow` (~24), `person-duplicate.ts`'s doubled predicates (~14), `validateMinimum`'s five repeats (~15), `PRESENCE_KEY_FOR_FIELD` (~13), the four status-word tables (~15), `readSideLabelIn` (~12), `compareBy`'s switch (~15), and the two history-section branches (~32).

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  - `people/new/create-person-form.tsx:143-173` → `src/components/candidate-row.tsx`. The kit member has no caller today except `design-preview/(operator)/kit/page.tsx:225`; three routes wrote their own instead (`recruitment/new/add-recruit-form.tsx:468`, `roster/new/returner-intake-form.tsx:262`).
  - `people/[personId]/merge/page.tsx:55-64` → `src/components/refusal.tsx`, which it wraps without adding anything.
  - `people/people-table.tsx:27-60` → `src/components/sortable-header.tsx`, once that member carries the query.
  - `people/[personId]/identity-contact-sections.tsx:10-17` (`By`) → `Fact`'s `provenance` slot, which every other row in the same file already uses.
- Pieces two or more routes write that should become one component:
  - `people-table.tsx` + `people-cards.tsx`, with `people/missing/queue-board.tsx`, `operate/events/operator-list.tsx` and `participation/participation-table.tsx` → `src/components/data-list.tsx` (G07-03).
  - `people-table.tsx:27`, `people/missing/missing-sortable-header.tsx:5`, `calendar/sortable-header.tsx:14` → `SortableHeader` with `basePath`, `carry`, `query` and a per-column default direction; the three differ only in the carried keys and one column's default.
- Kit members this section needs changed to absorb a local copy:
  - `CandidateRow` — `action` must accept a submit button (`name`/`value`) or a `ReactNode`, not only `href`/`onClick` (`src/components/candidate-row.tsx:25`); all three local copies post a value into the enclosing form (`create-person-form.tsx:161-170`).
  - `SortableHeader` — takes `basePath`, `carry`, `query` and `defaultDirection`, and builds the href itself.
  - `Fact` — `label?: ReactNode` would let `seasons-section.tsx:34-44` use `FactList`'s ruling. **Not proposed**: `Fact`'s inline layout puts the label in a 200px column, which is a visible change.

### Product questions

1. **Two date forms on one record.** The merge notice renders `1 September 2026` (`[personId]/page.tsx:155-159`) and every history row `1 September 2026, 14:22` (`history-section.tsx:37-43`), both hand-rolled with `toLocaleString`. `docs/ux/standards.md` rule 3 and `docs/ux/design-system.md` §3 say a date reads `27 Aug 2026` and a recorded moment `27 Aug 2026, 14:22`, which is what the shared `formatDay`/`formatWhen` produce (`operate/roster/presentation.ts:20,29`) — and the same record already uses `formatDay` for date of birth (`academic-restricted-sections.tsx:52`). The concurrent-edit refusal is a third form, `1 September, 14:22`, with no year (`person-write/shared.ts:122-127`). Unifying them changes what three surfaces render, so it is a decision, not a simplification.
2. **The WhatsApp row and the WhatsApp seam.** The record always renders `On WhatsApp · <season>: not recorded` — a hardcoded `NotRecorded` (`identity-contact-sections.tsx:95-97`) — and the edit form's seam warning can never fire, because its caller passes `false` literally (`edit-person-form.tsx:368-373`). Meanwhile `season_messaging_consents` holds a real per-season consent state, which the merge screen reads and labels (`person-merge/preview.ts:232-258`). Either the row should read that state and the seam warn from it, or both should go. A rewrite cannot choose, and this is the one place where deleting dead code also deletes a test.
3. **"Is this person a player?" is answered twice, differently.** The Type column derives it as "anything that is not `recruit`", including a person with no status at all (`people/presentation.ts:31-33`); the To-the-club column derives it from a membership tie, falling through to `Recruit` and then to nothing (`people-directory/shared.ts:251-265`). A staff-only person with no membership and no prospect record therefore reads `Player` in one column and blank in the other, on the same row. `docs/ux/standards.md` rule 7 says the two must agree; which one is right is a product answer.
4. **The missing-count link can land on an empty queue.** The count links to `/operate/people/missing?q=<displayName>` (`people-table.tsx:121`), and the queue matches the term against the given name, the family name or an alias separately (`people-directory/shared.ts:279-283`). A person whose display name comes from an alias — `Ali Khan`, from alias `Ali` plus family name `Khan` — matches none of the three, so the link shows nothing. Fixing it means scoping the queue by person id, which changes the queue's query contract.

### Not proposed

- `person-validation.ts` — seven surfaces share it and every branch is a distinct refusal sentence one of them renders; it is already at its smallest.
- `phone-parts.ts` — 39 of 151 lines are the calling-country table, and split, join and validate have one caller each in the kit's `PhoneField`.
- `person-merge/write.ts:47-172` — 125 lines of reference catalogue and exclusions: data, read by `tests/person-merge-reference-catalogue.test.ts` against `pg_constraint`.
- `PersonRecord`'s nine `*Source` fields (`person-record.ts:66-88`) — collapsing them into one `sources` map needs an edit to `src/lib/auth/person-authority.ts:130`, which names every one and is a carve-out.
- `person-write/index.ts` and `person-merge/index.ts` — eleven lines of barrel between them; deleting either moves import lines into callers rather than removing any.
- `seasons-section.tsx` and `status-section.tsx` — one-off record sections already close to their smallest; the first would need a kit change to shrink, which changes the layout.
- The five `visible.x !== undefined` section gates (`[personId]/page.tsx:173-183`) — `redactPersonRecord`'s contract, and the carve-out owns the categories.
- `searchPeople`'s 100-row limit and `DEC-w1-12`'s "no pagination" (`person-record.ts:392`) — an unbounded-list finding already recorded as owner's (`design-system.md` §8, F2).
- Carve-out files read for context only: `src/lib/auth/person-authority.ts`, `src/lib/auth/guards.ts`, and `src/lib/db`'s `withTransaction`, `isServiceError` and error classes.

---

## G08-recruitment — the board, the recruit's record, add by hand, the public doors, QR, cycles

Lines now: 7055. Lines after everything proposed: 5398. Saved: 1657 (23%).

Accounting convention: where a proposal needs a new shared component, its lines
are counted once here, inside the row that proposes it, even when the second
caller lives in another section. Five proposals therefore read small here and
large across the application; each says so in its own clause. Without the QR
dependency (G08-01, which carries a product question) the total is 5640, saved
1415 (20%).

### Files read

All 56 files in the brief. Also read for context and not proposed in: the kit
(`src/components/*`), `src/app/operate/board-filter-controls.tsx`,
`src/app/operate/roster/{board-columns,board-data,roster-board,roster-board-header,roster-board-card}.tsx`,
`src/app/operate/roster/[membershipId]/send-onboarding-questionnaire-button.tsx`,
`src/app/rsvp/[token]/not-found.tsx`, and the carve-outs `@/lib/db`,
`@/lib/rsvp/public-surface`, `@/lib/services/rsvp-tokens`,
`player-answer-tokens`, `messaging-scheduler`, `@/lib/delivery`.

### Modules

| Module or surface                                                                                 | Lines now | What it does                                                                 | Proposed shape                                                                                                                                                                                  | Lines after | Tests that prove it                                                        | Risk, and how it is caught                                                                |
| ------------------------------------------------------------------------------------------------- | --------: | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `recruitment-prospect/` (7 files)                                                                 |       686 | W2's record read, the exits, the flip, the two sends                         | Rewrite as one `recruitment-prospect.ts`: `index.ts` and `shared.ts` are pure re-export/one-constant files, six copies of the same imports, and `readSendStateIn` runs two queries for one fact |         605 | `src/lib/services/recruitment-prospect.test.ts` (953)                      | A merged file could drop an export; the test imports every one by name                    |
| `recruitment-board.ts`                                                                            |       260 | W1's one-line-per-recruit read                                               | Fold the answer mapper, `yesNo`, the presence narrowing and `SENT_STEP_KEYS` into a new shared `recruitment-answers.ts`; the 7-way `Promise.all` stays                                          |         215 | `recruitment-board.test.ts`, `board-data.test.ts`                          | Answer precedence (boolean → choice → text) could shift; both readers assert it           |
| new `recruitment-answers.ts`                                                                      |         0 | The six Questionnaire B columns, read once                                   | New: the mapper `read.ts:260` and `recruitment-board.ts:233` both write                                                                                                                         |          25 | both of the above                                                          | —                                                                                         |
| `recruitment-signup.ts`                                                                           |       412 | W7's one write, through two doors                                            | Rewrite the validation ladder as a rule table; one `fillIfBlankIn` for four near-identical helpers                                                                                              |         322 | `recruitment-signup.test.ts` (749), `join/[code]/actions.test.ts`          | A rule table can reorder refusals; the tests assert each `rule` string                    |
| `recruitment-add.ts`                                                                              |       258 | W6's everything-after-`createPerson`                                         | Fold onto `recruitment-signup.ts`'s helpers — four of its five private functions are copies of them                                                                                             |         165 | `recruitment-add.test.ts` (475)                                            | The alias branch genuinely differs (product question 5)                                   |
| `recruitment-cycle.ts`                                                                            |       190 | The four cycle rows, completion, job declaration                             | Keep; `declareRecruitmentCycleJobsIn` is dense but every line is a rule                                                                                                                         |         175 | `recruitment-cycle.test.ts`, `recruitment-cycle-dispatch.test.ts` (1129)   | —                                                                                         |
| `recruitment-questionnaire.ts`                                                                    |        98 | Questionnaire B's one write                                                  | Rewrite the six `if` blocks as one table of `{code, extract}`                                                                                                                                   |          70 | `recruitment-questionnaire.test.ts`                                        | A blank must still not supersede; the test pins it                                        |
| `recruitment-vocabulary.ts`                                                                       |       120 | The mission's words, positions, gear                                         | Keep, plus one `PROSPECT_STATUS_ORDER` the three copies of the ladder read                                                                                                                      |         122 | `status-chip.test.tsx`, `board-data.test.ts`                               | —                                                                                         |
| `recruitment-signup-codes.ts`                                                                     |        92 | The season's one live code                                                   | Keep, minus `resolveRecruitmentSignupCode` (`:72`), which no route calls                                                                                                                        |          86 | `recruitment-signup-codes.test.ts`                                         | Tests call the deleted wrapper; repoint to the `…In` form                                 |
| `recruitment-interest-tokens.ts`, `recruitment-candidate-identity.ts`, `recruitment-config.ts`    |       148 | The Questionnaire B credential, W8's "who is this candidate", the group link | Keep — each is one job at close to its smallest size                                                                                                                                            |         148 | `recruitment-interest-tokens.test.ts`, `recruitment-config.test.ts`        | —                                                                                         |
| `src/lib/qr/qr-matrix.ts`                                                                         |       250 | A hand-rolled QR encoder for W1-04                                           | Delete because a library does it: byte mode, versions 1-5, one mask, Reed-Solomon and BCH by hand                                                                                               |           8 | `qr-matrix.test.ts` (479, its own decoder)                                 | The printed image changes pattern — product question 1                                    |
| `operate/recruitment/board-columns.ts`                                                            |       268 | W1's column table and cell value reader                                      | Rewrite as one table whose rows carry their own accessor: 16 columns × 7-line literals plus a 48-line `switch` restating the same key→field map                                                 |          95 | `recruitment-board-view.test.tsx`, `board-data.test.ts`                    | A lost width or flag; the view test reads labels and sorts by key                         |
| `recruitment-board-view.tsx`                                                                      |       548 | The board: table, cards, filters, URL sync                                   | Rewrite: the two-row sticky head (`:330-504`) is `roster-board-header.tsx` again; six `PinnedSelect` blocks are one table                                                                       |         352 | `recruitment-board-view.test.tsx` (238), `board-screens.test.tsx`          | Sticky offsets and band runs; the view test asserts header text and sort clicks           |
| `recruitment-board-cells.tsx`                                                                     |       174 | One table cell; the phone card                                               | Rewrite `RecruitCard` as the new shared `BoardPhoneCard` (roster's `roster-board-card.tsx` is the same component)                                                                               |         148 | `board-screens.test.tsx` "the phone card"                                  | Tap-target independence of the call button; pinned by three cases                         |
| `status-cell.tsx`                                                                                 |       184 | The click-to-edit status pill, void and flip dialogs                         | Rewrite the two dialogs onto a new shared `ConfirmDialog`; `STATUS_ORDER` comes from the vocabulary                                                                                             |         150 | `board-actions.test.ts`, `record-view.test.tsx`                            | Void's reason gate and the flip copy; both asserted                                       |
| `board-data.ts`                                                                                   |       113 | Pure search/filter/sort                                                      | Fold onto a new shared board engine; `roster/board-data.ts` (241) is the same machinery                                                                                                         |         105 | `board-data.test.ts` (154)                                                 | Nulls-last in both directions; pinned                                                     |
| `board-actions.ts`, `action-state.ts`, `qr/actions.ts`, `[prospectId]/actions.ts`                 |       134 | Four server actions and a 3-line state type                                  | Fold `refresh`/`stateFor`/`OK`, written three times, into one action helper                                                                                                                     |         104 | `board-actions.test.ts`, `[prospectId]/actions.test.ts`                    | `not_permitted` must keep rethrowing; both tests assert it                                |
| `operate/recruitment/page.tsx`, `[prospectId]/page.tsx`                                           |        91 | Gate, read, refuse in words                                                  | Fold the gate + `try`/`isServiceError` + `UnavailableScreen` block (24 pages repeat it)                                                                                                         |          71 | `board-screens.test.tsx`, `[prospectId]/screens.test.tsx`                  | Capability refusal before any read; both screen tests pin it                              |
| `[prospectId]/record-view.tsx`                                                                    |       357 | W2's record                                                                  | Rewrite: two send blocks, two hand-built read-only tables, a 22-line `StatusRow` wrapper over 6 lines, three ternary ladders over two facts                                                     |         256 | `record-view.test.tsx` (458)                                               | DOM-shape tests assert "direct siblings of one full-width container"; repoint             |
| `[prospectId]/send-questionnaire-button.tsx`                                                      |       141 | W2's SEND/RESEND with its refusal dialog                                     | Rewrite as a new shared `SendAskButton`; `roster/[membershipId]/send-onboarding-questionnaire-button.tsx` (142) is the same component                                                           |         125 | `record-view.test.tsx` "the SEND button"                                   | Never natively disabled except on decline; five cases pin it                              |
| `[prospectId]/notes-card.tsx`, `queued-send-time.tsx`                                             |       101 | W2's notes; the caption that becomes due                                     | Keep — each is one job                                                                                                                                                                          |          96 | `record-view.test.tsx` V-6 and LAN-248 blocks                              | —                                                                                         |
| `new/add-recruit-form.tsx`                                                                        |       484 | W6's form with W8's check inside it                                          | Rewrite: seven identical validate-and-message ladders, a local `CandidateRow` the kit already has, and the identity switch written twice                                                        |         330 | `add-recruit-form.test.tsx` (150), `new/actions.test.ts` (377)             | Inline errors gate the submit buttons; pinned by the form test                            |
| `new/actions.ts`, `new/page.tsx`                                                                  |       265 | One action, four intents; the page that gates it                             | Rewrite: the `link` and `create` bodies are the same 45 lines with a different `decision`, and each retypes `academic` field by field                                                           |         186 | `new/actions.test.ts` (377)                                                | The already-a-member branch must still return its own screen; pinned                      |
| `new/create-state.ts`                                                                             |        96 | The form's state and `FormData` reader                                       | Rewrite from one field-key list: the 18 names are typed three times                                                                                                                             |          55 | `new/actions.test.ts`                                                      | A dropped field reads as blank; the action test submits the full set                      |
| `qr/page.tsx`, `qr/qr-code-view.tsx`                                                              |       171 | W1-04's code, QR, card, counter                                              | Keep — close to its smallest shape already                                                                                                                                                      |         167 | none — no test renders this view                                           | Unpinned; the change here is only the `qrSvg` call of G08-01                              |
| `a/[token]/page.tsx`, `actions.ts`, `auto-submit.tsx`, `params.ts`                                |       240 | The answer link: resolve, throttle, write                                    | Keep; `firstValue` is the same helper as `recruitment/page.tsx`'s `first`                                                                                                                       |         232 | `a/[token]/actions.test.ts` (285), `auto-submit.test.tsx` (330)            | Uniform terminal timing and the cookie gate; both heavily pinned                          |
| `a/[token]/confirm-panel.tsx`                                                                     |       224 | The player confirm screen and the recruit's                                  | Rewrite the shared head (overline, title, event line, busy notice) once                                                                                                                         |         205 | `a/[token]/screens.test.tsx` (412)                                         | The recruit branch's negative assertions; eight cases pin them                            |
| `a/[token]/question-field.tsx`                                                                    |        68 | One question's control                                                       | Rewrite as one return with a computed control, not three branches repeating the hidden kind field                                                                                               |          44 | `screens.test.tsx` OWNER-LAN172-18                                         | `required` must stay off on this route; pinned                                            |
| `a/[token]/not-found.tsx`, `terminal-panels.tsx`, `presentation.ts`                               |       134 | The unusable link, three terminal panels, every word                         | Rewrite the panels as one `TerminalPanel`; share the unusable-link screen with `rsvp/[token]/not-found.tsx`                                                                                     |         107 | `screens.test.tsx` (the recruit saved page only)                           | Two of the three panels have no test; see G08-10                                          |
| `a/[token]/interest-questionnaire.tsx`, `interest-actions.ts`                                     |       242 | W4's Questionnaire B screen and write                                        | Rewrite: two summary screens differing by a title and a button variant; `questionsFor` is four literals of one shape                                                                            |         194 | `actions.test.ts` covers the write; no test renders the screen             | Unpinned rendering; the three states are visual-review evidence                           |
| `join/[code]/signup-form.tsx`                                                                     |       333 | The sign-up form, both doors                                                 | Rewrite the five validation ladders onto the shared `fieldError`; the ten field blocks onto one field table                                                                                     |         272 | `join/[code]/actions.test.ts`, `me/join/[token]/actions.test.ts`           | The disabled sentence (rule 4) is computed from the same booleans; keep its four wordings |
| `join/[code]/page.tsx`, `actions.ts`, `not-found.tsx`, `opengraph-image.tsx`, `twitter-image.tsx` |       173 | The QR door, its two actions, its preview card                               | Keep; `toSubmission` (`actions.ts:27`) maps ten same-named fields by hand                                                                                                                       |         163 | `join/[code]/actions.test.ts` (247), `tests/link-preview-metadata.test.ts` | The card must name no code or season; pinned in `tests/token-link-preview-safety.test.ts` |

### Proposals

#### G08-01 — One QR encoder from a library, not 250 hand-written lines (saves ~242)

- Now: `src/lib/qr/qr-matrix.ts` implements GF(256) tables (`:9-26`), Reed-Solomon
  generator and encode (`:39-59`), a version table (`:70-76`), a bit writer
  (`:101-130`), BCH format information (`:144-160`), finder/alignment/timing
  drawing (`:168-192`), the reserved mask (`:195-223`) and the zig-zag data walk
  (`:243-268`) — to draw one URL on one operator screen. Its own header admits
  "no production scan has run against this module's real output".
- Smallest honest shape: `import QRCode from "qrcode"` and
  `export const qrSvg = (text: string) => QRCode.toString(text, { type: "svg", margin: 4, errorCorrectionLevel: "L" })`.
  `qr-code-view.tsx:40` already wants exactly a string of SVG. `buildQrMatrix`
  and `QrCapacityExceeded` lose their only callers.
- Behaviour held by: `src/lib/qr/qr-matrix.test.ts` round-trips every byte length
  through its own decoder. Repointed, it decodes the library's SVG instead — the
  assertion ("what a scanner reads back is the URL") is unchanged and is the only
  assertion that matters.
- Lines: 250 → 8, because the module becomes one call plus its signature.
- Risk: the image is a different pattern (the library picks version, mask and
  interleaving itself), so the poster and the operator screen change appearance
  while scanning to the same `/join/<code>`. No test asserts the pixels; only
  Brian's eye does. Product question 1.
- Repointed tests: `qr-matrix.test.ts` — its decoder stays, its input becomes the
  library's output, and the capacity-exceeded case becomes the library's own
  refusal.
- New dependency: `qrcode` (MIT, no runtime deps, ~40 kB, server-side only here).

#### G08-02 — `/operate/recruitment/new` stops writing its payload twice (saves ~154 in the form, ~79 in the action)

- Now: `new/add-recruit-form.tsx:64-116` is seven copies of
  `const v = x.trim() === "" ? null : validate(x); const err = v && !v.valid ? v.message : null;`.
  `:454-533` defines a local `CandidateRow` over `RowCard` while
  `src/components/candidate-row.tsx` is the kit member for exactly this, and the
  three-way identity switch is written once as a label (`:454`) and again as a
  chip (`:492-513`). In `new/actions.ts` the `link` (`:75-106`) and `create`
  (`:149-182`) branches are the same transaction with a different `decision`, and
  each retypes the 13-field `academic` object whose keys are already the names
  `AddRecruitFormValues` uses — `academic: values` is the whole of it.
- Smallest honest shape: one `fieldError(value, validate)` in a shared
  `src/lib/forms/field-error.ts`; the kit's `CandidateRow` gains
  `action.submit?: { name: string; value: string }` so a form-submit candidate
  row needs no local copy; one `identityOf(candidate) => { label, chip }`; and in
  the action one
  `async function addRecruit(decision: PersonDecision) { … finishRecruitmentAddIn(tx, { …, academic: values }) }`
  that both intents call.
- Behaviour held by: `new/actions.test.ts` (377 lines — all four intents, the
  exact-match reason, the already-a-member screen, field-error routing) and
  `add-recruit-form.test.tsx` (inline validation gating the two submit buttons).
- Lines: 484 → 330 and 251 → 172, because the ladders collapse to one line each,
  the candidate row to a kit call, and two 45-line transaction bodies to one.
- Risk: `academic: values` passes five extra properties `RecruitmentAddAcademic`
  does not declare — harmless at runtime, and TypeScript allows it for a
  variable. The kit `CandidateRow` renders `matched` as one joined caption where
  the local copy renders one `Typography` per field; `add-recruit-form.test.tsx`
  reads `candidate-matched`, so repoint that assertion.
- Repointed tests: `add-recruit-form.test.tsx` — the matched-field assertion
  follows the kit member's single caption.
- New dependency: none.

#### G08-03 — One banded board head, not two (saves ~196)

- Now: `recruitment-board-view.tsx:330-504` writes a two-row sticky head —
  the band overline run, the sortable column row, the filter funnel, the
  "edit on the record" caption. `src/app/operate/roster/roster-board-header.tsx`
  is the same 193 lines, which the roster board already imports. The
  recruitment board also writes six `PinnedSelect` blocks (`:162-208`) that
  differ only in label, key and option labels, and repeats its two header
  buttons in the empty state (`:265-280`, `:298-303`).
- Smallest honest shape: promote roster's component to
  `src/app/operate/board-table-head.tsx` with three props it does not have yet —
  `firstColumn: { label: string; width: number }`, `bandColour(band) => { header, body }`
  and `bandLabel(band) => string` (the recruitment board resolves an event's name
  there) — then
  `<BoardTableHead columns={columns} firstColumn={{ label: "Recruit", width: RECRUIT_COLUMN_WIDTH }} bandColour={bandColour} bandLabel={labelOfBand} … />`.
  The filters become `FILTERS.map((f) => <PinnedSelect key={f.key} {...f} value={filters[f.key] ?? ""} onChange={…} />)`
  over a six-row table.
- Behaviour held by: `recruitment-board-view.test.tsx` (header labels, per-event
  RSVP/Attendance sort clicks, capitalised cells), `board-screens.test.tsx`
  (authority), `src/app/operate/roster/*` tests on the other side.
- Lines: 548 → 352, because 160 lines of head become a 12-line call and 60 lines
  of filter blocks become 20.
- Risk: the two heads differ in one detail — roster paints `band.solid`,
  recruitment paints `background.paper` plus a tint gradient so row text cannot
  bleed through (`:426-437`). Passing the colours in as a prop keeps each board's
  own paint, so neither changes. A sticky-offset regression is visible in the
  board screenshot pair, not in a test.
- Repointed tests: none — both boards keep their own `data-testid`s.
- New dependency: none. Costs roster's file ~10 lines of generalisation.

#### G08-04 — One fill-if-blank, one validation table, across both recruit doors (saves ~90 in signup, ~93 in add)

- Now: `recruitment-signup.ts:68-147` throws through eight hand-written blocks,
  each repeating trim → validate → `ConstraintViolated`. `:179-218` defines
  `fillPersonTextFieldIfBlankIn` and `fillPersonYearFieldIfBlankIn` plus two
  `*_FIELD_COLUMNS` constants that wrap one string literal each.
  `recruitment-add.ts:74-102` defines those same two helpers again;
  `:150-176` re-implements `recordKnownAsIn`; `:197-214` inlines the college and
  matriculation fills a third time; `:230-254` re-implements `ensureProspectIn`.
- Smallest honest shape: in `recruitment-signup.ts`, one rule table —

  ```ts
  const RULES = [
    {
      field: "givenName",
      required: "A first name is required.",
      rule: SIGNUP_REQUIRES_FIRST_NAME_RULE,
    },
    {
      field: "mobile",
      required: "A mobile number is required — …",
      rule: SIGNUP_REQUIRES_MOBILE_RULE,
      check: validatePhoneNumber,
      invalid: SIGNUP_INVALID_MOBILE_RULE,
    },
    // … one row per field, in today's order
  ] as const;
  ```

  walked in order; and one exported
  `fillIfBlankIn(tx, personId, column, value, { as?: "int" | "date" })`. Export
  `ensureProspectIn` and `recordKnownAsIn` and let `recruitment-add.ts` import
  all four instead of owning copies.

- Behaviour held by: `recruitment-signup.test.ts` (749) asserts each refusal's
  `rule` and message and the fill-only-when-blank rule; `recruitment-add.test.ts`
  (475) asserts the operator door's own fills, the note, and the consent grant.
- Lines: 412 → 322 and 258 → 165, because eight throw-blocks become a table walk
  and five private helpers become imports.
- Risk: the refusal **order** is observable (a form missing two things names one),
  so the table must keep today's sequence: given, family, mobile required, mobile
  format, college email required, college email format, personal email,
  matriculation, graduation, consent. The alias behaviour genuinely differs
  between the doors — product question 5; until it is answered the shared helper
  takes `{ promoteExisting: boolean }` and each door keeps what it does today.
- Repointed tests: none.
- New dependency: none.

#### G08-05 — The column table carries its own accessor (saves ~173)

- Now: `board-columns.ts:58-215` is 16 column literals of seven lines each, and
  `:255-303` is a 48-line `switch` mapping the same 16 keys back to row fields.
  `eventColumns` (`:229-253`) writes two more literals longhand. Three places
  must agree for one column to work.
- Smallest honest shape: one row type with a `value` function and one builder:

  ```ts
  const col = (
    key: string,
    label: string,
    band: Band,
    width: number,
    value: (r: Row) => Cell,
    o: Partial<ColumnDef> = {},
  ): ColumnDef => ({
    key,
    label,
    band,
    width,
    edit: "none",
    sortable: true,
    filterable: false,
    value,
    ...o,
  });

  export const RECRUITMENT_COLUMNS = Object.freeze([
    col("college", "College", "person", 132, (r) => r.college, { edit: "record" }),
    col("status", "Status", "recruitment", 128, (r) => r.status, {
      edit: "status",
      filterable: true,
    }),
    // … one line per column
  ]);
  export const rawValue = (row: Row, key: string) => columnFor(key)?.value(row) ?? null;
  ```

  `rawValue`'s event branch becomes the two lines `eventColumns` already builds.

- Behaviour held by: `board-data.test.ts` sorts and filters by key; the view test
  reads every header label; `recruitment-board-cells.tsx` reads `rawValue`.
- Lines: 268 → 95, because 16 seven-line literals plus a 48-line switch become 16
  one-line calls plus a 6-line builder.
- Risk: a mistyped accessor shows the wrong column. Every column is read by the
  board test's label sweep and `board-data.test.ts`'s sort cases; a swapped pair
  of string columns is the one mistake neither catches, and the board screenshot
  does.
- Repointed tests: none.
- New dependency: none.

#### G08-06 — W2's record stops saying the same thing four ways (saves ~101)

- Now: `record-view.tsx:180-204` and `:244-268` are the same send block twice
  (button, caption, three-way Sent/Queued/Not sent ladder); `:129-161` runs that
  ladder twice more as metrics; `:68-89` is three nested ternary ladders over the
  same two facts (`blockedByStatus`, `consent`); `:274-351` builds two read-only
  tables by hand, each with its own `NOT_RECORDED` empty branch; `:361-382` is a
  22-line `StatusRow` component wrapping a 6-line body used once.
- Smallest honest shape: `sendState(track) => "Sent" | "Queued" | "Not sent"`
  used by both metric and caption; one local
  `<SendBlock track="personal" state={record.personal} … />`; one local
  `<RecordTable columns={["Event","Date","RSVP","Attendance","Event status"]} rows={…} />`
  taking `readonly (readonly ReactNode[])[]`; `StatusRow` inlined into the
  Recruitment section; and one
  `const messaging = blockedByStatus ? DECLINED : CONSENT_BLOCK[record.consent] ?? NONE`
  table carrying `{ banner, personal, recruitment }` so the three sentences stay
  exactly as written.
- Behaviour held by: `record-view.test.tsx` (458) — the banner's five cases, the
  SEND button's seven, the V-6 caption's four, the LAN-248 date spellings, and
  two structural assertions that the bands are "direct siblings of one
  full-width container".
- Lines: 357 → 256, because two send blocks become one component used twice and
  two tables become one used twice.
- Risk: the two structural tests read `children` of the band containers, so any
  wrapper added around a `Section` breaks them — keep the `Stack` children flat.
  The sentences are the load-bearing part; the table must hold all six verbatim.
- Repointed tests: none if the DOM nesting is preserved; otherwise the two
  `recruitment-record-{top,lower}-bands` assertions.
- New dependency: none.

#### G08-07 — One prospect module, one transaction wrapper (saves ~81)

- Now `src/lib/services/recruitment-prospect/` is a six-file quartet plus an
  `index.ts` (15 lines of re-export) and a `shared.ts` (8 lines holding one
  frozen constant). Each of the five real files repeats the same
  `import "server-only"` / `@/lib/db` / `../audit` preamble, and each ends with a
  three-to-six-line wrapper that exists only to call `withTransaction` around its
  `…In` twin (`read.ts:328`, `notes.ts:32`, `status.ts:105`, `flip.ts:135`,
  `send.ts:117`, and `recruitment-signup-codes.ts:72` whose wrapper no route
  calls at all). `read.ts:91-157` runs two queries over one key list to learn
  "last accepted" and "soonest queued" per track.
- Smallest honest shape: one `recruitment-prospect.ts`; one
  `src/lib/services/tx.ts` with
  `export const inTx = <A extends unknown[], R>(f: (tx: Tx, ...a: A) => Promise<R>) => (...a: A) => withTransaction((t) => f(t, ...a));`
  so each wrapper is `export const readRecruitmentProspect = inTx(readRecruitmentProspectIn);`;
  and one send-state query that left-joins accepted attempts instead of two
  queries and two `Map` walks.
- Behaviour held by: `recruitment-prospect.test.ts` (953) imports every export by
  name and pins the send-state semantics (last sent wins; a queued job with an
  accepted attempt is not queued).
- Lines: 686 → 605.
- Risk: `index.ts` is the import surface for four routes; a single module must
  export the same names. The send-state query is the real risk — the
  "accepted attempt exists" exclusion is what keeps a sent ask from reading as
  queued, and `record-view.test.tsx`'s V-6 block is what proves it.
- Repointed tests: `recruitment-signup-codes.test.ts` loses the wrapper it calls.
- New dependency: none.

#### G08-08 — Questionnaire B's screens and questions stop being written out longhand (saves ~45 in the screen, ~28 in the service)

- Now: `interest-questionnaire.tsx:96-133` is two summary screens identical but
  for a title, a sentence and a button variant; `:38-85` builds four
  `EventQuestionForAnswer` literals whose only real content is an id, a prompt, a
  type and which answer field to read. `recruitment-questionnaire.ts:78-113` is
  six `if` blocks each calling `supersedeAndInsertIn` with one column set.
- Smallest honest shape: one
  `<SummaryScreen title sentence variant token displayName />` called twice; one
  `const QUESTIONS = [{ id: "B1", prompt: "…", type: "boolean", read: (a) => a.playedBefore }, …]`
  mapped into the shape `QuestionField` wants; and in the service one
  `const WRITES = [{ code: B_CODE.playedBefore, value: (s) => yesNoBool(s.playedBefore) }, …]`
  walked with `if (value !== undefined) await supersedeAndInsertIn(…)`.
- Behaviour held by: `recruitment-questionnaire.test.ts` (196) pins "a blank field
  never supersedes a real answer", the 500-character clamp on B6, and
  `identified → engaged` on any answer. **No test renders
  `interest-questionnaire.tsx` at all** — the three states (form, received,
  already) are held only by Brian's walkthrough.
- Lines: 194 → 150 and 98 → 70.
- Risk: the unpinned screen is the risk. The fold is mechanical, and the two
  summary screens differ visibly only in the button variant — which must stay
  `text` on "Answers received" and `contained` on "Already completed", as today.
- Repointed tests: none. A screen test for the three states would be new coverage,
  which this ticket does not fund.
- New dependency: none.

#### G08-09 — The public form stops repeating itself (saves ~61)

- Now: `join/[code]/signup-form.tsx:116-152` is five more copies of the
  validate-and-message ladder G08-02 removes; `:303-352` is ten `<Field>` blocks
  each repeating `error={Boolean(x)} helperText={x ?? "…"} {...field("k")}`;
  `join/[code]/actions.ts:27-41` maps ten same-named fields with `|| null`.
- Smallest honest shape: the shared `fieldError` from G08-02; one
  `FIELDS: readonly { key, label, required?, helper?, control?, validate? }[]`
  mapped into `<Field>`/`<PhoneField>`; and
  `const toSubmission = (v) => ({ ...blankToNull(v), consent: v.consent })`.
- Behaviour held by: `join/[code]/actions.test.ts` (247) and
  `me/join/[token]/actions.test.ts` for the second door; `tests/schema-recruitment.test.ts`
  for what lands in the database.
- Lines: 333 → 272 and 62 → 52.
- Risk: the disabled sentence has four wordings keyed on
  (`formatInvalid`, `requiredMissing`, `consent`) — standards rule 4 — and no
  test reads them. They must be carried over verbatim; the field table must keep
  each field's own helper text, which is the only per-field prose.
- Repointed tests: none.
- New dependency: none.

#### G08-10 — One unusable-link screen and one terminal panel (saves ~27)

- Now `a/[token]/not-found.tsx` (24) is `rsvp/[token]/not-found.tsx` minus a
  contact button, and `TERMINAL_HEADING`, `TERMINAL_BODY`,
  `TERMINAL_PRIVACY_NOTE` and `CLOSE` are declared in both routes'
  `presentation.ts`. `terminal-panels.tsx` (53) is three panels of
  `Shell` + `PageHeader` + one or two `Typography`.
- Smallest honest shape: `src/components/unusable-link-screen.tsx` taking
  `{ contactEmail?: string | null }` and owning the four words; one local
  `<TerminalPanel title lines={[…]} />` used three times.
- Behaviour held by: `a/[token]/screens.test.tsx` pins only the recruit saved
  page. `AlreadyRecorded` and `Cancelled` have no test.
- Lines: 134 → 107.
- Risk: LAN-79's owner decision is that unknown, expired, revoked and started
  render _indistinguishably_. One component with a per-route constant still
  satisfies that — nothing varies within a route — but the prop must never be
  reachable from a request.
- Repointed tests: none.
- New dependency: none.

#### G08-11 — One phone card for both boards (saves ~26 here, ~70 in the roster section)

- Now `recruitment-board-cells.tsx:127-195` and
  `operate/roster/roster-board-card.tsx` are the same card: a `Card` with a block
  anchor, a title, a status pill row, a secondary line, and an absolutely
  positioned round call button that is a sibling of that anchor, not nested in it.
- Smallest honest shape: `src/components/board-phone-card.tsx` taking
  `{ href, title, chips, subline, phoneForCall, testId, openTestId }`.
- Behaviour held by: `board-screens.test.tsx` "the phone card" — four cases,
  including that the call button is disabled rather than hidden with no number.
- Lines: 174 → 93 at the call site plus 55 for the shared card counted here.
- Risk: the two tap targets must stay independent (two anchors cannot nest); the
  four pinned cases are exactly that rule.
- Repointed tests: none if `data-testid` stays a prop.
- New dependency: none.

#### G08-12 — One gate-and-refuse for a page, one outcome for an action (saves ~20 here, and the same again on 22 other pages)

- Now `operate/recruitment/page.tsx:12-32` and `[prospectId]/page.tsx:16-45`
  each write gate → `try` → `isServiceError` → `UnavailableScreen`; 24 pages
  under `src/app/operate` do. `board-actions.ts:16-27`,
  `[prospectId]/actions.ts:13-22` and `qr/actions.ts:18-22` each write their own
  `refresh` and `stateFor`, and `action-state.ts` is a three-line file holding
  `{ error: string | null }`.
- Smallest honest shape: `gatedRead(route, capability, title, testId, read)`
  returning either a screen or the data, beside `operate/gate.ts`; and one
  `src/lib/actions/outcome.ts` with `refusalState(error)` and the `{ error }`
  type.
- Behaviour held by: `board-screens.test.tsx` and `[prospectId]/screens.test.tsx`
  (capability refusal before any read); `board-actions.test.ts` and
  `[prospectId]/actions.test.ts` (a service refusal returns a message, a
  permission refusal throws).
- Lines: 91 → 71 and 134 → 104.
- Risk: the helper must keep re-raising non-service errors and `not_permitted` —
  the one behaviour three tests assert and the one a generic wrapper swallows.
- Repointed tests: none.
- New dependency: none. The helper's home is another section's file, so its ~25
  lines are counted there.

#### G08-13 — One ask button and one confirm dialog for the whole application (saves ~16 here, ~105 in the roster section)

- Now: `[prospectId]/send-questionnaire-button.tsx` (141) and
  `roster/[membershipId]/send-onboarding-questionnaire-button.tsx` (142) are the
  same component: outcome slot, `useTransition`, a SEND/RESEND label pair, a
  dialog stating the refusal in words rather than disabling the button, and a
  mutually exclusive set of `Notice`s — which mine writes as four stacked
  `slot.showing && …` conditions (`:103-135`) only one of which can ever be true.
  `status-cell.tsx:140-206` writes two confirm dialogs longhand, and three other
  routes write a third (`events/[id]/delete-draft.tsx`,
  `participation/record-answer.tsx`, `events/templates/template-editor.tsx`).
- Smallest honest shape: `src/components/send-ask-button.tsx` —
  `{ label, resendLabel, lastSentAt, canSend, refusalReason, blocked, testIdPrefix, send, describe }`
  — and `src/components/confirm-dialog.tsx` —
  `{ open, title, body, confirmLabel, confirmColor, pending, disabled, onConfirm, onClose, testId }`.
  The four-branch notice stack becomes one `describe(result)` returning
  `{ severity, text, testId }` and a single `<Notice>`.
- Behaviour held by: `record-view.test.tsx` "the SEND button" (never natively
  disabled except on decline; the dialog states the refusal) and its LAN-237
  dispatch-outcome block; `board-actions.test.ts` for the void reason and the flip.
- Lines: 141 → 35 at the call site plus 90 for the shared button counted here,
  and 184 → 115 plus 35 for the shared dialog. The roster side deletes its own
  142 and ~40 of dialog.
- Risk: the `data-testid` pattern (`recruitment-send-<track>-refused|delivery|no-op|ok`)
  is asserted directly, so the prefix must be a prop and the suffixes fixed.
- Repointed tests: none if the test ids are preserved.
- New dependency: none.

#### G08-14 — One board engine for the roster and the recruit board (saves ~8 here, ~140 in the roster section)

- Now: `operate/recruitment/board-data.ts` (113) and
  `operate/roster/board-data.ts` (241) both implement search over name and
  aliases, per-key filter matching, a `comparable` that nulls out, a nulls-last
  sort in both directions, the active-filter list and a `displayOf`. They differ
  in the row type, the value accessor and the option labels — all three of which
  G08-05 makes data.
- Smallest honest shape: `src/app/operate/board-engine.ts` exporting
  `applyBoard<TRow>(rows, { search, filters, sort }, { value, searchText, compare, match })`
  and `displayOf`; each board keeps only its own `filterOptions`,
  `optionListLabel` and ladder order.
- Behaviour held by: `board-data.test.ts` (154) here and the roster's own
  board-data test there — the two sets of cases become the engine's.
- Lines: 113 → 45 of recruitment adapter plus 60 for the engine counted here.
- Risk: the two boards sort differently today — the roster uses
  `localeCompare(…, "en-GB", { numeric: true })` and coerces numeric strings
  (`roster/board-data.ts:100-107`), recruitment does neither
  (`board-data.ts:50-56`), so the engine must take the comparator as a parameter
  or one board's order changes visibly.
- Repointed tests: both board-data tests import from the new module.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  `new/add-recruit-form.tsx:468` → `components/candidate-row.tsx`'s
  `CandidateRow`; `board-data.ts:15`'s `NOT_RECORDED` → `components/fact.tsx`'s
  `NOT_RECORDED` (**different string** — product question 4, not a free swap);
  `recruitment-board-view.tsx:284-305`'s centred empty panel →
  `components/empty-state.tsx` (blocked by product question 2).
- Pieces two or more routes write that should become one component:
  `recruitment-board-view.tsx:330-504` + `roster/roster-board-header.tsx` → `src/app/operate/board-table-head.tsx`;
  `recruitment-board-cells.tsx:127` + `roster/roster-board-card.tsx` → `src/components/board-phone-card.tsx`;
  `[prospectId]/send-questionnaire-button.tsx` + `roster/[membershipId]/send-onboarding-questionnaire-button.tsx`
  → `src/components/send-ask-button.tsx`;
  `status-cell.tsx:140` and `:176` + three other routes' dialogs → `src/components/confirm-dialog.tsx`;
  `board-data.ts` + `roster/board-data.ts` → `src/app/operate/board-engine.ts`;
  `a/[token]/not-found.tsx` + `rsvp/[token]/not-found.tsx` → `src/components/unusable-link-screen.tsx`;
  the validate-and-message ladder in `add-recruit-form.tsx:64-116` and
  `signup-form.tsx:116-152` → `src/lib/forms/field-error.ts`;
  the `…In` wrappers across six service files → `src/lib/services/tx.ts`;
  `operate/recruitment/page.tsx` and 23 other gate-and-refuse pages → a helper
  beside `src/app/operate/gate.ts`.
- Kit members this section needs changed to absorb a local copy:
  `CandidateRow` needs `action.submit?: { name, value }`, because W8's "This is
  them" is a form submit carrying the person id, not an `onClick`;
  `EmptyState` would need a centred variant, or the board adopts its alignment —
  product question 2.

### Product questions

1. **The QR image changes pattern.** Replacing the hand-written encoder
   (`src/lib/qr/qr-matrix.ts`, 250 lines) with a library saves more than any other
   single proposal here and still scans to the same `/join/<code>`, but the drawn
   pattern differs (the library picks version, mask and interleaving), so a poster
   printed from `/operate/recruitment/qr` looks different from last week's. No
   test asserts the image. A rewrite cannot decide whether "the same thing for the
   same data" includes the bitmap.
2. **Two empty-list treatments.** `recruitment-board-view.tsx:284-305` renders a
   centred `Paper` with an `h6` and two buttons; the kit's `EmptyState` is
   left-aligned with an `h3` and is what standards rule 5 points at. One of them
   is the club's empty list. Adopting the kit member changes this screen's
   appearance; keeping the local panel keeps a second treatment.
3. **"No recruits match the current search and filters."** Rendered twice
   (`recruitment-board-view.tsx:515` desktop, `:564` phone) with no clear-filters
   link, while standards rule 5 says an empty result names what was searched for
   and offers the way forward. Fixing it is a UX change; leaving it keeps the
   rule broken on this surface.
4. **Two spellings of one absence.** The boards print `"Not recorded"`
   (`board-data.ts:15`, `roster/board-data.ts:14`); the kit's `Fact` prints
   `"not recorded"` (`components/fact.tsx:12`). Both appear on the recruit
   journey — the board and then the record. Standards rule 7 wants one.
5. **"Known as", two doors, two behaviours.** When the alias already exists on
   the person, the sign-up door promotes it to the display name and demotes the
   others (`recruitment-signup.ts:260-270`); the operator add door returns early
   and leaves the display name alone (`recruitment-add.ts:160-164`). One fact,
   two writes. A shared helper has to be told which is right.
6. **"Edit on the record" points at a record that cannot edit.** The board's
   Person columns carry the caption `edit on the record`
   (`recruitment-board-view.tsx:493`) and link to
   `/operate/recruitment/<prospectId>`
   (`recruitment-board-cells.tsx:101`), where every Person field is rendered
   `readOnly` (`record-view.tsx:166-179`). Either the link should go to
   `/operate/people/<personId>`, or the caption should say where the edit lives.
7. **One questionnaire, three names.** The board column says "Recruitment sent",
   the record says "Recruitment questionnaire", the public page is headed
   "Football background", and the code calls it Questionnaire B. A rewrite cannot
   pick the club's word.

### Not proposed

- `recruitment-prospect/status.ts` (101) and `flip.ts` (112) — each is one
  transaction of rules with no repetition; the only change they take is the
  `inTx` wrapper.
- `recruitment-cycle.ts` (190) — `declareRecruitmentCycleJobsIn` reads densely
  because the eligibility, consent and completion rules genuinely differ per
  step; `STEP_COLUMNS`/`toStep` are one row mapper, not a layer.
- `recruitment-candidate-identity.ts` (62) — three reads with a documented
  precedence; one union query would be ~15 lines shorter and much harder to read.
- `recruitment-interest-tokens.ts` (79), `recruitment-config.ts` (7),
  `join/[code]/page.tsx` (47), `join/[code]/opengraph-image.tsx` (50),
  `[prospectId]/queued-send-time.tsx` (26), `a/[token]/params.ts` (2) — at their
  smallest already.
- `a/[token]/auto-submit.tsx` (39) and `a/[token]/actions.ts` (66) — every line is
  an owner correction with a test; leave them alone.
- `qr/qr-code-view.tsx` (142) — no test renders it, and it is already one screen
  with two controls.
- `a/[token]/presentation.ts` (57) — a word table; folding constants into their
  call sites saves nothing, because the words still occupy the lines. Only the
  four terminal words duplicated with `rsvp/[token]/presentation.ts` move
  (G08-10).
- Carve-outs read for context and proposed in nowhere: `@/lib/db`
  (`withTransaction`, the `ServiceError` kinds), `@/lib/rsvp/public-surface` (the
  throttle and uniform timing `a/[token]` depends on),
  `@/lib/services/rsvp-tokens` (`mintToken`, `hashToken`, `TOKEN_PATTERN`),
  `player-answer-tokens`, `messaging-scheduler` (`dispatchRecruitmentCycleJob`),
  `@/lib/delivery`.

---

## G09 — the player's own pages: home, details, join, stop, RSVP, player services

Lines now: 4933. Lines after everything proposed: 3783. Saved: 1150 (23%).

### Files read

All 48 files in the brief. Carve-outs read for context only:
`src/lib/rsvp/public-surface.ts`, `src/lib/services/player-answer-tokens.ts`,
`src/lib/services/rsvp-tokens.ts`, `src/lib/db`. Tests read:
`src/app/me/[token]/{actions,screens}.test.*`,
`src/app/me/[token]/details/{actions,screens,details-form}.test.*`,
`src/app/me/{join,stop}/[token]/actions.test.ts`,
`src/app/rsvp/[token]/{actions,screens}.test.*`,
`src/lib/services/{player-home,rsvp,messaging-consent,player-questionnaire}.test.ts`,
`tests/anonymous-token-route-coverage.test.ts`.

### Modules

| Module or surface                                                                                                                                                    | Lines now | What it does                                                                                             | Proposed shape                                                                                                                                                                                                                                                                                                                                                                                                                                       |        Lines after | Tests that prove it                                                                                                          | Risk, and how it is caught                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------: | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/me` entry (`layout.tsx` 6, `page.tsx` 34, `presentation.ts` 5, `actions.ts` 20)                                                                                    |        65 | Session-gated button that mints a durable token and redirects                                            | keep; fold the 3-constant `presentation.ts` into `page.tsx` — one page reads it, nothing else ever will                                                                                                                                                                                                                                                                                                                                              |                 58 | none colocated; `tests/operate-route-protection.test.ts` pins the redirect                                                   | none beyond an import; typecheck catches it                                                                                                                                                            |
| Player home route (`page.tsx` 195, `presentation.ts` 74, `actions.ts` 109, `summary-row.tsx` 74, `row-actions.tsx` 117, `focused-panel.tsx` 170, `not-found.tsx` 16) |       755 | The durable page: five invitation sections, one focused answer panel, three writes                       | rewrite as G09-03 (one token-form control, status lookups), G09-02 (token-write helper), G09-07 (token GET helper), plus the five section blocks from one table                                                                                                                                                                                                                                                                                      |                508 | `me/[token]/screens.test.tsx` (27 cases, OWNER-LAN172-02…20), `me/[token]/actions.test.ts` (16 cases)                        | section order, chip words and panel collapse are all asserted by `screens.test.tsx`; a wrong lookup row fails there                                                                                    |
| Details questionnaire (11 files)                                                                                                                                     |      1434 | The five-step onboarding questionnaire and its two terminal landings                                     | rewrite as G09-01 (one field table), G09-02, G09-07; `trust-steps.tsx` rewritten as one parameterised trust step; `step-shell.tsx`'s `BucsHudlShell` wraps `Shell` instead of repeating its first four elements (`step-shell.tsx:128-138` vs `:162-169`)                                                                                                                                                                                             |                992 | `details/screens.test.tsx` (24 cases), `details/actions.test.ts` (22), `details-form.test.tsx` (9)                           | every label, every status word and the consent-tick-first order are asserted; LAN-289's "navigator and chip agree" cases pin the status lookup                                                         |
| Join door (`page.tsx` 69, `actions.ts` 43, `not-found.tsx` 13)                                                                                                       |       125 | Tokenised prefilled sign-up; renders another route's `SignupForm`                                        | keep the shape; `toSubmission` (`join/[token]/actions.ts:8-22`) is 15 lines of `values.x \|\| null` over one object — one mapper; the prefill copy (`page.tsx:66-79`) is 14 lines of the same, two nullability conversions                                                                                                                                                                                                                           |                 95 | `join/[token]/actions.test.ts` (3 cases, incl. no-duplicate-person)                                                          | a dropped field would arrive as `null`; the test asserts the written row field by field                                                                                                                |
| Stop door (`page.tsx` 33, `actions.ts` 28, `stop-flow.tsx` 83, `not-found.tsx` 13)                                                                                   |       157 | Two-tap opt-out, one write                                                                               | keep; `stop-flow.tsx`'s three branches each re-wrap `Surface`/`Stack`/`PageHeader`/`Typography` (`:41-50`, `:54-77`, `:80-93`) — one local `StopPanel`                                                                                                                                                                                                                                                                                               |                130 | `stop/[token]/actions.test.ts` (3 cases, incl. the gate refusing afterwards)                                                 | the three screens are not screenshot-tested; a wrapper change is visible in the 375px pair                                                                                                             |
| RSVP answer route (9 files)                                                                                                                                          |       584 | The only unauthenticated page: invitation, decline, saved, cancelled, terminal                           | keep the four screens; G09-02, G09-07; `presentation.ts`'s three date formatters are one (below)                                                                                                                                                                                                                                                                                                                                                     |                435 | `rsvp/[token]/screens.test.tsx` (21 cases incl. the uniform terminal response), `actions.test.ts` (5)                        | UX-63/64/65 uniformity is asserted over a `TokenState[]` list; the formatter merge is covered by the date assertions in `screens.test.tsx:149-186`                                                     |
| — sub-row: `rsvp/[token]/presentation.ts` date formatters (counted in the route above)                                                                               |         — | Copy plus `formatEventDate`, `formatEventDateShort`, `formatDeadline`, `formatEventTime`, `eventSummary` | rewrite as one `londonDate(value, {year?, at?})`: `:86-138` are three functions assembling the same weekday + day-month pair from two `Intl.DateTimeFormat` calls, differing only in the year and a trailing time; 103 → 85                                                                                                                                                                                                                          |                  — | `rsvp/[token]/screens.test.tsx:149-186`, `me/[token]/screens.test.tsx` rows; four routes import these                        | a changed separator or a dropped comma shows in those assertions, which quote the rendered string                                                                                                      |
| `presentation.ts` copy blocks (`me` 74, `details` 135, `rsvp` 103)                                                                                                   |         — | Every word three player surfaces say                                                                     | keep — copy, required by standards rule 7 to live in one place per surface. Two reductions only: `details/presentation.ts:28-43`'s five-case `stepLabel` switch is a 6-entry record; `eventTypeLabel` is defined three times (`me/[token]/presentation.ts:17`, `rsvp/[token]/presentation.ts:13`, `a/[token]/presentation.ts:11`) as the same one-line wrapper over `TYPE_LABELS`, with no live caller — only `/design-preview` (product question 2) |                  — | `screens.test.tsx` files import the constants directly                                                                       | none; the constants keep their names                                                                                                                                                                   |
| `src/lib/services/player-home.ts`                                                                                                                                    |       404 | The durable page's read and its two writes                                                               | rewrite as G09-04; plus one `invitationOwnerIn(tx, invitationId)` for the three hand-written "resolve invitation → person" preambles (`:60-70`, `:186-195`, `:442-455`), and the per-row question count (`:371-381`) folded into the main select as a correlated subquery                                                                                                                                                                            |                340 | `player-home.test.ts` (697 lines; ownership refusals, the horizon, the four buckets)                                         | the N+1 fold changes a count's SQL; `player-home.test.ts` asserts `outstandingRequiredQuestions` per bucket. Also removes one query per row at runtime                                                 |
| `src/lib/services/rsvp.ts`                                                                                                                                           |       423 | The player's signed answer and the operator's recorded answer                                            | rewrite as G09-04: `recordOperatorRsvpResponse` (`:393-488`) re-writes `recordAnswerIn`'s insert, status update, `stopChasingIn` and audit by hand, and its own 53-line question-answer loop (`:411-463`)                                                                                                                                                                                                                                            |                340 | `rsvp.test.ts` (1279 lines), `tests/service-layer-audit.test.ts`                                                             | both paths write `rsvp_responses` and one audit row; `rsvp.test.ts` asserts the row and the audit context for each. DEC-no-supersede and the three `responded_at` refusals stay exactly where they are |
| `src/lib/services/messaging-consent.ts`                                                                                                                              |       119 | The season consent gate                                                                                  | keep the six readers; `grantSeasonMessagingConsentIn` (`:114-128`) and `withdrawSeasonMessagingConsentIn` (`:131-145`) are the same 14-line upsert with one different literal — one `setSeasonMessagingConsentIn(tx, personId, seasonId, state)` and two 3-line callers. Drop the three `as unknown as ConsentRow` casts by typing the query once                                                                                                    |                100 | `messaging-consent.test.ts` (326 lines)                                                                                      | a wrong state literal would silently grant; the test asserts the stored state for both paths                                                                                                           |
| `player-questionnaire/read.ts`                                                                                                                                       |       351 | The one whole read the questionnaire needs                                                               | rewrite the gate ladder: `:191-245` is four near-identical `sections.push` blocks and then a six-line `if` ladder over the same four booleans — one `GATES` table gives `outstandingSections`, `nothingOutstanding` and `nextStep`. `:173-189`'s four done-booleans are two 3-line helpers over a code. `:306-324` and `:333-350` end in hand-spelled 4-key and 2-key returns. Absorbs `types.ts` and `emergency-contact.ts`                         |                320 | `player-questionnaire.test.ts` (1094 lines) asserts `nextStep`, `outstandingSections` and `itemStatus` per fixture           | order of the five steps is load-bearing; the test walks the sequence end to end                                                                                                                        |
| `player-questionnaire/step1.ts`                                                                                                                                      |       230 | The step 1 save, field by field, independently gated                                                     | rewrite as G09-05 and G09-01                                                                                                                                                                                                                                                                                                                                                                                                                         |                140 | `player-questionnaire.test.ts` F1 cases ("whatever a step saved stays saved")                                                | F1 is the one behaviour that must not regress: every valid field writes even when another is blank. The test asserts twelve writes alongside one blank                                                 |
| `player-questionnaire/provenance.ts`                                                                                                                                 |       169 | Who last supplied each of the nine disputable fields, and the one write path                             | rewrite as G09-06                                                                                                                                                                                                                                                                                                                                                                                                                                    |                 95 | `details/screens.test.tsx:304-394` (F4, "says 'You'/'The club' for whatever field"), `player-questionnaire.test.ts` outcomes | the four `FieldSaveOutcome` values and the three audit `reason` strings must survive; outcomes are asserted per field                                                                                  |
| `player-questionnaire/later-steps.ts`                                                                                                                                |        89 | Steps 2-5's three writes                                                                                 | keep; the three functions each repeat the same 6-line `recordOnboardingActivityIn` call (`:38-45`, `:73-81`, `:90-98`) — one `logPlayerAnswerIn(tx, params, section, channel?)`                                                                                                                                                                                                                                                                      |                 75 | `details/actions.test.ts` agreeDocument/submitTrustStep cases; `player-questionnaire.test.ts`                                | the `channel` string is read back as the claim proof by `readTrustClaimedIn` (`read.ts:339-343`) — a changed literal silently un-claims BUCS/Hudl. `player-questionnaire.test.ts` catches it           |
| `player-questionnaire/index.ts` 5, `types.ts` 10, `emergency-contact.ts` 13                                                                                          |        28 | A re-export barrel, one type union plus its order array, one interface plus a 3-line predicate           | delete because the barrel only re-exports and the two leaves only hold what `read.ts` already owns; six import sites change to `.../player-questionnaire/read` etc.                                                                                                                                                                                                                                                                                  |                  0 | typecheck; `player-questionnaire.test.ts` imports `STEP_ORDER`                                                               | import-only; `npm run typecheck` is the proof                                                                                                                                                          |
| Dead fields on `QuestionnaireView`                                                                                                                                   |         — | `personId`, `seasonId`, `membershipId`, `consent` (`read.ts:81-87`) have no reader anywhere in `src`     | delete because nothing reads them — `view.*` usage across the five consumers and `/design-preview` is 14 fields, not 18                                                                                                                                                                                                                                                                                                                              | (in read.ts above) | `player-questionnaire.test.ts:310` reads `missingRequiredFields`, which stays                                                | none; typecheck proves no reader                                                                                                                                                                       |
| — sub-row: five terminal "link can't be used" pages (counted in the route rows above)                                                                                |         — | One uniform 404 per token door                                                                           | fold into one kit member — see Kit; 108 → 65                                                                                                                                                                                                                                                                                                                                                                                                         |                  — | `rsvp/[token]/screens.test.tsx:329-445`, `details/screens.test.tsx:171-182`, `tests/token-link-preview-safety.test.ts`       | the RSVP one must stay indistinguishable across five token states; it is reached from one `notFound()` call and keeps one constant prop set                                                            |

The numeric rows sum to 4933 now and 3628 after. The remaining 155 are the
five new shared files this section proposes, counted once here:
`src/lib/token-page.ts` 35 (G09-07), `src/lib/token-action.ts` 45 (G09-02),
`src/components/token-link-unusable.tsx` 30 (Kit),
`src/lib/services/question-responses.ts` 35 (G09-04),
`src/lib/services/contact-lookup.ts` 10 (G09-01). 3628 + 155 = 3783.

### Proposals

#### G09-01 — One field table drives step 1's form, its validation and its input (saves ~216)

- Now: the same seventeen field names are spelled out six times.
  `details/validation.ts` writes them as an interface (`:28-49`), as
  `EMPTY_DETAILS_VALUES` (`:59-77`), as `DETAILS_FIELD_ORDER` (`:86-101`), as
  `REQUIRED_LABEL` (`:103-118`) and as seventeen `read("…")` lines
  (`:121-146`); `details-form.tsx:177-231` spells them again in JSX;
  `details-step.tsx:48-66` builds `initialValues` field by field and
  `:80-109` builds a seven-key `meta` object whose every entry is the same
  two lines; `details/actions.ts:139-165` re-shapes that flat object into
  `step1.ts`'s nested `DetailsStepInput` (`step1.ts:29-46`).
- Smallest honest shape: one table, and everything derived from it.

  ```ts
  const DETAILS_FIELDS = [
    {
      name: "given_name",
      label: FIELD_GIVEN_NAME,
      section: "who",
      required: true,
      disputable: true,
    },
    { name: "mobile", label: FIELD_MOBILE, section: "who", required: true, kind: "phone" },
    { name: "student_number", label: FIELD_STUDENT_NUMBER, section: "gameday" },
    // …17 rows, one line each
  ] as const;
  export type DetailsFormValues = Record<(typeof DETAILS_FIELDS)[number]["name"], string>;
  ```

  `EMPTY_DETAILS_VALUES`, `readDetailsValues`, `validateRequiredDetails`,
  `firstInvalidDetailsField` each become one `Object.fromEntries`/`filter`/
  `find` over it; `details-form.tsx` maps sections then rows; `initialValues`
  and `meta` come from the same rows; `saveDetailsStep` takes the flat
  `DetailsFormValues` plus the three ids, so `DetailsStepInput`'s nested
  shape and the 27-line re-mapping both go. The three contact lookups
  (`details-step.tsx:18-31`, `step1.ts:189-206`) become one
  `currentContactValue(record, kind, scope?)` in a new
  `src/lib/services/contact-lookup.ts`.

- Behaviour held by: `details-form.test.tsx` (per-field error placement, the
  shape messages under mobile/personal email/EC email, focus on the first
  invalid field in screen order, values surviving a failed submit),
  `details/actions.test.ts:198-289` (a required error for every one of the
  thirteen validated fields; the service still called for the twelve valid
  ones), `details/screens.test.tsx:212-242` (consent tick first, no untick
  control) and `:287-394` (the disputed notice and the source line per
  field). Nothing pins the _section grouping_ of the fields beyond the
  screenshots.
- Lines: 695 → 479, because one 17-row table plus five derivations (~50)
  replaces five parallel 17-entry structures (~90), the JSX drops from 55
  hand-written calls to a nested map (~20), `initialValues`+`meta` drop from
  49 to ~13, and the action's re-mapping (27) and the nested input interface
  (18) disappear.
- Risk: a wrong `required` or `kind` flag changes which field refuses or
  which control renders. Both are asserted per field by the two action tests
  and `details-form.test.tsx`; the section grouping and asterisks are caught
  by the desktop/375px screenshot pair.
- Repointed tests: `details-form.test.tsx:52` and
  `details/actions.test.ts:96` import `EMPTY_DETAILS_VALUES` — it survives as
  a derived constant, same name, same shape, so no assertion changes.
- New dependency: none. A schema library (zod) would express the table and
  the messages in fewer lines again, but it would also own the message
  strings, which `presentation.ts` owns today — not proposed.

#### G09-03 — One token-form control and one status lookup on the player home (saves ~116)

- Now: nine forms are hand-built with the same two or three hidden inputs and
  a `Button`. `row-actions.tsx:24-94` is four components that differ only in
  action, label, variant and one extra hidden field; `RowActions:97-131` then
  routes among them with a four-branch ladder over
  `standingAnswer`/`needsFollowUp`. `focused-panel.tsx:109-186` repeats the
  same form wrapper five more times, and `:152` tests
  `standingAnswer !== "yes" && standingAnswer !== null` immediately after
  `:127` tested `standingAnswer === "no"` — the same condition written two
  ways, two adjacent blocks. `summary-row.tsx:66-82` picks the chip label
  with a four-deep nested ternary. The `?open=` URL is hand-built in three
  places (`actions.ts:54`, `row-actions.tsx:85`, `focused-panel.tsx:189`).
- Smallest honest shape: one sibling `token-form.tsx` beside the route:

  ```tsx
  export function TokenSubmit({ action, token, invitationId, label, fields = {}, ...button }) {
    return (
      <Box component="form" action={action} sx={{ flex: 1, minWidth: 0 }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="invitationId" value={invitationId} />
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" fullWidth sx={{ minHeight: 40 }} {...button}>
          {label}
        </Button>
      </Box>
    );
  }
  ```

  plus `meUrl(token, invitationId?)` once, a `ROW_CONTROLS` table keyed by
  `(standingAnswer, needsFollowUp, reasonIsDefault)` returning the one or two
  controls a row shows, and a `CHIP_LABEL` lookup replacing the ternary.
  The two `standingAnswer === "no"` blocks in the panel merge into one.

- Behaviour held by: `me/[token]/screens.test.tsx:468-496` (no hidden `close`
  field on either Change-to-Yes control), `:543-554` ("Change answer" on the
  plain Attending row), `:202-252` (the focused panel's facts and notices),
  `:332-423` (the questions form appearing and collapsing), and
  `me/[token]/actions.test.ts:117-133` (a stray `close=1` must not close).
  Button variants and colours are not asserted anywhere — only the
  screenshots hold them.
- Lines: 361 → 245, because one 14-line control plus a 10-row table replaces
  four components (63) and a four-branch ladder (34), five panel form
  wrappers collapse to five one-line calls, and two nested ternaries become
  two lookups.
- Risk: a swapped variant or a lost hidden field. A lost `defaultOk` would
  turn a one-tap No into a refusal — `actions.test.ts:166-205` asserts both
  the default-reason path and the reason-demanding path, so it fails loudly.
  Variant/colour changes are caught only by the screenshot pair.
- Repointed tests: none. The tests query by accessible name and by hidden
  input presence, both unchanged.
- New dependency: none.

#### G09-04 — One answer writer and one question-response upsert (saves ~112)

- Now: `rsvp.ts` has two answer writers. `recordAnswerIn:181-248` locks the
  invitation, inserts the response, moves the invitation to `responded`,
  calls `stopChasingIn` and writes one audit row.
  `recordOperatorRsvpResponse:298-488` does all five again by hand
  (`:393-410`, `:466-479`) with a different `source`, an explicit
  `responded_at` and a `recorded_by_person_id`. Separately,
  `:411-463` upserts question answers in a 53-line loop that coerces strings
  to the question's type, while `player-home.ts:178-240`'s
  `answerEventQuestionsIn` upserts the same table with the same
  `on conflict` clause from already-typed values.
- Smallest honest shape: give `recordAnswerIn` the two extra optional
  parameters it lacks —

  ```ts
  recordAnswerIn(tx, invitationId, submission, {
    source: "signed_link" | "operator",
    actorLabel?: string, actorPersonId?: string,
    respondedAt?: Date, recordedByPersonId?: string,
    auditContext?: Record<string, unknown>,
  })
  ```

  — and let the operator path call it after its own four refusals (the
  withdrawn check, DEC-no-supersede, and the three `responded_at`
  validations stay exactly where they are, in the operator function, because
  they are its own rules). Move the upsert into a new
  `src/lib/services/question-responses.ts` exporting
  `upsertQuestionResponsesIn(tx, invitationId, eventId, answers)` and
  `coerceAnswer(question, raw)`, called by both paths.

- Behaviour held by: `rsvp.test.ts` (1279 lines — the insert, the status
  move, the cancelled jobs, the audit context and each refusal rule for both
  paths), `player-home.test.ts` (the no-partial-save rule and the
  exactly-one-kind-of-answer refusal), `tests/service-layer-audit.test.ts`.
- Lines: 827 → 715, because one writer with six options (~55) replaces two
  (~95) and one upsert with one coercion table (~35 in a new file) replaces
  two loops (~84).
- Risk: the operator row must keep reading "exactly like a player's own
  answer" apart from `source` and `recorded_by_person_id`, and the audit row
  must keep its per-path `context` keys (`clearedNonresponseFlags` for the
  player, `questionsAnswered` for the operator). Both are asserted field by
  field in `rsvp.test.ts`; the audit shape is also pinned by
  `tests/service-layer-audit.test.ts`.
- Repointed tests: none expected — both paths keep their exported signatures.
- New dependency: none.

#### G09-02 — One public-token write helper for the three action files (saves ~90)

- Now: `me/[token]/actions.ts:29-60`, `details/actions.ts:40-66` and
  `rsvp/[token]/actions.ts:34-57` each define the same five helpers —
  `str`/`text`, `tokenFrom`, `throttled`, `refuse`, a URL builder — and then
  every action repeats the same five steps: `startUniformClock`, read the
  form, `if (await throttled(token)) await refuse(...)`, `try { await
withTransaction(resolve → service) } catch { await refuse(...) }`,
  `redirect(success)`. Seven actions, seven copies.
- Smallest honest shape: one `src/lib/token-action.ts`:

  ```ts
  export async function runTokenWrite<T>(opts: {
    token: string;
    surface: PublicLinkSurface; // picks allow* + logThrottled* from a 4-row table
    refuseTo: string; // where a throttle or an unresolved token lands
    work: (tx: Tx, resolved: ResolvedPersonToken) => Promise<T>;
  }): Promise<T>; // redirects on refusal, returns on success
  ```

  plus `formText(form, field)` and `formFlag(form, field)` once, and one
  `outcomeFor(error)` for the two `isServiceError`/`Error`/fallback ladders
  in `join/[token]/actions.ts:42-46` and `stop/[token]/actions.ts:27-31`.
  `submitNo` keeps its own catch, because its failure is recoverable rather
  than uniform (`me/[token]/actions.ts:112-115`), and `saveDetails` keeps its
  own shape because it returns state instead of redirecting.

- Behaviour held by: `me/[token]/actions.test.ts:280-291` and
  `details/actions.test.ts:175-196` (throttling refuses without resolving the
  token again), every "refuses uniformly when the token no longer resolves"
  case in all three files, and `rsvp/[token]/actions.test.ts:79-109`
  (throttled is `busy`, never `closed`, and writes nothing).
- Lines: 397 → 307 across the three files, plus 45 for the helper, because
  75 lines of duplicated helpers become 20 and seven action bodies lose their
  identical five-step preamble.
- Risk: the uniform-timing floor is a security property —
  `startUniformClock` must be taken before the throttle check and
  `holdUniformRefusal` before every redirect, or a timing side channel
  reopens. The helper owns both, which is safer than three copies; the
  "holds an unresolved token to the same uniform floor" cases in
  `details/screens.test.tsx:203-211` and `rsvp/[token]/screens.test.tsx:355`
  measure it.
- Repointed tests: `tests/anonymous-token-route-coverage.test.ts:16`
  discovers token-bearing files by the literal source text
  `form.get("token")`. Moving that read into `token-action.ts` removes
  `src/app/me/[token]/actions.ts` and `src/app/rsvp/[token]/actions.ts` from
  the discovered set and fails the inventory. The regex must follow the new
  shape (and the inventory is already incomplete —
  `details/actions.ts` reads the token through `str(form, "token")` and is
  not discovered today, despite being a token-bearing write).
- New dependency: none. The file imports `src/lib/rsvp/public-surface` and
  changes nothing in it.

#### G09-05 — One contact-slot table and one emergency-contact writer (saves ~72)

- Now: `step1.ts` repeats itself four ways. `needsMobileWrite`,
  `needsPersonalEmailWrite` and `needsCollegeEmailWrite` (`:189-206`) are one
  function with a different `kind`/`scope` predicate. The three
  `supersedeContactPoint` calls (`:130-161`) are the same seven-line call
  with a different slot. `emergencyContactUpdateFor` (`:219-235`) is a
  five-case switch in which every branch returns the identical
  `{ field, value }` — it exists only to narrow a union.
  `writeEmergencyContactIn:237-269` then builds two mirror five-key records
  (`submittedByField`, `currentByField`) to compare.
- Smallest honest shape: one table of the three contact slots
  (`{ formField, kind, scope?, validate }`) driving validation and the
  supersede loop; `{ field, value } as EmergencyContactFieldUpdate` in place
  of the switch; and one loop zipping submitted against current by field name
  rather than two parallel records. The six ad hoc validation checks
  (`:66-104`) become one pass over the same table plus the two academic years
  and the date of birth, which already share a validator signature.
- Behaviour held by: `player-questionnaire.test.ts` (F1 — every valid field
  still writes when one is blank; the college-email Oxford rule; a malformed
  phone left unwritten but reported), `details-form.test.tsx:122-165` (the
  three shape messages, under their own fields).
- Lines: 230 → 158, because three predicates become one (−12), three
  supersede blocks become a loop (−20), the switch becomes one line (−16),
  the mirror records become one zip (−16), and the validation block tightens
  (−8).
- Risk: the order of writes matters in one place —
  `given_name` must be written first, or
  `person_emergency_contacts_given_name_not_blank` refuses the row
  (`:208`, `EMERGENCY_CONTACT_FIELD_ORDER`). The table keeps that order
  explicitly; `player-questionnaire.test.ts` writes a fresh emergency contact
  from empty, which is the case that fires the constraint.
- Repointed tests: `saveDetailsStep`'s parameter shape changes under G09-01
  (flat values), so `player-questionnaire.test.ts`'s `baseDetailsInput`
  helper (`:128-140`) follows the new shape — one fixture function, same
  assertions.
- New dependency: none.

#### G09-06 — One field table and one write path in provenance.ts (saves ~74)

- Now: three parallel nine-entry tables keyed by the same field list —
  `PROVENANCE_ACTION_BY_FIELD` (`:26-36`), `PERSON_FIELD_SOURCE_KEY`
  (`:88-99`), `PERSON_FIELD_VALUE_KEY` (`:101-112`) — plus
  `DISPUTABLE_FIELDS` (`:13-24`) listing the keys a fourth time.
  `buildFieldUpdate` (`:116-137`) is a nine-case switch whose seven string
  branches are identical and whose two year branches differ only by
  `Number.parseInt`. `applyDisputableFieldIn` (`:140-196`) then calls
  `updatePersonField` four times with the same three arguments and a
  different `reason`.
- Smallest honest shape: one table of nine rows
  (`{ field, action, valueKey, sourceKey, numeric? }`), one
  `buildFieldUpdate` of two lines, and one `updatePersonField` call whose
  `reason` and returned outcome come from a small decision:

  ```ts
  const outcome =
    currentValue === null
      ? "filled"
      : source === null
        ? "filled"
        : (await lastFieldActorPersonIdIn(tx, personId, field)) === personId
          ? "self-corrected"
          : "overwritten";
  await updatePersonField({
    actorPersonId: personId,
    personId,
    reason: REASON[outcome],
    ...update,
  });
  return outcome;
  ```

- Behaviour held by: `details/screens.test.tsx:304-394` (the source line says
  "You" or "The club" for whatever field actually changed, and never the
  retired disputed-fact clause), `player-questionnaire.test.ts` (the four
  outcomes per field), `tests/service-layer-audit.test.ts` (the audit action
  name per field).
- Lines: 169 → 95, because four nine-entry structures become one (−34), the
  switch becomes two lines (−19) and four write calls become one (−21).
- Risk: the nine audit action names are read back by
  `readFieldSuppliedByIn:61-68` and are the only link between a write and its
  "You"/"The club" label. A renamed action silently turns every source line
  into `null`. `details/screens.test.tsx:305-371` asserts the label for each
  of the nine fields after a real write, which is exactly that link.
- Repointed tests: none.
- New dependency: none.

#### G09-07 — One token GET surface helper for the three public pages (saves ~60)

- Now: `me/[token]/page.tsx:50-112`, `details/page.tsx:37-93` and
  `rsvp/[token]/page.tsx:37-80` each declare the same `PageProps`, the same
  `firstValue`/`first` (a ninth and tenth copy of a function that exists in
  seven other files — `git grep "function first"`), the same `Resolved`
  interface, and the same body: `withUniformTerminalTiming(async () => {
headers() → allow*Request → logThrottled* → withTransaction(resolve →
read) }, isTerminal)` then `notFound()`.
- Smallest honest shape: one `src/lib/token-page.ts`:

  ```ts
  export async function resolveTokenPage<T>(opts: {
    token: string;
    surface: PublicLinkSurface;
    read: (tx: Tx, resolved: ResolvedPersonToken) => Promise<T | null>;
  }): Promise<T>; // calls notFound() on every terminal state
  export function firstParam(value: string | string[] | undefined): string | null;
  ```

  The RSVP page passes its own resolver, because its token type and its
  `event_started`/`cancelled` states are the RSVP token's, not the person
  token's; the helper takes the terminal predicate as today.

- Behaviour held by: `rsvp/[token]/screens.test.tsx:329-445` (every terminal
  state renders one response, at 404, with the same copy),
  `:473-530` (rate limiting produces that same response and logs it),
  `details/screens.test.tsx:171-211`, `me/[token]/screens.test.tsx`.
- Lines: 382 → 287 across the three pages, plus 35 for the helper.
- Risk: the uniform-timing wrapper must still enclose the throttle check, or
  a throttled request returns faster than a resolved one. The tests above
  measure the floor directly. `notFound()` must be called outside the timed
  closure (it throws a control-flow signal) — the helper keeps that order,
  which three copies currently get right by hand.
- Repointed tests: `tests/anonymous-token-route-coverage.test.ts:16` also
  discovers `src/app/rsvp/[token]/page.tsx` by the literal
  `resolveRsvpTokenIn`. That call stays in the page (the page supplies the
  resolver), so the inventory is unaffected by this proposal.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit
  member: none missed. `PublicShell`, `PageHeader`, `Section`, `Surface`,
  `Fact`/`FactGrid`, `Notice`, `Field`/`CheckField`/`DateField`, `PhoneField`,
  `ActionBar`, `RowCard`/`RowCardList`, `StatusChip`, `StepTrail` and
  `LinkOpenedBeacon` are all reached through the kit. No local `Alert`, no
  local `Chip`, no re-wrapped MUI primitive.
- Pieces two or more routes write that should become one component:
  - The five terminal pages — `me/[token]/not-found.tsx` (16),
    `me/[token]/details/not-found.tsx` (24), `me/join/[token]/not-found.tsx`
    (13), `me/stop/[token]/not-found.tsx` (13), `rsvp/[token]/not-found.tsx`
    (42) — are one shape: `PublicShell` + `PageHeader` + one or two secondary
    paragraphs + an optional mailto and an inert `Close`. Proposed:
    `src/components/token-link-unusable.tsx` exporting
    `TokenLinkUnusable({ heading, body, privacyNote?, contactEmail?, close? })`,
    30 lines, with five 7-line callers — 108 → 65, saves ~43. Each caller
    still passes only constants from its own `presentation.ts`, so UX-63/64/65
    stay one file with no variant (`rsvp/[token]/not-found.tsx`'s own rule).
  - The invitation's own hidden-token form — nine copies in
    `row-actions.tsx`, `focused-panel.tsx`, `invitation-step.tsx`,
    `decline-step.tsx`, `document-step.tsx`, `step-shell.tsx`,
    `details-form.tsx`. Two routes render it, so by the kit rule it is a kit
    member rather than a sibling; G09-03 sizes it as a sibling because the
    two uses differ (one carries an `invitationId`, the other does not). The
    Lead should decide: one kit `TokenForm` serving both is ~6 lines more and
    removes the `token` plumbing from both routes.
  - The London date formatters (`rsvp/[token]/presentation.ts:83-149`) are
    imported by `/a/[token]`, `/me/[token]`, `/design-preview` and the RSVP
    route itself. A route's `presentation.ts` is not a shared module. They
    belong in one `src/lib/format/london-date.ts`; that move saves no lines
    by itself, and G09's formatter merge (−18) is independent of where they
    live.
  - `me/[token]/presentation.ts:21-27` re-exports five functions from two
    other routes' `presentation.ts` files purely to pass them through. Once
    the formatters have a home, this barrel goes.
- Kit members this section needs changed to absorb a local copy:
  - `Fact` already takes a `ReactNode` value, so
    `step-shell.tsx:83-110`'s `QuestionnaireStatus` needs nothing from the
    kit — but it is the third hand-rolled "label, value, good/bad colour"
    grid in the application (`Metric`/`MetricRow` is the second). Worth the
    Lead's comparison across sections; this section proposes no change to
    `Metric`.
  - `StatusChip` carries the one status-to-colour table, but
    `summary-row.tsx:66-82` computes the chip's _label_ locally from four
    conditions. The label belongs beside the vocabulary: `STATUS_VOCABULARY`
    could take the player-facing words for `domain="rsvp"`, which would also
    remove `itemStepWord`'s sibling (`step-shell.tsx:63-70`). Not counted in
    any proposal above — it needs the other sections' chip copies to size.

### Product questions

1. **What does the player's home say under its heading?** The live page
   renders `PRIVACY_NOTE` as its only subtitle
   (`me/[token]/page.tsx:146-150`), and `me/[token]/screens.test.tsx:306-328`
   asserts the live page does _not_ contain `HEADING_HELP`,
   `FOLLOW_UP_ONLY_HELP` or `EMPTY_HELP`. Those three strings
   (`me/[token]/presentation.ts:42-47`) are rendered only by
   `/design-preview/player-home/page.tsx:244-247`, which is the approved
   design surface. Either the three strings are dead and go, or the live page
   is missing an approved line. A rewrite cannot choose.
2. **Is an event's kind its template name or its behavioural class?** Live
   screens render `templateName` (`summary-row.tsx:65`,
   `invitation-step.tsx:55-57`); `/design-preview` renders
   `eventTypeLabel(eventType)` from the same three-times-duplicated function
   (`me/[token]/presentation.ts:17`, `rsvp/[token]/presentation.ts:13`,
   `a/[token]/presentation.ts:11`). Standards rule 7 says one fact says one
   thing everywhere. Deleting the function is only right if the preview is
   wrong.
3. **Does a No need a reason?** `/rsvp/[token]` refuses a blank reason
   (`rsvp.ts:202-206`, `NO_REQUIRES_A_REASON_RULE`, enforced a second time by
   the browser's `required` at `decline-step.tsx:59-67`). The player's home
   records `"No reason given"` instead, from a one-tap No that carries
   `defaultOk=1` (`me/[token]/actions.ts:93-95`,
   `row-actions.tsx:37`), and only its dedicated reason form demands text.
   Two screens take the same answer to the same invitation under two rules;
   one answer surface cannot be written without a decision.
4. **Which reason placeholder is right?** `REASON_PLACEHOLDER` is
   `"Academic conflict"` on the RSVP screen
   (`rsvp/[token]/presentation.ts:42`) and
   `"e.g. clashes with a family commitment"` on the player's home
   (`me/[token]/presentation.ts:105`), the latter because OWNER-LAN172-09
   found the former "reads as a real answer rather than an example". The
   rejected text is still live on the other screen.
5. **One sentence for a dead link, or five?** The five terminal pages say
   five different things: "This link can't be used" with two different bodies
   (`me/[token]/not-found.tsx:9`, `details/presentation.ts:16-18`), "This
   link is no longer live" twice with different follow-ups
   (`join/[token]/not-found.tsx:9`, `stop/[token]/not-found.tsx:13`), and
   "This RSVP link can't be used" (`rsvp/[token]/presentation.ts:58`). The
   kit member above does not need the answer; collapsing the copy to one
   sentence would be a UX change.

### Not proposed

- `src/app/rsvp/[token]/params.ts` (7) — four query keys and three error
  values, each with a reason recorded. Already its smallest form.
- `src/app/rsvp/[token]/rsvp-shell.tsx` (16) — two exports, both used by
  three sibling screens. Nothing to remove.
- `src/app/me/layout.tsx` (6) and `src/app/me/stop/[token]/page.tsx` (33) —
  a metadata export and a resolve-then-render page. Smallest honest shape
  already.
- The three `presentation.ts` copy blocks (312 lines of the 4933) — strings
  the club decided, required to live in one place per surface by standards
  rule 7. Only `stepLabel`'s switch and the triplicated `eventTypeLabel`
  reduce.
- `src/lib/services/player-home.ts`'s SQL (`:328-358`) — one query, five
  joins, three scalar subqueries, already the single read the page needs.
  Only the per-row follow-up count comes out of it.
- `recordOperatorRsvpResponse`'s four refusals (`rsvp.ts:317-384`) — the
  withdrawn check, DEC-no-supersede, and the three `responded_at`
  validations are that path's own rules and stay inline, under their own
  rule constants.
- Carve-outs read for context, proposed nothing in: `src/lib/rsvp/public-surface.ts`
  (the rate-limit windows, the uniform-timing floor and `clientKeyFrom`),
  `src/lib/services/player-answer-tokens.ts` (`resolvePersonTokenIn`,
  `issuePersonTokenIn`, `NO_REASON_GIVEN_DEFAULT`),
  `src/lib/services/rsvp-tokens.ts` (`resolveRsvpTokenIn`, `TokenState`),
  `src/lib/db` (`withTransaction`, the service error classes).

---

## G10-admin-operators-roles — Operator administration: operators, invitations, roles, audit

Lines now: 6295. Lines after everything proposed: 4852. Saved: 1443 (22.9%).

### Files read

All 43 files in the brief. Read for context, proposed nothing in: `src/lib/auth/administration-authority.ts`, `src/lib/auth/capabilities.ts`, `src/lib/auth/guards.ts`, `src/lib/club-time.ts`, `src/components/{status-chip,row-card,field,outcome-slot,candidate-row,sortable-header}.tsx`, `src/lib/services/person-duplicate.ts`, `src/app/operate/gate.tsx`.

### Patterns hunted

Where the lines are: 2347 in the five route surfaces, 3948 in the services. Of the services, 864 are two "shared" helper layers for one subject and 510 are the audit envelope — a third of the section's code is infrastructure under thirteen events and nine actions.

- **Per-route `presentation.ts` / `action-state.ts` restating a vocabulary another route restates.** Occurs. `admin/presentation.ts:97-112` restates the kit's operator status-to-colour table (`status-chip.tsx:93-99`) and nothing renders it; `admin/action-state.ts:13-18` restates `OutcomeState` (`outcome-slot.tsx:12-16`) field for field; `admin/presentation.ts:224-269` is the third `formatDay`/`formatInstant` in `src/app` (`report/presentation.ts:134`, `roster/presentation.ts:29`). Does **not** occur for the seat and holder sentences (`describeSeats`, `describeHolders`, `describePeriod`): those are one definition, imported by four surfaces, and pinned by `presentation.test.ts`.
- **Server actions parsing `FormData` by hand and routing refusals by hand.** Occurs, nine times, `admin/actions.ts:99-374`. G10-06.
- **Hand-written validation per form where one rule table would do.** Does **not** occur on the client: every field is a kit `Field`/`DateField` with `required`, and validation is the service's. Occurs on the server as eighteen `rule`/`message` constant pairs across two files (`operator-administration/shared.ts:40-104`, `operator-invitations/shared.ts:61-107`), thrown one at a time — G10-01's refusal table.
- **`read.ts`/`write.ts`/`shared.ts`/`index.ts` quartets whose barrel only re-exports.** Occurs three times: `operator-invitations/index.ts` (9 lines over siblings in one directory), `operator-administration/index.ts` (22), `administration-events/index.ts` (21) — and a fourth, `administration-audit.ts:337-346`, re-exports ten names `administration-events` already exports. `operator-invitations/params.ts` (23) and `refusals.ts` (8) are type- and constant-only files whose users import them directly. `operator-administration/shared.ts:593` is a doc comment left behind by an export that no longer exists.
- **Repeated SQL fragments and row mappers differing only in a column list; N-way reads that are one query.** Occurs. The `deriveOperatorAccountState` input literal is written six times over the same four columns: `administration-directory.ts:439-453` and `:357-362`, `role-detail.ts:159-168`, `candidates.ts:206-212`, `account-read.ts:45-50`, `operator-administration/shared.ts:494-503` and `:549-559`; the five-column select list behind it is written five times. `operators/[operatorId]/page.tsx:54-57` plus `permissions.ts:68-72` is four transactions and six queries for one page. Does **not** occur in the two plural reads: `readRoleCatalogue` and `readOperatorDirectory` are deliberately three queries rather than twenty transactions, and `administration-directory.test.ts` exists to keep them honest about it.
- **A vocabulary, label or colour table defined in a service and again in a route.** Occurs once (`accountStateColour`, above). Does **not** occur for the state labels or descriptions: `operator-account-state.ts:27-73` is the single source, and the route reaches it through `accountStateLabel`/`operatorAccountState`. Role labels come from the capability map, not TypeScript in this section, because `tests/capability-map-single-source.test.ts` forbids otherwise.
- **Table + card pairs per list built by hand.** Occurs twice, `operators/page.tsx:81-167` and `roles/page.tsx:58-127`, and in fifteen files app-wide. G10-03.
- **Envelope/audit/event layers wrapping exactly one call site.** Does **not** occur: `recordAdministrationEvent` has fourteen call sites over thirteen distinct actions, and the per-action rules it enforces (reason required, self-action forbidden, creation vs transition) are each consumed. The over-building is inside the layer, not in its existence — thirteen definitions declaring nine fields each where eight are the same value eleven times (G10-04).
- **Components re-wrapping MUI without adding behaviour; local copies of a kit member.** Occurs: `role-actions.tsx:432-459` wraps `DateField` in 28 lines to own a value and convert a date floor; `operator-actions.tsx:191-236` is a local `ActionPanel` that `role-actions.tsx` and `invite-form.tsx` then write again. Does **not** occur for `Fact`, `Notice`, `StatusChip`, `RowCard`, `Section`, `EmptyState` or `ActionBar` — every one is imported from the kit, which is why the surfaces are as short as they are.
- **Long `switch`/`if` ladders over a status that one lookup table expresses.** Occurs once, `admin/presentation.ts:100-111` (the dead colour switch). Does **not** occur elsewhere: `deriveOperatorAccountState` (`operator-account-state.ts:84-92`) is a four-line precedence ladder that _is_ the rule, and the five state definitions are already a table.
- **Types declared twice.** Occurs. `RoleRow` in `operator-invitations/shared.ts:317-323` and `operator-administration/shared.ts:141-147` are identical; `CatalogueHolder` (`administration-directory.ts:22-32`) and `RoleHolder` (`role-detail.ts:23-36`) are the same holder with three extra flags, which is the duplication G10-05 deletes. Does **not** occur as service-type-plus-view-model: the routes render `DirectoryOperator` and `CatalogueRole` directly, with no parallel view model.
- **Anything the workflow map does not reach.** Four things. `readRoleHolders()` (158 lines) — no route, and its test says so (G10-05). Its `options.cycleId`/`readOnly` back-year view — no route and no link (product question 3). `accountStateColour`, `permissionsLine`, `isOperatorAccountState` — no caller outside their own tests. `ADMINISTRATION_HISTORY_CAPABILITY` and `UNREADABLE_ENTRY_MESSAGE` — exported for consumers that do not exist; `history.tsx:44` renders the message off the entry.
- **Runtime, as a by-product (LAN-227 owns speed; it is not the measure).** G10-03's single-transaction operator read replaces four transactions with one on the most-visited detail page; G10-05 removes a second seat query shape; `permissions.ts`'s `subject()` stops opening a transaction per decision.

### Modules

| Module or surface                                                                                                                     | Lines now | What it does                                                                                 | Proposed shape                                                                                                                                          | Lines after | Tests that prove it                                                                                      | Risk, and how it is caught                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin/actions.ts`                                                                                                                    |       318 | Nine server actions: read the form, call one service, turn a `ServiceError` into a sentence  | rewrite as G10-06's declarative table — the nine bodies are the same five steps nine times                                                              |         215 | `admin/actions.test.ts`, `admin/screens.test.tsx`                                                        | A revalidate path or a notice sentence dropped; `actions.test.ts` asserts each return shape and `screens.test.tsx` each sentence            |
| `admin/presentation.ts`                                                                                                               |       227 | Section labels, seat/holder sentences, permission summaries, the three-shape date formatters | rewrite: delete three dead exports, move the date formatters to `club-time.ts`                                                                          |         180 | `admin/presentation.test.ts` (710 lines, the rule 2/3 binding)                                           | Rule 3's three input shapes; `presentation.test.ts:660-682` pins all three plus the unreadable value                                        |
| `roles/[roleId]/role-actions.tsx`                                                                                                     |       410 | Assign / Replace / End panels on one seat, with candidate search and date floors             | rewrite as G10-02: two `ActionPanel`s plus one `CandidateChooser`                                                                                       |         250 | `admin/screens.test.tsx:1062-1560`, `admin/outcome.test.tsx`                                             | Two outcome slots on one panel (rule 1); `outcome.test.tsx` fails if a panel stops claiming on start                                        |
| `operators/new/invite-form.tsx`                                                                                                       |       223 | The guided invitation: duplicate check, then role and dates                                  | rewrite as G10-02 — its candidate block is `role-actions.tsx`'s, twice over                                                                             |         137 | `admin/screens.test.tsx:1548+`, `actions.test.ts`                                                        | The "already has a login" warning and the `CREATE_NEW` choice; `screens.test.tsx` asserts both                                              |
| `operators/[operatorId]/operator-actions.tsx`                                                                                         |       209 | Five account actions, each a disclosure panel                                                | fold its local `ActionPanel` (`:191-236`) into the kit                                                                                                  |         155 | `admin/screens.test.tsx:705-758`                                                                         | Which buttons an account state offers; four tests pin the four states                                                                       |
| `operators/[operatorId]/page.tsx`                                                                                                     |       216 | One operator: account panel, relationships, actions, audit history                           | rewrite as G10-03: one read, one unavailable guard, `Fact` rows from a list                                                                             |         175 | `admin/screens.test.tsx:534-770`                                                                         | The arrival notice and the delivery-failure `Notice`; both have named tests                                                                 |
| `roles/[roleId]/page.tsx`                                                                                                             |       141 | One seat: holder, permissions, actions, holder history                                       | rewrite as G10-03; the catalogue scan at `:38-53` belongs in the service                                                                                |         105 | `admin/screens.test.tsx:924-1330`                                                                        | The scope-aware cycle label; `screens.test.tsx:1242-1270` pins committee vs season                                                          |
| `operators/page.tsx`                                                                                                                  |       150 | Operators index: three sections, a desktop table and a phone card list                       | rewrite on `RecordTable` (G10-03); `:81-138` writes both halves by hand                                                                                 |          60 | `admin/screens.test.tsx:344-533`                                                                         | A field present in the table and dropped from the card; the column definition makes that impossible and `screens.test.tsx:405` asserts both |
| `roles/page.tsx`                                                                                                                      |       115 | Roles index: the club's constitution as a page                                               | rewrite on `RecordTable` (G10-03); `:58-110` is the same hand-written pair                                                                              |          45 | `admin/screens.test.tsx:772-923`                                                                         | The `Assign`/`View` button rule at `:96`; `screens.test.tsx:874` pins it                                                                    |
| `roles/[roleId]/current-holder-panel.tsx`                                                                                             |       102 | Current holders, then scheduled arrivals                                                     | rewrite: `:38-76` and `:88-103` render the same two facts twice — one `HolderLine`                                                                      |          70 | `admin/screens.test.tsx:925-1061`                                                                        | Rule 2's ordering (current first, scheduled appended); `screens.test.tsx:970-1032` pins both directions                                     |
| `admin/history.tsx`                                                                                                                   |        60 | The two audit projections, rendered on `RowCardList`                                         | keep — already a kit member plus a subline list                                                                                                         |          60 | `admin/screens.test.tsx:628-704`                                                                         | —                                                                                                                                           |
| `admin/permissions.ts`                                                                                                                |        59 | What the two detail screens may offer                                                        | fold into one `permittedActions()` — eight `canAdministerTarget` literals are a table, and `subject()` (`:68-72`) opens a transaction per call          |          40 | `admin/permissions.test.ts` (460 lines)                                                                  | A permission silently widened; `permissions.test.ts` enumerates all eight decisions                                                         |
| `admin/page-heading.tsx`                                                                                                              |        55 | The heading every Administration page opens with                                             | keep — one line over `PageHeader` plus the guide link; the 24-line inline SVG (`:36-61`) is a recorded dependency decision                              |          55 | `admin/screens.test.tsx:384-396`                                                                         | —                                                                                                                                           |
| `operators/new/page.tsx`                                                                                                              |        41 | Reads the catalogue, flattens it to assignable seats                                         | keep, less the unavailable dance (G10-03)                                                                                                               |          33 | `admin/screens.test.tsx:306-343`                                                                         | —                                                                                                                                           |
| `admin/action-state.ts`                                                                                                               |        21 | `AdminActionState` and `CandidateChoice`                                                     | rewrite as `extends OutcomeState` — `error`/`notice`/`refusal` are the kit's three fields verbatim                                                      |          12 | `admin/outcome.test.tsx`                                                                                 | —                                                                                                                                           |
| NEW `components/action-panel.tsx`                                                                                                     |         0 | One action's title, explanation, fields, submit and result                                   | new kit member (G10-02)                                                                                                                                 |          42 | new `action-panel.test.tsx`, plus every surface test above                                               | —                                                                                                                                           |
| NEW `admin/candidate-chooser.tsx`                                                                                                     |         0 | Search for a person, echo the terms, choose one or say nobody matched                        | new sibling shared by the two admin routes (G10-02)                                                                                                     |          75 | `admin/screens.test.tsx:1424-1560` unchanged                                                             | Rules 4 and 5 live here; `screens.test.tsx` pins the enabling sentence and the forward link                                                 |
| NEW `components/record-table.tsx`                                                                                                     |         0 | One column definition, rendered as a desktop table and a phone card list                     | new kit member (G10-03)                                                                                                                                 |          60 | new `record-table.test.tsx`                                                                              | —                                                                                                                                           |
| NEW `readOrUnavailable()` in `operate/unavailable.tsx`                                                                                |         0 | A service read that returns either data or the unavailable screen                            | new helper (G10-03)                                                                                                                                     |          12 | the five page tests                                                                                      | Rule 6: a refusal must render as content; each page test has a missing-cycle case                                                           |
| KIT `components/field.tsx` — `DateField`                                                                                              |         0 | `minDay?: string` and a self-owned `defaultValue`                                            | kit change absorbing `RoleDateField` (`role-actions.tsx:432-459`)                                                                                       |           6 | `components/field.test.tsx`, `screens.test.tsx:1331-1383`                                                | The date floor; `screens.test.tsx` pins "earliest usable end date"                                                                          |
| `operator-administration/shared.ts` + `operator-invitations/shared.ts` + `subject.ts` + `params.ts` + `refusals.ts` + both `index.ts` |       864 | Guards, refusal constants, role lookup, date rules, account locking — written twice          | rewrite as one core (G10-01)                                                                                                                            |         679 | `operator-administration.test.ts` (2409), `operator-invitations.test.ts` (2160)                          | A refusal sentence changed by unification; the two suites assert rule **and** message for each                                              |
| `administration-events/{vocabulary,envelope,index}.ts`                                                                                |       510 | The closed event set and the envelope checks                                                 | rewrite as one file with defaults-merging definitions (G10-04)                                                                                          |         345 | `administration-events.test.ts` (526)                                                                    | An event rule silently defaulted wrong; the suite asserts every action's reason/self/shape rule                                             |
| `operator-administration/role-detail.ts`                                                                                              |       158 | `readRoleHolders()` — one seat's holders, cycle-scoped                                       | delete because no page calls it (G10-05), and its own test says so                                                                                      |           0 | `operator-administration.test.ts:1188,1764,2314-2342`, `administration-directory.test.ts:259-315`        | Losing an observation instrument six tests use; each is repointed to `readRoleCatalogue`                                                    |
| `administration-audit.ts`                                                                                                             |       295 | One event writer, two history projections over one query                                     | rewrite as G10-07: two readers, one entry mapper                                                                                                        |         215 | `administration-audit.test.ts` (902)                                                                     | The unreadable-envelope entry; `administration-audit.test.ts` has cases for both reasons                                                    |
| `administration-directory.ts`                                                                                                         |       377 | The two plural reads: every operator, and the whole seat catalogue                           | rewrite: one operator-state SQL fragment and one row reader in place of the repeated literal at `:439-453`                                              |         320 | `administration-directory.test.ts` — the rule 7 binding                                                  | The currency test (holder **today**, not "overlaps the cycle"); the agreement test is built on exactly that                                 |
| `operator-invitations/candidates.ts`                                                                                                  |       191 | The invite screen's duplicate check                                                          | fold into `findPersonDuplicates` (G10-08)                                                                                                               |         115 | `operator-invitations.test.ts`, `person-duplicate.test.ts`                                               | Which people surface — see product question 1                                                                                               |
| `operator-invitations/cycles.ts`                                                                                                      |       156 | Five resolvers over two cycle tables, plus the assignment insert                             | rewrite as one `resolveCycle(tx, scope, mode)`; `:75-191` is one query shape and one widening, five times                                               |         105 | `operator-invitations.test.ts`, `administration-directory.test.ts` (gap-year and `closing`-season cases) | A read resolver that starts throwing; rule 6 tests cover the gap year on every surface                                                      |
| `operator-invitations/{invite,resend}.ts` + `operator-administration/email-rehome.ts`                                                 |       519 | The three flows that call Auth: validate, pre-flight, move, write, deliver, record failure   | rewrite on the core's guarded-account helper; `invite.ts:99-101`, `resend.ts:119-131`, `email-rehome.ts:163-173` re-assert the same four things by hand |         470 | `operator-invitations.test.ts`, `operator-administration.test.ts`                                        | LAN132-B3's second assertion inside the writing transaction; both suites stage the race                                                     |
| `operator-administration/{assign,end,replace,access}.ts`                                                                              |       442 | The four writes, each lock → guard → rule → write → event                                    | rewrite on the core's helpers; the bodies stay, the preamble does not                                                                                   |         415 | `operator-administration.test.ts`                                                                        | `assertClubKeepsAnAdministrator` skipped on a path; the suite has a last-administrator case per action                                      |
| `operator-identity.ts`                                                                                                                |        86 | The Supabase Auth port: four methods                                                         | rewrite: four copies of `createAdminClient()` + an error branch become one `admin()` and one `orFail()`                                                 |          65 | `operator-invitations.test.ts` (the port is swapped in tests)                                            | The duplicate-address detection at `:102-108`; pinned by name                                                                               |
| `operator-account-state.ts`                                                                                                           |        88 | The five states, derived not stored, with their club-facing descriptions                     | keep the definitions (they are prose); delete `isOperatorAccountState` (`:100`, no caller); add the shared row reader G10-01 and the directory need     |          94 | `operator-account-state.test.ts`, `admin/guide/content.test.ts`                                          | —                                                                                                                                           |
| `audit.ts`                                                                                                                            |        82 | The single writer for `audit_events`, plus the natural-key UUIDv5                            | keep — three refusals, one insert, and a v5 Node does not provide; three other modules use `deriveEntityIdFromNaturalKey`                               |          82 | `administration-audit.test.ts`                                                                           | —                                                                                                                                           |
| `operator-invitations/{account-read,activate,delivery}.ts`                                                                            |       180 | The account projection, activation, and delivery-failure recording                           | rewrite: `delivery.ts:11-32` and `email-rehome.ts:77-93` are one function; two delivery-failure classes are one                                         |         160 | `operator-invitations.test.ts`, `operator-administration.test.ts`                                        | The recorded reason's 300-character bound; asserted in both suites                                                                          |

### Proposals

#### G10-01 — One administration core instead of two "shared" modules (saves ~185)

- Now: `operator-invitations/shared.ts` (303) and `operator-administration/shared.ts` (480) are two private helper layers for one subject, and six helpers are written twice: `requireOperator` (`op-inv:120-127` / `op-admin:108-115`), `blankToNull` (`op-inv:109-113` / `op-admin:125-129`), `normaliseEmail` (`op-inv:116-118` / `op-admin:131-133`), `administrationAuthority` (`op-inv:136-143` / `op-admin:117-123`), `lockAccount` (`op-inv:184-199` / `op-admin:362-383`), `refuseTakenEmail` (`op-inv:202-218` / `op-admin:408-422`). `RoleRow` and its select list are declared twice (`op-inv:317-340` / `op-admin:141-175`); the backdating-and-date rule is written twice (`op-inv:354-363` inside `resolveRoles`, and `op-admin:281-298` as `resolveDates`, whose own comment says "same three rules as an invitation's initial roles"). Five re-assert blocks (`invite.ts:99-101`, `resend.ts:90-98` and `:119-131`, `email-rehome.ts:139-149` and `:163-173`) hand-write lock → read subject → assert target → refuse. `operator-administration/index.ts` (22) and `operator-invitations/index.ts` (9) are barrels over siblings in the same directory, `refusals.ts` (8) is eight constants its callers import anyway, `params.ts` (23) holds two interfaces that belong in `invite.ts`, and `shared.ts:593` is a doc comment whose export was removed.
- Smallest honest shape: one `src/lib/services/administration/` with `guards.ts` (`requireOperator`, `administrationAuthority`, `assertAdministrationCapability`, `withGuardedAccount`), `refusals.ts` (one table: `{rule, message, error}` — two entries where the two modules word one condition differently, see product question 2), `roles.ts` (one `RoleRow`, one `readRole(tx, by)`, one `resolveEffectiveFrom`), and `accounts.ts` (`lockAccount`, `refuseTakenEmail`, `updateAccount`). One barrel, twelve lines.
  ```ts
  export async function withGuardedAccount<T>(
    tx: Tx,
    operator: ResolvedOperator | null,
    accountId: string,
    action: AdministrationActionName,
    body: (account: OperatorAccountRecord) => Promise<T>,
  ): Promise<T>; // lock, read subject (includeScheduled), assertAdministrationTarget, then body
  ```
- Behaviour held by: `src/lib/services/operator-administration.test.ts` (2409 lines) and `src/lib/services/operator-invitations.test.ts` (2160), which assert rule **and** message for every refusal, and stage the LAN132-B3 race on all three Auth flows. No test pins that the two modules' wordings of one condition differ — that is only visible by reading both files.
- Lines: 864 → 679, because six duplicated helpers (~60), two role lookups (~18), two date rules (~15), five guard preambles (~16), three barrels/constant files (~45) and the delivery-failure pair (~26) collapse to one each.
- Risk: a refusal sentence changed by unification, or the second assertion dropped from a writing transaction. The two suites fail on the first; `withGuardedAccount` makes the second structural rather than remembered, and the race tests stay.
- Repointed tests: none, if the refusal messages are kept verbatim (they must be, until product question 2 is answered). Imports move from `./shared` to `../administration/…`.
- New dependency: none.

#### G10-02 — Three action panels, one component (saves ~177)

- Now: `operator-actions.tsx:191-236` defines `ActionPanel` (title, explanation, form, `ActionBar`, `Outcome`, one `useOutcomeSlot`). `role-actions.tsx` writes the same thing twice inside `PersonPanel` (`:282-345`) and `EndPanel` (`:369-427`), and `invite-form.tsx:187-249` a fourth time. The candidate search-and-choose block is written twice in full: `invite-form.tsx:87-185` (four fields held in state, a search form, an empty `Notice`, a `RadioGroup` of matches with name + email + operator state) and `role-actions.tsx:211-280` (the same, three fields, with the forward link). `role-actions.tsx:432-459` wraps the kit's `DateField` in 28 lines purely to own its value and convert a `YYYY-MM-DD` floor into a `Date`.
- Smallest honest shape: `src/components/action-panel.tsx` exporting `ActionPanel({title, description, action, submitLabel, submitColor, testId, children})` — it owns `useActionState`, `useOutcomeSlot`, the `<form>`, the `ActionBar` and the `Outcome`. `src/app/operate/admin/candidate-chooser.tsx` exporting `CandidateChooser({chosen, onChoose, fields, allowNobody, emptyResult})`, which owns the search action, the held terms, the echoed "searched for" string and the radio list. `DateField` grows `minDay?: string` and works uncontrolled from `defaultValue`, deleting `RoleDateField` and the `dateFromScheduledOn` import that reaches into the events route.
- Behaviour held by: `src/app/operate/admin/screens.test.tsx` (1637 lines) — `:705-758` the five account panels, `:1062-1560` the three role panels, `:1424-1560` the empty search (rule 5) and the enabling sentence (rule 4); `src/app/operate/admin/outcome.test.tsx` the two slots on one panel (rule 1). Nothing pins that the two candidate blocks currently agree: they do not — the invite screen offers "None of these — this is somebody new" and the role screen offers a link to the invite route. Both behaviours must be parameters of the one component, not casualties of it.
- Lines: 842 → 542 in the three surfaces, plus 123 for `ActionPanel` (42), `CandidateChooser` (75) and the `DateField` change (6), because the panel scaffold disappears four times and the candidate block once.
- Risk: the outcome slot claimed on finish rather than on start (rule 1), or the empty-result link lost. `outcome.test.tsx` fails on the first and `screens.test.tsx:1478` on the second. The explanatory prose in each panel is a prop, not shared text.
- Repointed tests: none. All assertions are by `data-testid` and visible text, both preserved by the props.
- New dependency: none.

#### G10-03 — Four page shells: one column definition, one unavailable guard (saves ~173)

- Now: `operators/page.tsx:81-138` and `roles/page.tsx:58-110` each build a `DesktopOnly`/`TableFrame`/`Table` and then a parallel `RowCardList` of the same fields by hand — `OperatorCard` (`operators/page.tsx:147-167`) and `RoleCard` (`roles/page.tsx:118-127`) restate the columns a second time. Fifteen other surfaces do the same (`git grep -l DesktopOnly src` returns 15 files). All five pages in this section write the same unavailable dance: `operators/page.tsx:43-50`, `roles/page.tsx:31-37`, `operators/new/page.tsx:24-33`, `operators/[operatorId]/page.tsx:53-68`, `roles/[roleId]/page.tsx:38-58` — twenty-two files in `src/app/operate` repeat it. `roles/[roleId]/page.tsx:38-53` reads the whole catalogue and loops over every group to find one seat. `operators/[operatorId]/page.tsx:54-57` makes three sequential service calls and `permissions.ts:68-72` a fourth transaction for one page.
- Smallest honest shape: `src/components/record-table.tsx` exporting `RecordTable({rows, columns, rowKey, cardTitle, cardChips, cardSublines, href, ariaLabel, testId})`, where a column is `{header, width?, cell, onCard?}` — one definition drawing both halves, so a field cannot be in the table and missing from the card. `readOrUnavailable(title, testId, read)` in `src/app/operate/unavailable.tsx` returning `{data} | {screen}`. `readRoleFromCatalogue(operator, roleId)` in `administration-directory.ts` replacing the page's loop, and one `readOperatorRecordPage(operator, id)` doing the four reads in one transaction.
- Behaviour held by: `screens.test.tsx:344-533` (the Operators index: sections, both halves, the gap year), `:772-923` (the Roles index, the `Assign`/`View` rule, a coach in post with no season), `:534-770` and `:924-1330` (the two detail pages). `screens.test.tsx:405` asserts the role and the account state are separate facts in both halves.
- Lines: 663 → 418 across the five pages, plus 72 for `RecordTable` (60) and `readOrUnavailable` (12), because the card restatement and the table markup collapse into five-line column entries and the try/catch becomes one line per page.
- Risk: a column dropped from the phone half, or `UnavailableScreen`'s `testId` changed. The surface tests assert each field at both widths by `data-testid`, and rule 6's missing-cycle cases assert content rather than an error boundary. Because `RecordTable` is app-wide, its visual proof is a screenshot pairing of the two index screens at desktop and 375px, not only its own test.
- Repointed tests: none in this section. `RecordTable` needs a new `src/components/record-table.test.tsx`.
- New dependency: none.

#### G10-04 — One administration-events file, with defaults (saves ~165)

- Now: `administration-events/vocabulary.ts:59-203` declares thirteen event definitions with nine fields each, eight of which are the same value in eleven or more entries (`roleRelated` is true twice, `selfAuthorityAllowed` twice, `instantOrder` non-zero once, `selfActionForbidden` three times), and each entry repeats its own key as `action:`. `index.ts` (21 lines) re-exports thirteen names from two siblings in the same directory, and `administration-audit.ts:337-346` re-exports ten of them again. `envelope.ts:137-355` is a 180-line ladder where the authority arm (`:163-210`) refuses four different ways with one rule string between them.
- Smallest honest shape: one `src/lib/services/administration-events.ts`. `definition()` merges over `{roleRelated: false, reasonRequired: false, selfActionForbidden: false, selfAuthorityAllowed: false, instantOrder: 0}` and takes the action from the record key, so an entry is `"administration.role.ended": {family: "role_assignment", shape: "transition", roleRelated: true, reasonRequired: true, selfActionForbidden: true, label: "Role assignment ended"}`. The envelope's checks become a short list of `require(condition, message, rule)` calls with the messages unchanged.
- Behaviour held by: `src/lib/services/administration-events.test.ts` (526 lines), which asserts each action's reason requirement, self-action rule, state shape and label, and the unknown-action and no-op refusals by rule name.
- Lines: 510 → 345, because thirteen entries of twelve lines become thirteen of five or six, the barrel goes, and the authority arm loses its repetition.
- Risk: a rule silently defaulted to the permissive value — exactly what `selfActionForbidden: false` by default would hide. The suite asserts the rule per action, so a wrong default fails a named test rather than passing quietly; the three defaults that are permissive must each be asserted for at least one action that overrides them.
- Repointed tests: imports move from `./administration-events` (a directory) to `./administration-events` (a file) — no assertion changes.
- New dependency: none.

#### G10-05 — Delete `readRoleHolders()`: no page calls it (saves ~158)

- Now: `operator-administration/role-detail.ts` (158 lines) reads one seat's holders, cycle-scoped, with a historical `options.cycleId` and a `readOnly` flag. No route imports it. Its own agreement test says so: `administration-directory.test.ts:317-321` — "`readRoleHolders()` is called by no page in this application: it is the singular reader `WP-assignment` built, and Administration draws its two index screens and role detail without it. So the agreement it proves is between a reader two pages use and a reader nobody uses." The same file then adds the agreement the pages actually need (`readRoleCatalogue` against `readOperatorDirectory`), which is what `docs/ux/standards.md` rule 7 binds. `role-detail.ts:159-183` is a fourth copy of the operator-state row reader.
- Smallest honest shape: delete the file and its barrel line (`operator-administration/index.ts:25`). `readRoleCatalogue()` already returns `holders`, `scheduled`, `vacant`, `admitsMultipleHolders` and the label for every seat; `administration-directory.ts` grows `readRoleFromCatalogue(operator, roleId)` (counted in G10-03) for the single-seat read the role page does by looping.
- Behaviour held by: `administration-directory.test.ts:259-315` (the seat-by-seat agreement, twenty seats, three awkward cases) and `operator-administration.test.ts:1188, 1764, 2314-2342`, which use `readRoleHolders` as their observation instrument for six assertions. The cycle-scoped back-year read at `:2314-2329` is the one behaviour with no other reader — and no surface.
- Lines: 158 → 0, because every fact it derives is already derived by the catalogue for twenty seats in one query.
- Risk: the repointing, not the deletion — the six test call sites must observe the same facts through `readRoleCatalogue`, and the agreement test loses its oracle. Catching this is straightforward: those six assertions are about rows the tests themselves wrote, and the surviving catalogue↔directory agreement is the pair rule 7 requires. The back-year view is product question 3; if Brian wants it kept, keep a 40-line `readRoleHoldersAsAt()` and the saving falls to ~118.
- Repointed tests: `operator-administration.test.ts:1188, 1764, 2314-2342` (six reads become `readRoleCatalogue` lookups by role code); `administration-directory.test.ts:259-315` (drop the merged-reader loop, keep the directory agreement at `:317+` and its twenty-seat count).
- New dependency: none.

#### G10-06 — One adapter for the nine server actions (saves ~103)

- Now: `admin/actions.ts:99-374` is nine exported actions with one body: `await requireCapability(...)`, read two to five fields by hand, `try`, call one service, revalidate two or three paths, `return done("sentence")`, `catch { return failure(error) }`. The capability line appears nine times, the try/catch nine times, `callbackUrls()` four times, a `refresh*` call eight times.
- Smallest honest shape: one `adminAction()` taking a spec, and a table of nine specs.
  ```ts
  const RESEND = adminAction({
    fields: ["operatorAccountId"],
    callbacks: "invitation",
    call: (operator, f, urls) =>
      resendOperatorInvitation({
        operator,
        operatorAccountId: f.operatorAccountId,
        callbackUrl: urls.invitation,
      }),
    revalidate: (f) => operatorPaths(f.operatorAccountId),
    notice: (result) => deliveryNotice("The invitation has been sent again.", result),
  });
  ```
  `adminAction` owns the capability check, the field reader, the try/catch that maps `not_permitted` to `refusal` and everything else to `error`, the revalidation and the redirect case that `inviteOperatorAction` needs. The nine notice sentences, the delivery-notice wording and the invitation's subject shape stay exactly as written.
- Behaviour held by: `src/app/operate/admin/actions.test.ts` (207 lines) — the refusal-is-state rule, which is load-bearing: a server action that rethrows reaches the framework, not a refusal screen. `screens.test.tsx` asserts the sentences.
- Lines: 318 → 215, because nine capability lines, nine try/catch blocks, four callback reads and eight revalidate calls become one each, and the nine bodies keep only their service arguments and their sentence.
- Risk: a refusal turning into an exception, or a revalidate path lost so a screen shows stale rows. `actions.test.ts` fails on the first by asserting the returned `refusal`; the second is invisible to tests — so the two path lists become two named constants (`operatorPaths`, `rolePaths`) and the spec names one, which is checkable by reading nine lines instead of nine bodies.
- Repointed tests: none — the nine exported names and their `(previous, formData)` signatures are unchanged.
- New dependency: none.

#### G10-07 — Two history readers, one entry mapper (saves ~80)

- Now: `administration-audit.ts:285-335` exports four functions for two projections — each reader has a `withTransaction` wrapper and an `In` variant, both guarding and both validating the id. `toUnreadableEntry` (`:186-209`) restates `toEntry`'s whole return shape with nulls, and both call `columnFields` (`:162-183`). `ADMINISTRATION_HISTORY_CAPABILITY` (`:27`) and `UNREADABLE_ENTRY_MESSAGE` (`:56`) are exported for consumers that do not exist — `history.tsx:44` renders `entry.unreadable.message`, not the constant. `:337-346` re-exports ten names already exported by `administration-events`.
- Smallest honest shape: one `readAdministrationHistoryIn(tx, operator, by: {person: string} | {role: string})` plus one `readAdministrationHistory()` wrapper; the two subject messages stay in the refusal table. One `toEntry(row)` with an early `unreadable` branch that fills the envelope-derived fields from a single `blankEnvelope()` literal. Drop the two dead exports and the re-export tail.
- Behaviour held by: `src/lib/services/administration-audit.test.ts` (902 lines) — `:752-791` the guards and the `In` variants, plus the unsupported-version and missing-envelope cases and the same-instant tie-break.
- Lines: 295 → 215, because four readers become two, two entry shapes become one, and twelve dead or duplicated exports go.
- Risk: an unreadable row dropped from the list instead of marked — the defect LAN-130 finding A6 fixed. The suite asserts both unreadable reasons and that the column fields stay readable, which is exactly the branch being merged.
- Repointed tests: `administration-audit.test.ts:37-39` imports and `:752-791` call shapes follow the new signature; the assertions do not change.
- New dependency: none.

#### G10-08 — Fold `findOperatorCandidates` into `findPersonDuplicates` (saves ~76)

- Now: `operator-invitations/candidates.ts` (191 lines) is a 105-line SQL query answering "who might already be this person", and `src/lib/services/person-duplicate.ts:6-14` says of itself: "The one duplicate check — LAN-183, `REQ-duplicate-check`. `main` has three separate implementations of this question; this is the canonical one for W3's 'add or link a person' and every later caller." The two match on the same five things. The operator copy adds exactly two things: an arm matching `operator_accounts.login_email` (`candidates.ts:144-145, 170`, which exists because a login is often the only address the club holds) and an operator-account projection with its derived state (`:201-213`, a fifth copy of the state row reader). `src/lib/services/roster/duplicate-check.ts` (178) is the third implementation, and three routes define their own local `CandidateRow` component over them.
- Smallest honest shape: `findPersonDuplicates(query, options?: {matchOperatorLogin?: boolean; withOperatorAccount?: boolean})` — one extra `or` arm and one `left join` on `operator_accounts`, guarded by the flags so W3's behaviour is untouched. `candidates.ts` keeps `findOperatorCandidates` as the guarded, admin-facing shape: assert the capability, call the canonical check, map to `OperatorCandidate`.
- Behaviour held by: `src/lib/services/operator-invitations.test.ts` (the five match kinds, the login-address match, merged people excluded) and `person-duplicate.test.ts`. Nothing pins the two searches against each other today — they are two derivations of one fact with no agreement test, the shape `docs/ux/standards.md` rule 7 exists for.
- Lines: 191 → 115, counting ~35 lines added to `person-duplicate.ts` (another section's file). The query, the `wanted`/`alias_match`/`contact_match` CTEs and the `matchedOn` assembly stop existing twice.
- Risk: the invite screen's candidate list changing — `findPersonDuplicates` matches an alias against **both** the given and the family term, where `candidates.ts` matches each against its own field. That is product question 1, and it must be answered before this is built. The two suites catch a changed match set; neither can decide which set is right.
- Repointed tests: `operator-invitations.test.ts`'s candidate assertions keep their expectations; if question 1 is answered "the canonical list", the expected rows for the alias cases change and the test says so explicitly.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  - `admin/presentation.ts:97-112` `accountStateColour` → `status-chip.tsx:93-99` `STATUS_VOCABULARY.operator`. It maps the same five states to the same semantics (`deactivated` → `"default"` there, `"neutral"` here) and has no caller outside `presentation.test.ts:418-420`. Delete it; repoint that test to `statusStyle("operator", state)`, which is where the colour actually comes from.
  - `admin/action-state.ts:13-18` `AdminActionState` → `outcome-slot.tsx:12-16` `OutcomeState`. Same three fields; make it `extends OutcomeState`.
  - `role-actions.tsx:432-459` `RoleDateField` → `field.tsx` `DateField`, once it takes `minDay` and a `defaultValue`.
- Pieces two or more routes write that should become one component:
  - `operators/page.tsx:81-167` and `roles/page.tsx:58-127` → `RecordTable` in `src/components/record-table.tsx` (60 lines, counted in G10-03). Fifteen files under `src/app` write this pair; other sections should refer to this member rather than propose a second one.
  - `operator-actions.tsx:191-236`, `role-actions.tsx:282-345` and `:369-427`, `invite-form.tsx:187-249` → `ActionPanel` in `src/components/action-panel.tsx` (42 lines, counted in G10-02).
  - `invite-form.tsx:87-185` and `role-actions.tsx:211-280` → `CandidateChooser` at `src/app/operate/admin/candidate-chooser.tsx` (75 lines, counted in G10-02). A sibling rather than a kit member because it posts this feature's own server action; if another section finds a third caller outside `operate/admin`, it belongs in `src/components/` instead.
  - The five `try { read } catch { UnavailableScreen }` blocks → `readOrUnavailable()` in `src/app/operate/unavailable.tsx` (12 lines, counted in G10-03). Twenty-two files repeat this; count the helper once, here.
  - `admin/presentation.ts:224-269` — `toInstant`/`part`/`formatDay`/`formatInstant`, the only three-shape formatter in the application and the one `docs/ux/standards.md` rule 3 describes — belongs in `src/lib/club-time.ts` beside `formatClubDay`. `operate/report/presentation.ts:134` and `operate/roster/presentation.ts:29` each define a narrower copy (and the roster one is the rule-3 counter-example standards.md records); those sections should delete theirs against this one. Counted here as ~18 net.
- Kit members this section needs changed to absorb a local copy:
  - `field.tsx` — `DateField` takes `minDay?: string` (so no route imports `dateFromScheduledOn` from the events route) and works uncontrolled from `defaultValue`.
  - `candidate-row.tsx` — `CandidateRow` has **no caller in the application**: `design-preview/(operator)/kit/page.tsx` shows it, and `people/new/create-person-form.tsx:143`, `recruitment/new/add-recruit-form.tsx:468` and `roster/new/returner-intake-form.tsx:262` each define a local component of the same name instead. It needs a radio-choice mode (`choice: {name, value, checked}` in place of `action`) before `CandidateChooser` can use it; with that, one member replaces four local copies and this section's two radio lists. The three local copies are other sections' lines, so the saving is theirs — but the kit change is named here.

### Product questions

1. **Which people does the invite screen's duplicate check find?** `operator-invitations/candidates.ts:131-139` matches an alias against the given-name term with `am.by_given` and the family term with `am.by_family`; `person-duplicate.ts:136-152`, the module that calls itself the one duplicate check, matches **either** term against any alias. Folding the two (G10-08) makes the invite screen show the canonical list, which is a wider list. Screens: `/operate/admin/operators/new` and `/operate/people/new`. A rewrite cannot decide whether the invite screen should surface the people the canonical check surfaces, because that changes who an administrator is shown before creating a second Person record.
2. **One sentence or two for one refusal?** The same condition is worded differently in the two halves of this section: an unparseable start date reads "Enter the date as a calendar date, for example 2026-09-01." (`operator-administration/shared.ts:64`) and "That start date is not a date. Give the day the role begins, or leave it blank for today." (`operator-invitations/shared.ts:98-99`); a missing callback URL reads "This is a configuration problem rather than something you did — tell whoever runs the deployment." (`operator-administration/shared.ts:102-104`) and "Set APP_BASE_URL and try again." (`operator-invitations/shared.ts:105-107`); an unknown role, a merged person and a missing backdating reason each have two wordings too. `docs/ux/standards.md` rule 7 says a fact shown on more than one surface says the same thing. G10-01 keeps both strings, because choosing one changes what an administrator reads. Screens: the invite form and the role/operator action panels.
3. **Is reading a past committee year's holders a feature?** `operator-administration/role-detail.ts:58-78` accepts `options.cycleId` and returns `readOnly: true` for an earlier cycle, and `operator-administration.test.ts:2314-2329` proves it works. No route passes it, no link reaches it, and the workflow map's eight M1 workflows do not include it. G10-05 deletes it. The alternative is to keep a 40-line reader and give it a route — which is new UX, not a simplification.
4. **Does `permissionsLine` describe a seat anywhere?** `admin/presentation.ts:200-203` produces the full "Can …" sentence and has no caller outside `presentation.test.ts`; the Roles index uses `permissionsPreview` (truncated at three phrases, `:214-222`) and role detail renders the items as bullets (`roles/[roleId]/page.tsx:91-98`). Deleting it is safe, but `presentation.test.ts:534` uses it as the oracle for "a short summary is not truncated". If the full sentence is wanted on a surface, it is a UX addition; if not, the test asserts `permissionsPreview` against `permissionsSummary` directly.

### Not proposed

- `admin/history.tsx` (60) — a `RowCardList` of `RowCard`s with a computed subline list; there is nothing under it to remove.
- `admin/page-heading.tsx` (55) — 24 of its lines are an inline SVG, and `:35` records why (`@mui/icons-material` for one 16px mark is a dependency change out of proportion). Keeping a recorded decision.
- `audit.ts` (82) — one insert, three refusals that mirror the table's own constraints, and a UUIDv5 `node:crypto` does not provide. Three modules outside this section use `deriveEntityIdFromNaturalKey`.
- `operator-invitations/subject.ts` (19) and `account-read.ts` (60) — one query and one row mapper each, both already single-purpose; they move into the core (G10-01) without shrinking.
- `operator-account-state.ts` (88) — 40 of its lines are the five states' club-facing descriptions, rendered on operator detail and in the administration guide. Only `isOperatorAccountState` (`:100-104`) goes.
- The five operating-year resolvers in `cycles.ts` keep their five distinct refusal sentences; only the query shape and the widening are shared.
- Carve-outs read for context, proposed nothing in: `src/lib/auth/administration-authority.ts` (the authority model every write in this section asserts against), `src/lib/auth/capabilities.ts` (`roleLabel`, `capabilityRoleCodes`, `describeRoleCapabilities` — the capability map that forbids naming a `roles.code` in TypeScript), `src/lib/auth/guards.ts`, `src/lib/db/errors.ts`, `src/lib/supabase/{admin,stateless}.ts`.
- Outside this section but touched by its proposals, so the Lead should reconcile: `src/lib/services/person-duplicate.ts` (+35, G10-08), `src/lib/club-time.ts` (+22, the three-shape formatters), `src/components/{field,candidate-row}.tsx` (kit changes), and `src/app/design-preview/(operator)/{operator,operators}/page.tsx`, which render copies of this section's two surfaces from the same presentation module and will shrink with `RecordTable`.

---

## G11 — Messaging rules administration, the operator guide, the Monday report

Lines now: 4095. Lines after everything proposed: 2979. Saved: 1116 (27%).

### Files read

All 33 files in the brief. Also read for context, not proposed in: the kit members
these routes use (`src/components/section.tsx`, `field.tsx`, `row-card.tsx`,
`sortable-header.tsx`, `outcome-slot.tsx`, `metric.tsx`, `action-bar.tsx`),
`src/app/operate/admin/action-state.ts`, `src/app/operate/admin/page-heading.tsx`,
`src/app/operate/unavailable.tsx`, `src/app/operate/labels.ts`,
`src/lib/club-time.ts`, `src/app/operate/roster/board-columns.ts`,
`src/app/design-preview/(operator)/report/report-preview.tsx`, and the tests named
below.

### Modules

| Module or surface                                                                                                                                | Lines now | What it does                                                                                                                                       | Proposed shape                                                                                                      | Lines after | Tests that prove it                                                                                                                                      | Risk, and how it is caught                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messaging admin — the editable rows (`admin/messaging/schedule-row.tsx` 277, `schedule-form.tsx` 236, `use-result-cleared-by-editing.ts` 9)      |       522 | Four row components, each a form + `Section` + number fields + `ActionBar` + `Outcome`; two of them 95 % identical                                 | rewrite as one `SettingRow` fed a field-group descriptor (G11-01)                                                   |         275 | `admin/messaging/screens.test.tsx` (718 lines, every row, unit, helper text, hidden field, per-row outcome)                                              | A row loses a unit, a helper text, its own `data-testid` or its own form; screens.test.tsx asserts each by testid, and the 375px/desktop pair shows the grid columns |
| Messaging admin — validation (`validation.ts` 202, `cycle-validation.ts` 60, `onboarding-chase-validation.ts` 58) and actions (`actions.ts` 162) |       482 | Three hand-written blank/integer/bounds loops, and three actions that each re-do capability → read → compare → write → revalidate → notice/refusal | rewrite as one bounded-integer reader plus one save pipeline; the field tables stay verbatim (G11-02)               |         337 | `validation.test.ts`, `onboarding-chase-validation.test.ts`, `actions.test.ts` (642 lines: refusal, no-change, named-row failure, atomic two-step write) | A refusal sentence changes wording, or an unchanged submission starts writing an audit row; the three test files assert both message text and `audit` row counts     |
| Report grids (`chase-grid.tsx` 187, `onboarding.tsx` 148, `report-section.tsx` 97)                                                               |       432 | Two sortable person-by-column grids written twice, plus a local sort-header copy                                                                   | rewrite as one `PersonGrid` over a column descriptor; `SortHeader` deleted for the kit's `SortableHeader` (G11-03)  |         295 | `report/screens.test.tsx` lines 499–626, 699–749 (sub-columns, sort links, `aria-sort`, counts, independence of the two sorts)                           | Sort direction or the two-sub-column head could change; `aria-sort`, `data-sort` and the href pairs are asserted, and the grid is in the 375px pair                  |
| Guide copy (`admin/guide/content.ts`)                                                                                                            |       396 | The nine questions and answers, as nested run arrays                                                                                               | rewrite as one string per block with `**bold**` markers and a 14-line parser (G11-04)                               |         265 | `guide/content.test.ts` (241 lines; asserts over `guideText()`), `guide/screens.test.tsx`                                                                | The flattened text or a bold run changes; `content.test.ts` compares the whole flattened string, `screens.test.tsx` the rendered disclosures                         |
| `weekly-report/compute.ts`                                                                                                                       |       436 | Eleven queries and their hand-written row interfaces and mappers, composed into the stored snapshot                                                | rewrite with camelCase column aliases and one tally query (G11-05)                                                  |         335 | `src/lib/services/weekly-report.test.ts` (1515 lines), `tests/pilot-scenario-lan-81.test.ts` (588)                                                       | A column alias typo yields `undefined` in the stored snapshot; the service test asserts every field of `lastWeek`, `grid`, `onboarding`, `attendance`                |
| `messaging-schedule/freeze.ts` 165, `schedule.ts` 169                                                                                            |       334 | Freeze writes 20 columns named twice; both files declare a row interface and a field-by-field mapper                                               | rewrite: one `upsertColumns` helper and column aliases (G11-06)                                                     |         250 | `src/lib/services/messaging-schedule.test.ts` (668 lines, incl. the reschedule upsert), `tests/slice-walkthrough.test.ts`                                | An alias or an `excluded.` pair dropped on the upsert path; the messaging-schedule test reads the frozen plan back after approval and after a reschedule             |
| Presentation copy and formatting (`admin/messaging/presentation.ts` 155, `report/presentation.ts` 112)                                           |       267 | Club words, plus four Intl formatters per file built part by part, plus a preview warning nothing renders                                          | rewrite: delete the dead warning, take instants from one shared `formatWhen` (G11-07)                               |         185 | `admin/messaging/presentation.test.ts`, `report/screens.test.tsx` date assertions                                                                        | A formatted string changes by a comma; presentation.test.ts pins `formatScheduleWhen` exactly and screens.test.tsx pins "Wed 14 Oct" forms                           |
| Service barrels (`weekly-report/index.ts` 25, `messaging-schedule/index.ts` 17)                                                                  |        42 | Re-export only; no declaration of their own                                                                                                        | delete because the siblings are the surface: importers take `./compute`, `./read`, `./plan`                         |           0 | every test that imports the barrel path                                                                                                                  | Only import paths move; `npm run typecheck` is the whole proof                                                                                                       |
| `weekly-report/read.ts`                                                                                                                          |       127 | Four readers over one `STORED_SELECT`, each with the same `withTransaction` + season + map                                                         | fold into one `readStored(where, params)` plus thin callers                                                         |          95 | `weekly-report.test.ts` 1320–1510 (reuse, supersede, earlier-definition rows)                                                                            | Reuse condition on `metricDefinitionVersion` could drift; the test files a stale-version row and asserts it is never reused                                          |
| Report people lists (`availability.tsx` 38, `walk-ups-recruitment.tsx` 59)                                                                       |        97 | Three copies of `ReportSection` + `RowCardList` + `Row`                                                                                            | fold into one `PeopleSection` fed entries                                                                           |          65 | `report/screens.test.tsx` 659–698                                                                                                                        | A badge domain or a subline separator changes; each section is asserted by testid and text                                                                           |
| Messaging admin page (`admin/messaging/page.tsx`)                                                                                                |        74 | Loads three services, then copies every schedule field into a string-keyed `values` record                                                         | fold: hand the row component the `MessagingSchedule` itself; the record is an indirection with no reader of its own |          50 | `admin/messaging/screens.test.tsx` 289–330                                                                                                               | Default values could shift by one field; every field's value is asserted on the rendered row                                                                         |
| Report frame (`report/page.tsx` 82, `report-body.tsx` 38, `report-date-form.tsx` 49)                                                             |       169 | Gate, query parsing, file-on-press, then eight sections                                                                                            | keep, minus the duplicate date regex (`page.tsx:98` restates `shared.ts:175`) and the hand-built unavailable screen |         150 | `report/screens.test.tsx` 293–396, 877–895                                                                                                               | Filing on arrival rather than on press would be a behaviour change; four tests count `weekly_reports` rows per kind of visit                                         |
| Report tables and cards (`last-week.tsx` 97, `next-week.tsx` 62, `week-in-numbers.tsx` 32)                                                       |       191 | The seven-column event table, the upcoming cards, the metric rows                                                                                  | keep — each is one table or one kit call per value already                                                          |         175 | `report/screens.test.tsx` 443–498, 627–658                                                                                                               | Minimal; turnout and "no register" are asserted directly                                                                                                             |
| `messaging-schedule/plan.ts`                                                                                                                     |       184 | The ladder arithmetic and the settings page's worked example                                                                                       | keep; trim only `listMessagingSchedulesWithPreview`'s per-row loop                                                  |         175 | `messaging-schedule.test.ts` 1–548                                                                                                                       | Re-deriving instants in one query must keep PostgreSQL as the clock; the test asserts every rung instant                                                             |
| `weekly-report/shared.ts`                                                                                                                        |       177 | The snapshot's type contract, the window helpers, the lock                                                                                         | keep — 130 of the 177 lines are the stored JSON contract, which is the product                                      |         170 | `weekly-report.test.ts` window and `normaliseReportDate` cases                                                                                           | None beyond the two date helpers                                                                                                                                     |
| `weekly-report/write.ts`                                                                                                                         |        77 | Allocates the version, computes, inserts, audits                                                                                                   | keep — already one pass per responsibility                                                                          |          72 | `weekly-report.test.ts` 1120–1300                                                                                                                        | Version allocation race is held by the advisory lock; unchanged                                                                                                      |
| Guide rendering (`guide-faq.tsx` 73, `admin/guide/page.tsx` 15)                                                                                  |        88 | Native disclosures over the content tree                                                                                                           | keep — it is `Section` plus two 20-line renderers                                                                   |          85 | `guide/screens.test.tsx`                                                                                                                                 | None                                                                                                                                                                 |

### Proposals

#### G11-01 — One `SettingRow` for the messaging schedule's four row shapes (saves ~247)

- Now: `schedule-row.tsx:74-179` (`ScheduleRow`) and `schedule-row.tsx:185-321`
  (`RecruitmentScheduleRow`) are the same component. Both open with the same five
  lines of `useActionState` + `useOutcomeSlot` + `useResultClearedByEditing`
  (`:76-82`, `:186-193`), the same `Box component="form"` with the same four props
  (`:85-91`, `:195-202`), the same `Section` + hidden `templateId` (`:92-93`,
  `:203-204`), the same two three-column grids over `TIMING_FIELDS` and
  `LADDER_FIELDS` (`:98-130`, `:215-247`), the same `ActionBar` (`:132-139`,
  `:275-282`), the same `AdminOutcome` (`:141`, `:284`), the same toggle button
  (`:143-153`, `:286-296`) and the same 20-line preview disclosure (`:155-174`,
  `:298-316`). The only difference is the two audience headings and the
  recruit-field group (`:249-273`). `schedule-form.tsx:129-205` (`CycleStepRow`)
  and `:211-273` (`OnboardingChaseRow`) repeat the same frame a third and fourth
  time, differing only in action, field list, save label and testid.
- Smallest honest shape: one client component in the route,
  `src/app/operate/admin/messaging/setting-row.tsx`:

```tsx
export function SettingRow({
  action,
  panel,
  testId,
  title,
  titleTestId,
  hidden,
  groups,
  saveLabel,
  example,
}: {
  action: (s: AdminActionState, f: FormData) => Promise<AdminActionState>;
  panel: string;
  testId: string;
  title: string;
  titleTestId: string;
  hidden?: readonly [string, string][];
  groups: readonly {
    heading?: string;
    layout: "grid3" | "wrap";
    fields: readonly NumberFieldSpec[];
  }[];
  saveLabel: string;
  example?: SchedulePreview;
});
```

with one `NumberField` (`name`, `id`, `label`, `helperText`, `unit`, `min`,
`max`, `defaultValue`) replacing `ScheduleField` (`schedule-row.tsx:40-68`) and
the two inline `Field` blocks at `schedule-form.tsx:170-185` and `:235-254`. The
Recruitment row becomes the same call with a third group; the two audience
headings become `groups[n].heading`.

- Behaviour held by: `admin/messaging/screens.test.tsx` — one form per row
  (`:412-449`), units and short labels (`:367-394`), helper texts (`:395-411`),
  the Recruits group and its missing President field (`:548-629`), the per-row
  result clearing (`:630-720`), the example closed by default (`:310-329`). Nothing
  pins the `sx` values (grid gaps, `minWidth: 200`, `flex: "0 1 240px"`); those
  ride on the desktop/375px screenshot pair alone.
- Lines: 522 → 275, because one ~95-line component plus one ~20-line field and
  four descriptors of 12–25 lines replaces four 60–137-line components, and the
  preview disclosure is written once instead of twice.
- Risk: a row silently losing its own `data-testid` or its hidden `templateId`
  would make one row's save post another row's values. Caught by
  `screens.test.tsx:434` ("scopes each row's hidden template to its own form") and
  by the per-row outcome tests at `:694`.
- Repointed tests: none expected — every assertion is by testid, label or text,
  none by component name.
- New dependency: none.

#### G11-02 — One parse-then-save pipeline for the three settings forms (saves ~145)

- Now: three validators repeat the same three-branch loop verbatim —
  `validation.ts:130-152` and again `:170-192` for the recruit fields,
  `cycle-validation.ts:48-71`, `onboarding-chase-validation.ts:33-49`. Each reads
  `formData.get(key)`, refuses blank, refuses non-integer, refuses out of bounds,
  with the same sentence skeleton and a different subject phrase. Three actions
  then repeat the same seven steps: `actions.ts:41-92`, `:102-153`, `:162-195` —
  `requireCapability`, read a hidden key, validate, `withTransaction(read →
compare → write)`, `revalidatePath("/operate/admin/messaging")`,
  `notice ?? NO_SCHEDULE_CHANGES_NOTICE`, and a catch that maps `not_permitted`
  to `refusal` and everything else to a named failure sentence. Eighteen of
  actions.ts's lines are `{ ...EMPTY_ADMIN_ACTION_STATE, … }` literals.
- Smallest honest shape: two helpers.
  `src/lib/forms/bounded-integers.ts` (new, ~32 lines, named so other sections can
  reuse it):

```ts
export function readBoundedIntegers<K extends string>(
  formData: FormData,
  fields: readonly { key: string; out: K; min: number; max: number }[],
  subject: (field: { key: string; min: number; max: number }) => string,
  suffix = "",
): { ok: true; values: Record<K, number> } | { ok: false; message: string };
```

`subject` supplies `"${label}: ${fullLabel.toLowerCase()}"`,
`"${label}: the timing field"` and `"${field.label}: this field"` respectively,
and `suffix` supplies the cycle table's `" hours"`, so all three message sets
come out byte-identical. And
`src/app/operate/admin/save-action.ts` (new, ~45 lines): `saveAdminSetting({
  capability, path, parse, apply, saved, failed })` returning an
`AdminActionState`, where `apply` returns `false` for "nothing had changed".
`scheduleChanged` (`validation.ts:211-227`) collapses to
`SCHEDULE_FIELDS.some((f) => current[f.field] !== proposed[f.field])` plus the
two recruit clauses.

- Behaviour held by: `validation.test.ts:38-197` (each refusal sentence, the
  invitation-precedes-deadline rule, the recruit fields on that row alone),
  `onboarding-chase-validation.test.ts`, `actions.test.ts:251-470` (refused before
  the write and writes nothing; no-change writes nothing; the named-row failure
  sentence; both cycle steps atomically). The `revalidatePath` call itself is
  pinned by no test.
- Lines: 482 → 337, because the three loops (~105 lines) become three `subject`
  closures over one helper, and the three actions (~150 lines of body) become
  three ~20-line descriptors over one pipeline. The 83 lines of field tables in
  `validation.ts:32-117` and the bounds tables in the other two files stay
  verbatim — they are the club's labels, units and limits.
- Risk: the refusal sentences are the behaviour. A subject phrase assembled one
  space differently changes what the operator reads.
  `validation.test.ts:47`, `:56`, `:121` and
  `onboarding-chase-validation.test.ts` assert the exact strings; the
  invariant message at `validation.ts:157-164` stays hand-written rather than
  going through the helper.
- Repointed tests: none. If the Lead prefers the save helper in
  `src/app/operate/admin/`, another admin section may already propose an
  equivalent — count its 45 lines once.
- New dependency: none. A schema library (zod) would read these three forms in
  fewer lines still, but it cannot produce these sentences without a message map
  per field, which is where the lines already are.

#### G11-03 — One `PersonGrid` for the attendance and onboarding grids (saves ~137)

- Now: `chase-grid.tsx:30-155` and `onboarding.tsx:31-149` are the same grid.
  Identical `link` and `direction` closures differing only in the query-parameter
  names (`chase-grid.tsx:41-48` vs `onboarding.tsx:40-47`); identical person
  column with a sort header (`:63-69` vs `:61-63`); identical right-hand
  sortable count column (`:83-94` vs `:83-93`); identical "emphasise when
  everything is wrong" cell (`:134-147` vs `:128-141`); and
  `sortRows`/`sortOnboarding` (`chase-grid.tsx:200-211`,
  `onboarding.tsx:152-164`) are one function over a different pair of accessors.
  On top of that, `report-section.tsx:49-73` hand-writes `SortHeader` — a local
  copy of the kit's `SortableHeader` (`src/components/sortable-header.tsx:13-45`),
  which already carries `sortDirection` (hence `aria-sort`), `data-sort` and
  `scroll={false}`.
- Smallest honest shape: `src/app/operate/report/person-grid.tsx` (~115 lines) —

```tsx
export function PersonGrid<R>({
  testId,
  headline,
  empty,
  span,
  sortKeys,
  sort,
  reportOn,
  columns,
  rows,
  total,
}: {
  sortKeys: { by: string; dir: string }; // "sort"/"dir" or "osort"/"odir"
  columns: readonly { key: string; label: string; caption?: string }[];
  rows: readonly {
    person: string;
    badge?: ReactNode;
    share: number;
    of: number;
    cells: readonly (readonly GridValue[])[];
  }[]; // 1 or 2 values per column
  total: { label: string };
});
```

with `byShareThenCount(rows, sort)` as the one ordering function. `chase-grid.tsx`
becomes the cell mapping plus `CellValue` (~55 lines), `onboarding.tsx` the cell
mapping plus its chip (~45), and `SortHeader` and both `direction` closures go.

- Behaviour held by: `report/screens.test.tsx:514` (two sub-columns per event),
  `:568`, `:576`, `:585`, `:601` (the count, the proportional order, the reversal,
  the order as links), `:618` (column head and date), `:699-749` (onboarding's own
  columns, counts, emphasis and independent sort).
- Lines: 432 → 295, because one generic grid plus two cell mappings replaces two
  full tables, and the kit absorbs the local sort header.
- Risk: the colSpan=2 double header is the attendance grid's own shape; a generic
  grid that flattened it would change the table. `screens.test.tsx:514` asserts
  the sub-columns, `:618` the paired head, and the desktop/375px pair shows the
  sideways scroll documented in `docs/operating-the-slice.md` § 11.
- Repointed tests: none by name. Moving to the kit's `SortableHeader` renders a
  `TableSortLabel` arrow inside the heading link where the local copy rendered a
  bare `Button`; that is a visible change to the grid heads and needs Brian's
  screenshot pair, or the local style passed through as the kit member's `label`.
- New dependency: none.

#### G11-04 — The guide's copy as marked-up strings, not run arrays (saves ~131)

- Now: `admin/guide/content.ts` is 396 code lines for nine questions. 128 of them
  are bracket-only lines and 66 more are `id:`/`question:`/`answer:`/`steps(`
  openers; the copy itself is wrapped prose. Every bold label costs a separate
  array element and often its own line — `content.ts:88-93` spends six lines on
  one sentence, `:291-295` five on another.
- Smallest honest shape: one string per block, `**…**` for a label, and a parser
  in `guide-faq.tsx`:

```ts
const runs = (text: string): GuideRun[] =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? { strong: part } : part));
```

with the content as `["invite", "How do I invite someone?", [
  ["steps", `Open Operators and choose **${action.invite}**, at the top right.`,
  …]]]`. `guideText()` (`content.ts:418-428`) then strips `**` instead of
flattening runs, and `GuideRun`/`GuideBlock` keep their current shapes behind
the parser so `guide-faq.tsx` barely changes.

- Behaviour held by: `guide/content.test.ts` (241 lines) asserts the no-SQL,
  no-callout prohibitions and the state labels over the flattened whole;
  `guide/screens.test.tsx` asserts the rendered questions, the first one open, and
  the bold labels.
- Lines: 396 → 265, because ~128 bracket-only lines disappear into template
  strings and the parser costs 14 once. The words themselves are untouched — this
  is an encoding change, not a copy change.
- Risk: a `**` left unclosed would render literal asterisks, and a label that
  currently comes from `ADMINISTRATION_ACTION_LABELS` or `stateLabel()` must stay
  interpolated rather than retyped (`content.ts:51-54` is the single source).
  `content.test.ts` compares the flattened text; an interpolation turned into a
  literal would pass it and fail only on the guide's screenshot, so the rewrite
  must keep every `${action.…}`/`${stateLabel(…)}` call.
- Repointed tests: none, if `guideText()` keeps its signature and output.
- New dependency: none. No Markdown library — the only markup is bold.

#### G11-05 — `compute.ts`: alias the columns, and count in one query (saves ~101)

- Now: `compute.ts:23-98` declares nine row interfaces whose only job is to type a
  query result that is then copied field by field into a type already declared in
  `shared.ts` — `UpcomingRow` (`:72-81`) against `UpcomingEvent`
  (`shared.ts:78-87`), mapped at `:468-477`; `AvailabilityRow` (`:58-63`) mapped
  at `:462-467`; `RecruitmentRow` (`:65-70`) mapped at `:479-484`. Three separate
  queries count three things per event — `breakdown` (`:139-147`), `silent`
  (`:150-157`), `presence` (`:159-167`) — each followed by its own linear-scan
  accessor (`:199-204`, `:221`).
- Smallest honest shape: alias in SQL to the snapshot's own field names
  (`e.event_type::text as "eventType"`, `count(*)::int as invited`), type the
  query as the content type, and return `upcoming.rows` with one spread for the
  date columns: `upcoming.rows.map((row) => ({ ...row, on: asDate(row.on) }))`.
  `asDate` stays where the column is not a plain `date`
  (`current_availability.effective_from`). Then one tally query —
  `select event_id, 'rsvp:' || response_state as key, count(*) … union all
select event_id, 'presence:' || presence … union all select event_id,
'silent' …` — read through one `Map<string, number>` keyed
  `` `${eventId}|${key}` ``, replacing three scans with three lookups.
- Behaviour held by: `src/lib/services/weekly-report.test.ts` (1515 lines) asserts
  every field of `lastWeek`, the grid's pairing and determinism, the onboarding
  rows and the two summaries; `tests/pilot-scenario-lan-81.test.ts` (588 lines)
  and `tests/slice-walkthrough.test.ts:1480-1560` assert the filed snapshot.
- Lines: 436 → 335, because ~55 of the 70 interface lines and ~30 mapper lines go,
  the three count queries become one, and the aliases ride on lines that already
  exist. Also three fewer round trips per report on a page that serially awaits
  eleven queries — LAN-227 owns speed; this is a by-product.
- Risk: a mis-typed alias gives `undefined` in an immutable filed snapshot, which
  cannot be corrected after the fact. Caught by the service test, which asserts
  each field by name, and by `parseReportContent`'s schema guard only for the four
  fields it checks (`read.ts:144-152`) — the rest rest on the test.
- Repointed tests: none; the stored JSON is unchanged.
- New dependency: none. Do not add a snake/camel mapper library: the aliases are
  free and explicit.

#### G11-06 — Stop writing column lists twice in the schedule service (saves ~84)

- Now: `freeze.ts:47-98` names 20 columns in the insert list and then 19 of them
  again in `do update set x = excluded.x`; `freeze.ts:102-126` declares a 25-field
  inline row type, and `:147-179` maps all 25 by hand into `FrozenMessagingPlan`.
  `schedule.ts:29-41` + `:47-60` + `:62-77` is the same column list three times
  (SQL, row interface, mapper).
- Smallest honest shape: one ~14-line helper `src/lib/services/upsert.ts` —
  `upsertText(table, columns, conflict, keep?)` returning the
  `(cols) values ($1..$n) on conflict (k) do update set …` text from one array —
  and column aliases in both selects (`s.rsvp_by_days as "rsvpByDays"`) so
  `toSchedule` and the frozen-plan mapper shrink to the three shaped parts
  (`schedule`, `recruitLadder`, dates).
- Behaviour held by: `src/lib/services/messaging-schedule.test.ts` (668 lines)
  freezes a plan at approval, re-reads it, and re-freezes it on a reschedule;
  `tests/slice-walkthrough.test.ts` approves and reads the plan back;
  `tests/service-layer-audit.test.ts` pins the audit row that
  `updateMessagingScheduleIn` writes (`schedule.ts:191-197`).
- Lines: 334 → 250 (freeze 165 → 96, schedule 169 → 140, helper 14 new), because
  each column is named once in the SQL and nowhere else.
- Risk: a column left out of the generated `excluded` set would make W8's
  reschedule silently keep a stale instant. The reschedule test reads every
  frozen field back after the second freeze; `tests/schema-invariants.test.ts`
  holds the table's shape.
- Repointed tests: none.
- New dependency: none.

#### G11-07 — Delete the unrendered warning; take instants from one formatter (saves ~82)

- Now: `admin/messaging/presentation.ts:106-197` computes
  `SchedulePreview.warning` — a late-approval sentence and a gap-before-deadline
  sentence, ~25 lines including `HOUR_MS` — and **nothing renders it**. The
  callout was removed by OWNER-LAN171-07 round 3 (`schedule-row.tsx:172`), and
  `screens.test.tsx:362` asserts the element is absent. Separately,
  `presentation.ts:90-104` and `report/presentation.ts:92-149` each build four or
  five `Intl.DateTimeFormat` calls part by part, and `report/presentation.ts:142`
  re-declares `todayInClubZone`, which `src/lib/club-time.ts:12` already exports;
  `design-preview/(operator)/report/page.tsx:9` imports the route's copy rather
  than the library's. Twenty files under `src/` build their own Intl formatter.
- Smallest honest shape: delete `warning`, the `lateApproval` branch and
  `HOUR_MS` from the preview; delete the route's `todayInClubZone` and import
  `@/lib/club-time`; and add one `formatWhen(value, shape)` to
  `src/lib/club-time.ts` with a fixed shape table (`longDate`, `shortDay`,
  `span`, `instant`, `scheduleWhen`) that the two presentation files call instead
  of assembling parts. The shared helper's ~35 lines land in `club-time.ts`,
  which is not in this section's table — count them once, in that file's section.
- Behaviour held by: `admin/messaging/presentation.test.ts:46-52` pins
  `formatScheduleWhen`'s exact output; `report/screens.test.tsx` pins
  "Wed 14 Oct", the long reporting date and the span; `screens.test.tsx:330-366`
  pins that no warning is ever drawn.
- Lines: 267 → 185 in this section (messaging presentation 155 → 115, report
  presentation 112 → 70), plus ~35 in `club-time.ts`.
- Risk: every one of these strings is club copy. A shape table that changes one
  separator changes what Brian reads. The two tests above assert the exact
  strings; anything they do not assert (the span's en dash) shows in the
  screenshot pair.
- Repointed tests: `presentation.test.ts:86`, `:119`, `:140`, `:146` assert the
  deleted `warning`. They cannot be repointed — the value will not exist. They
  test code no rendered surface reaches, so they go with it; that deletion needs
  the Lead's nod, since the brief forbids deleting tests.
- New dependency: none.

### Kit

- Pieces routes in this section write themselves that are already a kit member:
  - `src/app/operate/report/report-section.tsx:49-73` (`SortHeader`) →
    `src/components/sortable-header.tsx` `SortableHeader`. The kit member already
    carries `sortDirection`/`aria-sort`, `data-sort` and `scroll={false}`; the
    route also hand-writes `aria-sort` on the enclosing `TableCell`
    (`chase-grid.tsx:66`, `:87`; `onboarding.tsx:61`, `:86`).
  - `src/app/operate/report/presentation.ts:54` (`NOT_RECORDED = "—"`) →
    `src/components/fact.tsx` `NOT_RECORDED`, the same glyph declared twice.
  - `src/app/operate/report/presentation.ts:142` (`todayInClubZone`) →
    `src/lib/club-time.ts:12`, the same function declared twice.
- Pieces two or more routes write that should become one component:
  - `schedule-row.tsx:40-68`, `schedule-form.tsx:170-185`, `:235-254` → one
    `NumberField` (label, unit adornment, min/max/step, helper text). Only this
    route uses `InputAdornment` today, so its home is
    `src/app/operate/admin/messaging/setting-row.tsx`, not the kit — until a
    second route needs a unit-suffixed number, at which point it moves to
    `src/components/field.tsx` beside `Field`.
  - `chase-grid.tsx` + `onboarding.tsx` → `src/app/operate/report/person-grid.tsx`
    (G11-03). One route renders it, so it is a sibling, not a kit member.
  - `availability.tsx` + `walk-ups-recruitment.tsx` →
    `src/app/operate/report/people-section.tsx`, same reasoning.
  - `src/app/operate/report/page.tsx:47-61` and
    `src/app/operate/admin/messaging/page.tsx:23-64` are the same
    load-or-show-unavailable dance with `let` declarations typed by
    `Awaited<ReturnType<…>>`. One `loadOrUnavailable(fn, screen)` in
    `src/app/operate/` would absorb both and the other eight call sites of
    `UnavailableScreen`; its ~12 lines belong to whichever section owns
    `src/app/operate/unavailable.tsx`.
- Kit members this section needs changed to absorb a local copy: none. `Section`,
  `ActionBar`, `Outcome`, `RowCard`/`RowCardList`, `Metric`/`MetricRow`,
  `TableFrame`, `StatusChip` and `EmptyState` are all used as they are. There is
  no table-plus-phone-card duplication in this section: the report's three tables
  scroll sideways inside `TableFrame` by decision
  (`docs/operating-the-slice.md` § 11), and no hand-built card list mirrors them.

### Product questions

1. **The same availability level is labelled two ways.** The Monday report calls
   green/orange/red "Active / Limited / Unavailable"
   (`src/app/operate/report/presentation.ts:81-85`, marked "only the label is the
   wireframe's — UX-81"); the roster calls them "Green / Orange / Red"
   (`src/app/operate/roster/board-columns.ts:93-97`). Two screens answer the same
   question in different words, so the two label tables cannot be merged into one
   vocabulary without choosing whose words are the club's.
2. **A second Monday report exists.**
   `src/app/design-preview/(operator)/report/report-preview.tsx` is 708 lines that
   re-render this section's whole report from the same service and the same
   presentation constants, and it differs on purpose: it uses the kit's
   `SortableHeader` where `/operate/report` uses its own, and an MUI `Tooltip` for
   a decline reason where `/operate/report` uses a native `title`
   (`chase-grid.tsx:157-193`). Since LAN-231–235 applied the design to the real
   application, either `/design-preview/report` should render `ReportBody` (about
   650 lines go, and the two surfaces stop being able to disagree) or the preview
   is still wanted as a separate drawing. `src/app/design-preview/README.md` says
   the branch was "never to be merged", yet the tree is on `main`. Not this
   section's files; it is this section's duplicate.
3. **The worked example's warning.** `presentation.ts:169-188` still computes the
   gap-before-deadline and late-approval warnings that OWNER-LAN171-07 round 3
   removed from the screen. Delete the computation and the three test assertions
   that are its only readers, or is the warning meant to come back somewhere?
4. **Three filed-snapshot readers no route reaches.** `readCurrentReport`
   (`read.ts:105`), `listReportVersions` (`read.ts:121`) and `readStoredReport`
   (`read.ts:134`) are called only from `weekly-report.test.ts` and
   `tests/slice-walkthrough.test.ts`; `write.ts:80` claims "the pilot scripts and
   the tests use this" for `generateWeeklyReport`, and no script under
   `scripts/` references it. Keep them as the snapshot-history surface, or delete
   them with the tests that are their only callers?
5. **The guide is in no workflow row.** `docs/tester-week/workflow-map.md` has no
   row for `/operate/admin/guide`, and `/operate/report` appears only in the
   refusal row (`workflow-map.md:15`). The guide is 484 lines — 12 % of this
   section — for a surface the map does not walk. G11-04 re-encodes it without
   cutting a word; whether nine questions are still the right length for
   `REQ-club-operating-guide` is Brian's, not a rewrite's.

### Not proposed

- `messaging-schedule/plan.ts` (184) — the ladder arithmetic is the product rule
  (`REQ-count-forward`, `REQ-late-approval`, `REQ-two-ladders`) and is already one
  pass with no duplication. The one trim:
  `listMessagingSchedulesWithPreview:214-232` loops the schedules and issues two
  queries per row (a schedule read inside `resolveMessagingPlanIn:91` plus the
  instants select), so the settings page costs 2N+1 round trips; one instants
  query over all templates would save ~9 lines and most of the trips.
- `weekly-report/shared.ts` (177) — 130 lines are the stored snapshot's type
  contract, which is the filed record's shape; `asDate`/`utcDay`/`asIso` are three
  four-line functions with real distinctions (`asDate` reads a driver `Date` with
  local getters, `utcDay` reads an instant this module built). Leave both
  alone; the `asDate` hazard recorded against LAN-127 is a behaviour question, not
  a size one.
- `weekly-report/write.ts` (77) — one insert, one audit row, one version
  allocation under the caller's advisory lock. Nothing repeats.
- `report/last-week.tsx` (97), `next-week.tsx` (62), `week-in-numbers.tsx` (32) —
  each is a single table or a row of kit calls; `EventRow`'s first cell carries
  the flags (`last-week.tsx:60-62`) and the "no register" distinction
  (`:94-102`), both of which are product rules worth their lines.
- `use-result-cleared-by-editing.ts` (9) — two `useState` lines that four rows
  share. Already minimal; it stays a file so the rewritten `SettingRow` can import
  it.
- `guide-faq.tsx` (73) — `Section` plus two small renderers; `AnswerBlock`'s list
  `sx` block exists because Tailwind's preflight resets `list-style`
  (`:50`), which is a real constraint, not decoration.
- Turnout above 100 % for an event with a walk-up
  (`compute.ts:229-232`, recorded in `docs/operating-the-slice.md` § 14) is a
  known defect with its own ticket. Every proposal here preserves it exactly.
- Carve-outs read for context only, nothing proposed in them:
  `src/lib/db` (`withTransaction`, `ConstraintViolated`, `isServiceError`, the
  `Tx` shape every service in this section writes against),
  `src/lib/auth/guards` (`requireCapability` in all three actions), and
  `src/lib/services/messaging-scheduler.ts` (the dispatcher that consumes the
  frozen plans this section writes).

---

## G12 — The component kit, the theme and brand, and the design-preview routes

Lines now: 6939. Lines after everything proposed: 2375. Saved: 4564 (66%).

Almost all of that is one deletion. The kit itself is the only part of this
section that is close to its floor: 26 component files hold 2133 code lines,
every one of them is reached by live routes, and the honest saving inside them
is 139 lines. The 4515 lines under `src/app/design-preview/` are a finished
proposal that was merged against its own written instruction and now renders a
design that shipped nine months of tickets ago.

### Files read

All 56 files in the brief.

### Modules

| Module or surface                                                                                                                                                                   | Lines now | What it does                                                                                      | Proposed shape                                                                                                                                      | Lines after | Tests that prove it                                                                                                       | Risk, and how it is caught                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `design-preview/(operator)/` event mockups (`event/page.tsx`, `event-preview.tsx`, `participation-preview.tsx`, `event-new/page.tsx`, `event-form-preview.tsx`)                     |       965 | Hand-rebuilt copies of `/operate/events/[id]` and `/operate/events/new`, drawn not wired          | delete because the design they proposed shipped in LAN-231–235 and nothing imports them                                                             |           0 | none — no test in `src/` or `tests/` names `design-preview`                                                               | A bookmarked URL 404s; `npm run build` proves the remaining routes compile                                                |
| `design-preview/(operator)/report/` (`page.tsx`, `report-date-preview.tsx`, `report-preview.tsx`)                                                                                   |       758 | A second whole Monday report, with its own `sortRows`, `sortOnboarding`, `CellValue`, `ChaseGrid` | delete because every one of those four functions exists again in `src/app/operate/report/`                                                          |           0 | none                                                                                                                      | same                                                                                                                      |
| `design-preview/(operator)/player/` (`page.tsx`, `player-record-preview.tsx`)                                                                                                       |       585 | A second player record, with three hand-typed status label maps                                   | delete because `/operate/roster/[membershipId]` is the shipped version of it                                                                        |           0 | none                                                                                                                      | same                                                                                                                      |
| `design-preview/(operator)/kit/` (`page.tsx`, `kit-demos.tsx`)                                                                                                                      |       452 | A gallery claiming "every kit component once"                                                     | delete because it shows 27 of the kit's 41 exports; the 21 colocated component tests and 35 committed PNGs are the kit's real record                |           0 | none                                                                                                                      | Loses a visual gallery — product question 4                                                                               |
| `design-preview/(operator)/operators/`, `operator/`                                                                                                                                 |       373 | Copies of the two operator-directory screens                                                      | delete because `/operate/admin/operators` is the shipped version                                                                                    |           0 | none                                                                                                                      | same                                                                                                                      |
| `design-preview/(operator)/page.tsx`, `layout.tsx`                                                                                                                                  |       243 | The mockup index, and a copy of the operator shell                                                | delete because the index's own text is now false (see G12-01)                                                                                       |           0 | none                                                                                                                      | same                                                                                                                      |
| `design-preview/(operator)/roster/page.tsx`                                                                                                                                         |         6 | Re-renders the real `/operate/roster` under a second URL                                          | delete because it is an alias of a live route, not a mockup                                                                                         |           0 | none                                                                                                                      | same                                                                                                                      |
| `design-preview/` public mockups (`picks.ts`, `answer`, `login`, `player-agreement`, `player-details`, `questionnaire-shell`, `player-home`, `rsvp`, `rsvp-unusable`, `layout.tsx`) |      1133 | Copies of the five token surfaces, read by person id through the operator tier                    | delete because two of them expose restricted person fields the live routes gate (product question 2)                                                |           0 | none                                                                                                                      | Resolves a live authorization gap rather than creating one                                                                |
| `src/components/` surfaces and layout (`section`, `surface`, `public-shell`, `controlled-section`, `page-header`, `action-bar`)                                                     |       509 | The card, shell, header and form-foot every page renders                                          | keep — each is one component with one variant axis and no duplicated branch worth folding                                                           |         509 | `section.test.tsx`, `public-shell.test.tsx`, `controlled-section.test.tsx`, `page-header.test.tsx`, `action-bar.test.tsx` | none                                                                                                                      |
| `src/components/` facts and values (`fact`, `record-field`, `metric`, `status-chip`, `step-trail`)                                                                                  |       541 | One labelled fact, one status vocabulary, one headline number                                     | keep — `STATUS_VOCABULARY` is already the lookup table the brief asks for, and `Fact`'s two layouts share `rendered` and `trailing`                 |         541 | `fact.test.tsx`, `metric.test.tsx`, `status-chip.test.tsx`, `step-trail.test.tsx`                                         | none                                                                                                                      |
| `src/components/row-card.tsx`                                                                                                                                                       |       146 | The phone half of every table                                                                     | rewrite as one `Card` return — the `Card` element and its `emphasized` `sx` are written twice, at `:79` and `:115`                                  |         126 | `row-card.test.tsx`                                                                                                       | A lost `emphasized` border; `row-card.test.tsx` asserts the card renders, not the border — see G12-03                     |
| `src/components/sortable-header.tsx`, `candidate-row.tsx`, `empty-state.tsx`                                                                                                        |       153 | One sortable column heading, one duplicate match, one empty list                                  | keep, but `SortableHeader` absorbs two local prop shapes (see Kit)                                                                                  |         153 | `sortable-header.test.tsx`, `candidate-row.test.tsx`, `empty-state.test.tsx`                                              | none                                                                                                                      |
| `src/components/field.tsx`                                                                                                                                                          |       251 | Every form control: text, select, radio, check, date, time                                        | rewrite as one `PickerField` behind `DateField`/`TimeField` — `:103`–`:127` are four converters and `:182`/`:238` two near-identical 50-line bodies |         197 | `field.test.tsx`                                                                                                          | A wrong `format` or `minutesStep` per kind; `field.test.tsx` asserts the hidden input's `YYYY-MM-DD`/`HH:mm` — see G12-03 |
| `src/components/multi-select-field.tsx`                                                                                                                                             |        94 | The multi-tick dropdown, flat and grouped                                                         | fold the flat form into the grouped one — `:18` and `:60` differ only in a `ListSubheader`                                                          |          55 | none today — no `multi-select-field.test.tsx` exists                                                                      | Silent loss of the multi-tick Brian named in V-5; no test catches it — see G12-03                                         |
| `src/components/phone-field.tsx`, `pinned-select.tsx`, `value-choice.tsx`                                                                                                           |       189 | The two-control phone input, the filter select, one side of a two-value choice                    | keep — each is one control with one job                                                                                                             |         189 | `pinned-select.test.tsx`, `value-choice.test.tsx`; none for `phone-field`                                                 | none                                                                                                                      |
| `src/components/notice.tsx`, `refusal.tsx`                                                                                                                                          |        98 | The one message shape, the one refusal screen                                                     | keep                                                                                                                                                |          98 | `notice.test.tsx`, `refusal.test.tsx`                                                                                     | none                                                                                                                      |
| `src/components/outcome-slot.tsx`                                                                                                                                                   |        66 | One action's result at a time                                                                     | rewrite `Outcome`'s three-branch ladder (`:59`–`:83`) as one ordered lookup                                                                         |          52 | `outcome-slot.test.tsx`                                                                                                   | Refusal must stay first; `outcome-slot.test.tsx` asserts the precedence                                                   |
| `src/components/brand-mark.tsx`, `phone-icon.tsx`, `link-opened-beacon.tsx`                                                                                                         |        86 | The crest and wordmark, the call glyph, the opened-link beacon                                    | keep                                                                                                                                                |          86 | `brand-mark.test.tsx`, `phone-icon.test.tsx`; none for the beacon                                                         | none                                                                                                                      |
| `src/lib/brand.ts`                                                                                                                                                                  |        61 | The club's name, navy, and the words a shared link shows                                          | rewrite `TOKEN_LINK_METADATA` (`:43`–`:61`) as a call of `publicPageMetadata` (`:64`) plus `robots` and the absolute title                          |          49 | none directly; `/join/[code]` and the `opengraph-image` routes consume it                                                 | A doubled club name in the tab if `title: { absolute }` is dropped; no test pins it                                       |
| `src/theme.ts`, `src/theme-tokens.ts`                                                                                                                                               |       230 | The club's palette, type scale, radii and MUI overrides                                           | keep — values and configuration, with every contrast pair recomputed by `theme.test.ts`                                                             |         230 | `src/theme.test.ts` (118 lines)                                                                                           | none                                                                                                                      |
| new `src/components/record-list.tsx`                                                                                                                                                |         0 | —                                                                                                 | add: one list fed a column definition, rendering the desktop table and the phone cards from one source                                              |          90 | new; repoints the existing per-screen tests                                                                               | see G12-02                                                                                                                |

### Proposals

#### G12-01 — Delete `src/app/design-preview/**` (saves ~4515)

- Now: 27 files, 4515 code lines, 16 routes. Four facts settle it.

  **Its own README forbids its presence.** `src/app/design-preview/README.md`
  opens: "**Branch:** `chore/lan-225-design-mockup` ... **Never merged, and
  never to be merged.** The implementation mission takes `src/theme.ts`,
  `src/components/` and `docs/ux/design-system.md` from it." The branch was
  merged. The implementation mission (LAN-231–235, merged as `10df214`) then
  did exactly what the README said it would, which leaves the README describing
  a folder that no longer exists: it names `club-theme.ts`, `themed.tsx` and a
  preview-local `(operator)/shell-nav.tsx`, and none of the three is in the tree
  (`find src/app/design-preview -name themed.tsx -o -name shell-nav.tsx`
  returns nothing). It asserts "Nothing outside this folder imports the kit",
  and today every live route does.

  **Its index page states three things that are false.**
  `(operator)/page.tsx:135`–`:141` tells the reader "the club theme is applied
  to this route and nowhere else, so merging this branch changes nothing about
  the running application. The implementation mission moves
  `design-preview/club-theme.ts` to `src/theme.ts`". `src/theme.ts` is the
  application's theme. `(operator)/page.tsx:110` says "`/` becomes the sign-in
  screen ... this branch leaves the real `/` alone"; `src/app/page.tsx` is now
  two lines re-exporting `./login/page`. The page is a set of decisions
  presented as pending that were all taken and shipped.

  **Nothing reaches it.** `git grep design-preview -- src/` outside the folder
  returns three comment lines and no import. No test in `src/` or `tests/`
  names it. No entry in `package.json`, `scripts/`, `playwright.config.ts`,
  `vitest.config.ts` or `.github/` names it. The operator shell does not link
  it: `src/app/operate/destinations.ts` and `shell-nav.tsx` have no such
  destination. `docs/qa/walker-brief.md:120` goes further and excludes it —
  "Not a finding: ... anything under `/design-preview`" — and the rollout's own
  evidence index, `docs/ux/review/lan-231-rollout/corrections-2026-09-08/README.md:4`,
  records "No design-preview route is included." The one script that drives it,
  `docs/ux/review/design-mockup-2026-09/capture.mjs:20`, is the historical
  LAN-225 capture run, and its 35 output PNGs are already committed under
  `screens/` and `screens-current/`, so the comparison it produced survives the
  deletion as pixels.

  **It is a live surface that duplicates live logic and drifts from it.** Every
  route is real: `(operator)/layout.tsx:24` resolves an operator session and
  every page calls `gateShellPage`, so a signed-in operator can open all
  sixteen in production today. `(operator)/event/page.tsx:58` repeats
  `/operate/events/[id]`'s six-way `Promise.all`; `picks.ts:100`–`:116` fans a
  `readPlayerHomeIn` query out over every active player, six connections at a
  time, to choose a subject. And the copies have already diverged:
  `player-home/page.tsx:80`'s `rowSentence` is byte-for-byte
  `src/app/me/[token]/summary-row.tsx:34`; `report-preview.tsx:295`/`:559`/`:308`
  repeat `chase-grid.tsx:200`, `onboarding.tsx:152` and `chase-grid.tsx:162`;
  `player-record-preview.tsx:47`–`:58` hand-types three status label maps
  `STATUS_VOCABULARY` already owns; and `participation-preview.tsx:63` appends
  `.replace("Sept", "Sep")` where `participation-table.tsx:56`–`:68` does not,
  so two routes in one deployed application print the same timestamp two ways
  (product question 3).

- Smallest honest shape: `git rm -r src/app/design-preview`. Nothing replaces
  it. Three live presentation modules then hold a function with no caller —
  `eventTypeLabel` in `src/app/a/[token]/presentation.ts:11`,
  `src/app/me/[token]/presentation.ts:17` and
  `src/app/rsvp/[token]/presentation.ts:13`, each already commented "Only
  `/design-preview` still calls this (LAN-265)" — worth about 14 lines with the
  two `TYPE_LABELS` imports that become unused. Those three files are not in
  this section; whichever section owns them should claim the lines, and
  `npm run typecheck` names them the moment this folder goes.
- Behaviour held by: nothing. No test reaches any of these routes, so
  `npm run verify` says nothing about the deletion either way — state that
  plainly rather than citing a green suite. The proof is three observations:
  `npm run build` compiles the remaining routes, `npm run typecheck` passes,
  and `git grep design-preview -- src/` returns no import.
- Lines: 4515 → 0, because every route is a mockup of a screen that shipped and
  no code, test, script or workflow imports one.
- Risk: a bookmark or an old review link 404s, and
  `docs/ux/review/design-mockup-2026-09/capture.mjs` can no longer be re-run.
  The first is the intended effect. The second costs nothing that is not
  already committed as PNG. Neither is caught by a test, because neither is
  behaviour the application owes anybody.
- Repointed tests: none.
- New dependency: none.

#### G12-02 — One `RecordList` for the desktop-table / phone-card pair (saves ~224 across other sections, at a cost of 90 here)

- Now: eleven live files build both halves of a list by hand — a
  `DesktopOnly`/`TableFrame`/`Table` block and a `RowCardList`/`RowCard` block,
  each iterating the same rows and each computing the same cell values a second
  time. `src/app/operate/events/templates/page.tsx:73`–`:136` is the clearest
  case: `describeTemplateAudience(groupLabels(template))`,
  `describeTemplateWhere(...)` and `describeQuestionCount(...)` are all called
  once per half, and the two halves are 58 lines of markup for a four-column
  list. `src/app/operate/admin/roles/page.tsx:58`–`:110`,
  `src/app/operate/admin/operators/page.tsx`,
  `src/app/operate/events/operator-list.tsx`,
  `src/app/calendar/public-list.tsx`,
  `src/app/operate/events/[id]/delivery/delivery-diagnostics.tsx` and
  `src/app/participation/participation-table.tsx` are the same shape. The other
  four pairs — both import screens, `people/missing/queue-board.tsx` and
  `roster/[membershipId]/attendance-section.tsx` — are not plain lists and are
  out of this proposal.
- Smallest honest shape: `src/components/record-list.tsx`, about 90 lines:

  ```ts
  export interface Column<R> {
    label: string;
    cell: (row: R) => ReactNode;
    align?: "left" | "right" | "center";
    sort?: { column: string; href: string }; // renders SortableHeader
    card?: "title" | "trailing" | "chip" | "subline" | "omit"; // default subline
  }
  export function RecordList<R>(props: {
    rows: readonly R[];
    rowKey: (row: R) => string;
    columns: readonly Column<R>[];
    href?: (row: R) => string;
    empty?: ReactNode;
    minWidth?: number;
    testId?: string;
  }): ReactElement;
  ```

  Each call site becomes its column array. `cell` runs once per row per column
  and feeds both halves, so the phone card and the table cell cannot disagree.

- Behaviour held by: the existing per-screen tests, which assert rendered text
  rather than markup —
  `src/app/operate/events/templates/screens.test.tsx`,
  `src/app/operate/admin/**/screens.test.tsx`,
  `src/app/participation/screens.test.tsx`,
  `src/app/operate/events/screens.test.tsx`. The `data-testid` names those
  tests query (`template-row`, `template-card`, `role-row`) must survive as
  `Column`/`RecordList` props, not be renamed.
- Lines: +90 here; roughly −32 per adopted site. Seven sites is about −224, so
  the codebase net is about −134. It is a modest win and should be ranked as
  one: the case for it is as much that the two halves stop drifting as that the
  count falls. Below five sites it does not pay for itself.
- Risk: a column that renders differently on the two halves today (a table cell
  carrying a `Button`, a card subline carrying joined text) gets flattened into
  one. The `card` discriminator exists for exactly that, and each screen's own
  test asserts the phone and desktop text it expects; the screenshot pairing at
  375px and 1440px is the second net.
- Repointed tests: none deleted or weakened. Each adopting section repoints its
  own screen test's selectors if a `data-testid` moves.
- New dependency: none.

#### G12-03 — Collapse the kit's three duplicated pairs (saves ~113)

- Now: three components in this section are written twice.
  `field.tsx:182` `DateField` and `field.tsx:238` `TimeField` are the same 50
  lines — one `LocalizationProvider`, one `div data-field`, one picker, one
  hidden input — differing in the picker component, the `format`, and
  `minutesStep`; above them `field.tsx:103`–`:127` are four converters
  (`dateFromDay`, `dayFromDate`, `dateFromTime`, `timeFromDate`) that are two
  functions with a kind. `multi-select-field.tsx:18` `MultiSelectField` and
  `:60` `GroupedMultiSelectField` differ only in whether a `ListSubheader`
  precedes each group. `row-card.tsx:77`–`:112` and `:114`–`:132` are two
  `return`s of the same `Card`, with the `emphasized` `sx` object typed out
  twice.
- Smallest honest shape: one `PickerField({ kind: "date" | "time", ... })`
  with `DateField`/`TimeField` as five-line named wrappers over it, and
  `parsePickerValue(kind, text)` / `formatPickerValue(kind, date)` in place of
  the four converters; `MultiSelectField` as the grouped component called with
  one unlabelled group (`groups=[{ label: "", options }]`, the subheader
  suppressed on an empty label); and one `RowCard` return whose children are
  `actions ? <Stack>…</Stack> : href ? <CardActionArea>…</CardActionArea> :
body`, with the `emphasized` `sx` computed once above it.
- Behaviour held by: `field.test.tsx` (58 lines) asserts the hidden input posts
  `YYYY-MM-DD` and `HH:mm`, which is the property the `PickerField` merge could
  break. `row-card.test.tsx` (61 lines) asserts the card, its sublines and its
  `href`. **`multi-select-field.tsx` has no test at all** — the multi-tick
  dropdown Brian named in V-5 is pinned only by
  `src/app/a/[token]/interest-questionnaire.tsx`'s own screen test, so this
  third of the proposal is the one with no direct net under it.
- Lines: 491 → 378, because 126 lines of picker and converter become 72, 94
  lines of two multi-selects become 55, and `RowCard`'s 19-line second return
  becomes a branch inside the first.
- Risk: the date picker silently acquiring the time picker's `minutesStep`, or
  the grouped dropdown losing its subheaders. `field.test.tsx` catches the
  first through the posted value; the second is caught only by the
  questionnaire's screen test and the 375px screenshot, so the grouped variant
  should keep rendering `ListSubheader` under an explicit non-empty label and
  the merge should add a `multi-select-field.test.tsx` asserting both forms.
- Repointed tests: none. `field.test.tsx` imports `DateField`/`TimeField` by
  name and those names survive.
- New dependency: none.

### Kit

- **Pieces routes in this section write themselves that are already a kit
  member:** effectively none, and that is worth stating rather than padding.
  Outside `src/components/` and `design-preview/`, only four files use `<Paper>`
  directly, five occurrences in total — `src/app/calendar/gregorian-month.tsx`
  (2), `src/app/calendar/year-column.tsx`, `src/app/operate/roster/roster-board.tsx`
  and `src/app/operate/recruitment/recruitment-board-view.tsx` — and each is a
  board or calendar frame, not a titled card that `Section` or `Surface` should
  own. There is no local `Fact`, `Notice`, `StatusChip`, `RowCard` or `Field`
  anywhere in the live tree. LAN-231–235 adopted the kit properly; the
  duplication this ticket is looking for is not here.
- **Pieces two or more routes write that should become one component:** the
  desktop table and phone card list, built by hand in seven comparable live
  files named in G12-02 → `RecordList` in `src/components/record-list.tsx`.
- **Kit members this section needs changed to absorb a local copy:**
  - `SortableHeader` (`src/components/sortable-header.tsx:13`) → accept the
    `{ link: { column, href }, sort, direction }` prop shape as well as its
    current flat props, and derive `active` and the next direction itself.
    `src/app/calendar/sortable-header.tsx` is 40 lines that do nothing but
    translate between the two shapes, it has one consumer left
    (`src/app/operate/events/operator-list.tsx`) despite its comment claiming
    two, and it deletes entirely. `src/app/operate/people/missing/missing-sortable-header.tsx`
    keeps its `URLSearchParams` href builder — that is real work — but sheds
    its `:18`–`:25` active/next-direction derivation. Both files belong to
    other sections; the kit change is this section's, about 6 lines added.

### Product questions

1. **May `/design-preview/**` be deleted?** Sixteen routes, 4515 lines, in a
   deployed application. Nothing in the product reaches them: no import, no
   test, no script, no CI job, no shell destination. The QA process excludes
   them by name (`docs/qa/walker-brief.md:120`) and the design rollout's
   evidence excluded them (`docs/ux/review/lan-231-rollout/corrections-2026-09-08/README.md:4`).
   Their own README says they were never to be merged. What would be lost is
   the ability to re-run `docs/ux/review/design-mockup-2026-09/capture.mjs`
   and regenerate the LAN-225 proposed-versus-current comparison; the 35 PNGs
   that run produced are already committed, so the review itself survives as
   pixels and as `index.html`. A rewrite cannot decide this alone because
   removing routes from a deployed application is an owner call even when they
   are unreferenced, and because Brian may still regard the comparison page as
   a live review instrument.
2. **Two routes show restricted person fields that the live record route
   gates.** `src/app/design-preview/player-details/page.tsx:60` and
   `player-agreement/page.tsx:34` call `gateShellPage(route)` with **no
   capability**, which per `src/app/operate/gate.tsx:32` admits any active
   operator who is not a narrow attendance recorder, and then render one real
   seeded player's date of birth, mobile, personal email and emergency contact
   name, phone and email with no redaction. The live equivalents take the
   opposite position twice over:
   `src/app/operate/roster/[membershipId]/page.tsx:19` requires
   `person_record_authority` and applies `redactPersonRecord`, and
   `src/lib/auth/person-authority.ts:173`–`:175` classes `dateOfBirth`,
   `dateOfBirthSource` and `emergencyContact` as `restricted`, which
   `:82` maps to that same capability; the real `/me/[token]/details` is the
   player's own throttled token surface. The preview's sibling
   `(operator)/player/page.tsx:12` does gate on `person_record_authority` and
   does redact, so this is an inconsistency inside the folder, not a policy.
   Deleting the folder (question 1) answers this. Keeping it needs Brian to
   authorise a security change, which this analysis is not permitted to make
   and a rewrite must not make silently.
3. **Which short-month form is the club's?** LAN-225's decision register, still
   rendered at `src/app/design-preview/(operator)/page.tsx:114`, records "A6
   one short-month form" as a taken product finding. It is implemented in
   exactly one place in the repository —
   `(operator)/event/participation-preview.tsx:63`, `.replace("Sept", "Sep")` —
   and nowhere live: `src/app/participation/participation-table.tsx:56`–`:68`
   is the same function without it, and `src/app/operate/admin/presentation.ts:250`
   `formatDay` takes `Intl` at its word, which on this ICU renders September as
   "Sept". So `/operate/events/[id]` prints "24 Sept 2026" and
   `/design-preview/event` prints "24 Sep 2026" for the same invitation. Two
   screens answering one question two ways. If the answer is "Sep", it is a
   change to `formatDay` and `formatWhen` in live code and a separate ticket;
   if it is "Sept", A6 was abandoned and the register is wrong. A rewrite
   cannot choose.
4. **Does the club want a kit gallery?** `(operator)/kit/page.tsx` promises
   "every component once" and delivers 27 of the kit's 41 exports —
   `ControlledSection`, `CheckField`, `MultiSelectField`,
   `GroupedMultiSelectField`, `BackLink`, `PhoneField`, `PhoneIcon`,
   `PinnedSelect`, `RecordField`, `RecordRow`, `DesktopOnly`, `FieldGroup`,
   `Surface` and `ValueChoice` are absent. Deleting it costs a gallery that was
   never complete and has not been maintained; the 21 colocated component
   tests, `docs/ux/design-system.md` § 5 and the committed `K-kit--desktop.png`
   / `K-kit--phone.png` are the kit's current record. Rebuilding a complete,
   maintained gallery would be a new route — a product question, not a
   simplification, and not something to smuggle in under this ticket.

### Not proposed

- `src/theme.ts`, `src/theme-tokens.ts` (230 lines) — token values and MUI
  overrides. There is no logic to fold: the four `declare module` blocks are one
  per augmented MUI module and cannot merge, and `src/theme.test.ts` recomputes
  every contrast pair, so the values are pinned. Aliasing `h4`–`h6` onto
  `h1`–`h3` is three deliberate duplicate lines (`theme.ts:87`–`:89`) and
  spreading them saves nothing measurable.
- `status-chip.tsx` (132) — `STATUS_VOCABULARY` is already the single lookup
  table that the brief's "long switch ladder over a status" pattern asks for,
  and `statusStyle` already defaults an unclassified code to neutral in one
  line. It is the model the rest of the application should copy, not a target.
- `section.tsx`, `fact.tsx`, `page-header.tsx`, `action-bar.tsx`,
  `public-shell.tsx`, `notice.tsx`, `refusal.tsx`, `metric.tsx`,
  `empty-state.tsx`, `candidate-row.tsx`, `step-trail.tsx`,
  `controlled-section.tsx`, `value-choice.tsx`, `pinned-select.tsx`,
  `phone-field.tsx`, `record-field.tsx`, `surface.tsx`, `phone-icon.tsx`,
  `link-opened-beacon.tsx` — each is one component with one job, each has at
  least one live consumer, and each already shares its own internals across its
  variants (`Fact`'s `rendered`/`trailing`, `Section`'s `head`). The four
  `Band`/`BandColours` entries that repeat values in `section.tsx:25`–`:32` are
  two genuinely distinct colours written under four band names on purpose, and
  collapsing them would make a band's identity depend on its colour.
- Carve-out files read for context only, with nothing proposed in them:
  `src/lib/auth/person-authority.ts`, `src/lib/auth/capabilities.ts`,
  `src/lib/auth/guards.ts`, `src/lib/auth/operator.ts`, `src/lib/db` (for
  `isServiceError`, `withTransaction`). `src/app/operate/gate.tsx` is not a
  carve-out but belongs to another section; it is quoted here only as evidence
  for product question 2.

---

# Appendix B — exports named by nothing outside tests and the design preview

`npm run dead-exports` (`scripts/dead-exports.mjs`) at `e1d7b33`: 307 exports in 143 files are named by no non-test, non-preview file (declaration spans 2303 lines); 35 of them are not used inside their own file either (493 lines). Framework entry files, the carve-outs and `src/app/design-preview/**` are skipped; an export only the design preview names is marked. The 272 exports used inside their own file need only the `export` keyword dropped (no line saving; knip accepts them because their barrels use `export *`). The 35 below are referenced by nothing at all outside tests: they are package P2's deletion list, each with the test that is its only caller, except where § 6 lists a product question.

## Functions and classes referenced by nothing (22, 368 lines)

| Lines | Export                                 | File                                                         |
| ----: | -------------------------------------- | ------------------------------------------------------------ |
|    84 | `readRoleHolders`                      | `src/lib/services/operator-administration/role-detail.ts:58` |
|    64 | `resolvePersonFactDisputeIn`           | `src/lib/services/person-fact-dispute.ts:160`                |
|    44 | `validatePhoneParts`                   | `src/lib/services/phone-parts.ts:148`                        |
|    40 | `raisePersonFactDisputeIn`             | `src/lib/services/person-fact-dispute.ts:76`                 |
|    22 | `resolveOnboardingItemAction`          | `src/app/operate/roster/actions.ts:55`                       |
|    16 | `accountStateColour`                   | `src/app/operate/admin/presentation.ts:97`                   |
|    15 | `readOnboardingItemHistoryIn`          | `src/lib/services/onboarding-item-history.ts:88`             |
|    14 | `hasLiveOnboardingLinkIn`              | `src/lib/services/onboarding-ask.ts:78`                      |
|    10 | `onboardingWelcomeAlreadyQueuedIn`     | `src/lib/services/onboarding-welcome.ts:60`                  |
|     7 | `recordClubLinkUse`                    | `src/lib/services/club-link.ts:194`                          |
|     6 | `requireGrantedSeasonMessagingConsent` | `src/lib/services/messaging-consent.ts:85`                   |
|     6 | `readOnboardingAgreements`             | `src/lib/services/onboarding-agreements.ts:156`              |
|     5 | `guideText`                            | `src/app/operate/admin/guide/content.ts:424`                 |
|     5 | `shiftDays`                            | `src/app/operate/events/coach-event-buckets.ts:26`           |
|     5 | `isOperatorAccountState`               | `src/lib/services/operator-account-state.ts:100`             |
|     4 | `activateMembership`                   | `src/app/operate/actions.ts:8`                               |
|     4 | `manageRoles`                          | `src/app/operate/actions.ts:23`                              |
|     4 | `administerDelivery`                   | `src/app/operate/actions.ts:28`                              |
|     4 | `permissionsLine`                      | `src/app/operate/admin/presentation.ts:200`                  |
|     3 | `formatTermName`                       | `src/app/calendar/presentation.ts:43`                        |
|     3 | `cancellationDefaultNotify`            | `src/lib/services/event-amendment-rules.ts:175`              |
|     3 | `resolveRecruitmentSignupCode`         | `src/lib/services/recruitment-signup-codes.ts:72`            |

## Constants referenced by nothing (13)

| Lines | Export                               | File                                            |
| ----: | ------------------------------------ | ----------------------------------------------- |
|    69 | `PERSON_REFERENCE_COLUMNS_EXCLUDED`  | `src/lib/services/person-merge/write.ts:104`    |
|    19 | `EMPTY_DETAILS_VALUES`               | `src/app/me/[token]/details/validation.ts:59`   |
|     9 | `EMPTY_FILTERS`                      | `src/lib/services/participation-view.ts:190`    |
|     6 | `STORED_MISMATCH_CLASSES`            | `src/lib/services/discrepancy-vocabulary.ts:2`  |
|     5 | `EMPTY_OUTCOME` (preview only)       | `src/components/outcome-slot.tsx:18`            |
|     4 | `NOT_DERIVED`                        | `src/lib/services/discrepancy-vocabulary.ts:17` |
|     3 | `EMPTY_MEMBERSHIP_ACTION_STATE`      | `src/app/operate/roster/action-state.ts:5`      |
|     2 | `HEADING_HELP` (preview only)        | `src/app/me/[token]/presentation.ts:42`         |
|     2 | `FOLLOW_UP_ONLY_HELP` (preview only) | `src/app/me/[token]/presentation.ts:44`         |
|     2 | `EMPTY_HELP` (preview only)          | `src/app/me/[token]/presentation.ts:46`         |
|     2 | `STORED_NOTE` (preview only)         | `src/app/operate/report/presentation.ts:31`     |
|     1 | `SORTABLE_NOTE` (preview only)       | `src/app/participation/presentation.ts:120`     |
|     1 | `NOT_STORED`                         | `src/lib/services/discrepancy-vocabulary.ts:22` |
