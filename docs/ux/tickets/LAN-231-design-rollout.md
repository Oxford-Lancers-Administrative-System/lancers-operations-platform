# LAN-231–235 — Combined design adoption

Brian authorized one branch and one draft PR on 6 September 2026, with
LAN-231 implemented first and LAN-232–235 following. This replaces the
individual delivery instruction, not the five tickets' acceptance criteria.
Base: `29aef851` (includes LAN-230's questionnaire corrections).

## Acceptance matrix

| Area                               | Success                                                                                                                              | Failure and boundaries                                                                                               | Proof                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| LAN-231 foundation                 | Approved theme global; preview unchanged; branded shell; shared login at `/` and `/login`; shared refusals, filters and status pills | Existing redirect validation, role destinations, account gates and three drawer dismiss paths preserved              | Contrast, login and shell tests; desktop/375px captures; actual refused states                              |
| LAN-232 events                     | Kit headers, sections, notices, statuses, fields, action bars and responsive tables                                                  | Preserve event actions, attendance, messaging state machine and authorization; empty/populated/refused/failed states | Existing behavior tests; all touched routes and seeded states at both widths                                |
| LAN-233 people/roster              | Consistent records, facts, absence, provenance and candidate matches                                                                 | Preserve board layout, inline editing, season scope, matching and permissions                                        | Record and board interaction tests; full/sparse/disputed records and empty queues; Brian's core-page review |
| LAN-234 administration/recruitment | Shared outcomes, records, report, dashboard and headings; includes session-gated `/me` presentation                                  | Preserve report queries, state machines, permissions and `/me` POST/redirect; no redesign of `/operate`              | Existing admin/recruitment tests and both-width route/state captures                                        |
| LAN-235 player/public              | One masthead, stacked home/questionnaire, equal-column step map, collapsed answered tail, consistent controls                        | Preserve LAN-230 corrections, token resolution/expiry/revocation, consent and answer recording                       | Questionnaire/token tests; service-minted synthetic token routes; each step/state at both widths            |

Visual class: UI-affecting. Review grade: Normal, revisited against final diff.
Criticality: preserve access boundaries and record/form interactions while changing
presentation. One combined head requires verification, CI, Brian's visual approval
and a fresh independent review before eligibility to leave draft.

## Boundaries and residual risk

- No schema, hosted data, deployment, new domain concept or permission change.
- The approved root sign-in replacement (B8) is the sole product change.
- Preserve the roster/recruitment board layouts; replace shared record shell only
  after migrating every importer, including its inline editing behavior.
- `/me` is explicitly LAN-234, as authorized by Brian; its session gate stays.
- Defer owner decisions in design-system §8; retain behavior from current main
  where older mockups predate LAN-230.
- Do not run the overlapping LAN-219 simplification concurrently.
- Broad visual impact means passing component tests alone is insufficient.
  Review covers core roster/person/event pages and every ticket's state matrix.

## Evidence and copy ledger

Implementation, verification, screenshots, copy dispositions and remaining
limitations are recorded as they are observed. Foundation verification passed:
typecheck, targeted lint, and 131 tests across theme, root, login, shell and
filters. Initial desktop/375px preflight passed for ten foundation/core routes;
these are development checks, not final exact-head evidence.

LAN-231 copy dispositions:

- Root: removed the bootstrap scaffold description and navigation to the
  dashboard/login, replaced by the shared sign-in screen (approved B8).
- Login: removed the standing authentication/authorization explanation (H1);
  account provisioning guidance and all actual error/reset outcomes remain.
- Shell: removed the repeated “Lancers Operations” and “Signed in as” block;
  identity and sign-out live in the navigation account block.
- Refusals: removed reviewer-oriented authorization-enforcement, withheld-data
  and no-data notes. Exact account-state messages, capability requirements,
  return destinations and sign-out actions remain.

LAN-232 copy dispositions (in progress):

- Event record: removed the standing no-invitations banner and duplicate
  pre-approval action explanation; the audience/distribution facts still state
  that nothing has been distributed and no invitations/responses exist.
- Empty-audience refusal: removed the reviewer-facing server-enforcement note;
  the actual refusal, no-write consequence and Build audience recovery remain.
- Event editor: removed the draft-boundary banner and everyone-answers
  explanation. Save draft, attendance choice, validation and server actions
  are unchanged. Derived term remains live contextual text, not an alert.
- Delivery: removed the standing manual-delivery policy banner, diagnostics
  explanation and repair explanation. Actual held-message conditions,
  empty data, provider failures, retry limits and token consequences remain.
- Non-status descriptors (question requirement/template origin, audience
  capacity, messaging recipient group) are text, not invented status codes.

Kit additions: DateField can retain the editor's controlled partial Date without
round-tripping through a formatted string; CheckField supports controlled
selection, disabled state and a specific accessible input label. Existing
uncontrolled form behavior remains supported.

Further copy dispositions:

- Events: removed the new-draft operational-instructions subtitle, the template
  editor's standing explanation, and the amendment's stays-approved reminder.
  Existing draft/amend/cancel actions, irreversible confirmation, silence
  acknowledgement, audience counts and all actual refusals remain.
  The template editor also removes its standing group-selection explanation,
  automatic-end-time helper and question-inheritance explanation. The actual
  group choices, off-grid duration option, question editing and confirmation's
  named drafts/unchanged records/reasons all remain.
  The templates index removes the standing fixed-type policy sentence; there
  are still no create/delete-type controls. Import removes its introductory
  term-card explanation; conversion steps, versioned prompt, identifier rules,
  safety boundaries, and each row’s proposed changes/refusal remain. Import
  outcomes are plain text, not invented stored statuses.
  Walk-up capture removes its introductory definition and the phone/email
  storage explanations. Recruitment-versus-membership consequences remain as
  plain text; the exact read-back/send-consent notice remains prominent, as do
  the fixed Present explanation and required first name, last name and phone.
  Attendance removes the standing RSVP-separation, coach-withheld-data and
  completion-explanation notes. Standing RSVP, mismatch facts (operator only),
  committed values, actor/time, corrections and all coach exclusions remain.
- People: unknown provenance no longer gets its own "not recorded" caption;
  the absent fact itself still says Not recorded. Known source/actor/date notes
  remain attached to the fact. Non-status contact and alias descriptors are text.
- Admin: removed the empty operator list's invitation explanation, the roles
  index's standing definition/editability explanation, and the role record's
  reviewer-facing claim that UI permissions share enforcement definitions.
  Actual projected capabilities, authority limits, holder/account distinctions,
  vacancy and scheduled-successor explanations remain. The administration guide
  retains its answers: it is the expressly approved place for that help. Its
  native kit disclosures preserve first-open/rest-closed and server-rendered
  answer content.
- Report: removed the stored-snapshot enforcement explanation; the actual
  opened-at timestamp remains. Snapshot reading, sorting, metric definitions,
  counts and record links are unchanged.
- Dashboard: removed the bootstrap explanation that the page proves session
  gating. Email, resolved identity, role codes, exact unresolved-state wording,
  sign-out and both server-side lookups remain.
- Player home: removed standing heading/empty/follow-up instructional helpers;
  actual invitation conditions, actions, privacy and empty-state recovery remain.
  Questionnaire consent labels and required-field validation remain unchanged.

Further kit support: Surface for untitled panels; RecordField/RecordRow for the
existing inline record interaction and fact/provenance shape; DateField forwards
the invalid-field focus ref and required state; PageHeader/RowCard support the
existing cancelled-event strike-through; SortableHeader accepts rich labels and
existing test identifiers; EmptyState accepts the existing multiple recovery
actions. PublicShell's header action uses white text/border on Oxford Blue.
ControlledSection keeps attendance's search/open/restore state in the owning
screen while sharing disclosure presentation. RowCard supports a wider inline
action column; RowCardList can be a semantic list. Attendance uses both, retaining
four immediate submit controls and the existing audited correction/removal paths.

Verification notes (development checks, not final exact-head approval):

- Event amendment/cancellation: 49 tests passed after updating shared-markup
  selectors and exercising the date picker with real keyboard input.
- Expanded route preflight: 21 routes at browser-measured 1440px and 375px,
  including the seeded player home/questionnaire, public calendar views, invalid
  token states, sign-up, dashboard, admin and core operator lists.
- A delivery test's explicit fixture date coincided with the day of this work
  and became past-due during verification. It now uses the same relative
  48-hour, club-zone date as that fixture's default. No service logic changed.
- A full verification run passed (7,887 tests passed, 11 skipped, build passed).
  Later template/walk-up edits passed focused tests, including all 87 attendance
  screen tests; the current tree is being reverified before a checkpoint.
  Template and event-list checks: 191 passed; bulk-import checks: 8 passed.
  No final exact-head or CI approval is claimed by this ledger.

Remaining gates before the five tickets can be called complete:

- Final route/state capture and conformance check, including signed player links
  and the six-invitation player's measured height against the 7,488px baseline.
- Full verification at the final tree, one combined draft PR and current-head CI.
- Supervised local review environment, Brian's exact-head visual acceptance,
  then the required independent review. Neither approval is claimed here.

Recent development checkpoint:

- People creation, editing, merge and the missing-data queue now use the kit.
  Merge keeps survivor radio defaults, every consent choice, both refusal
  recoveries, retained aliases, and the no-undo consequence. Person editing
  keeps conditional correction reasons, duplicate-email recovery, and alias
  actions. Removed only the standing mobile-validation and correction-reason
  explanations; the actual normalized mobile preview remains.
- Questionnaire B uses PublicShell/PageHeader and shared grouped multi-select
  and question fields. All six questions, optionality, saved/edit branches
  and privacy text remain.
- Participation adopts native kit filter fields and collapsible question counts.
  The standing combined-filter and sortable-column help is removed; discrepancy
  facts, tier exclusions, URL state and clear-filter recovery remain.
- Operator invitation removes its standing duplicate-check and operating-year
  explanations. The actual no-match/new-record outcome, existing-login refusal,
  role requirement, date defaults and backdate reason remain. Account action
  panels retain every immediate access consequence; the restore-reason
  encouragement is removed.
- New kit ValueChoice shares merge comparison presentation without changing
  native radio grouping or posted values. DateField accepts existing min/max
  dates and disabled state. FieldGroup labels nested fields, rather than
  creating a new top-level page section.
- Merge/participation and missing-data focused runs passed. The next wider
  admin/events run passed 1,068 tests with one outdated removed-copy assertion;
  that assertion was corrected and final verification is still pending.

Final adoption pass:

- Returner intake, CSV import and manual recruit entry now use the shared
  heading, field, panel, fact and outcome shapes. Their duplicate decisions,
  current-member refusals, conditional reasons, field validation and posted
  intents remain. The recruit consent explanation is retained under Brian's
  explicit LAN-206 V-10 exception.
- Returner intake removes its standing duplicate-check introduction and
  no-silent-merge lecture; the actual selection and refusal controls remain.
  Roster import removes the repeated season-inheritance paragraph; its four
  safety boundaries, six-column privacy restriction and conversion steps remain.
- Messaging schedule removes the standing schedule-rule banner and section
  introductions; field units/bounds and the nonretroactive-change consequence
  remain. Repeated independent forms use an in-flow ActionBar: sticky bars on
  every panel covered inputs in the first mobile capture. Single-form pages
  retain the sticky phone footer.
- Participation's operator-answer dialog keeps Yes/No, London date/time merging,
  optional event questions, reason capture and role-specific exclusions. Only
  the standing questionnaire explanation is removed.
- Follow-ups removes “nobody compiles this list”; counts and all filters/sorts
  remain. Missing chase/date values say not recorded rather than a dash.
  The phone card now carries the same date as the desktop row.
- Operator record panels, audit history and report lists use the kit. Audit
  subjects, actor/time, reasons and unreadable-entry notices remain visible.
- Roster attendance keeps its existing filter and score state: Occurred by
  default, mandatory recorded events as the denominator, and the separate
  occurred/unrecorded count. Inline roster/record editing remains in place.
  The record already has one shared field-error state cleared at action start;
  it does not gain a second competing result store.
- Development checks passed for 72 roster intake/import tests and the roster
  record/attendance suite. A full run stopped on a Vitest worker communication
  timeout after 5,937 passing tests; it is not recorded as a verification pass.

Verification checkpoint after the final adoption pass:

- `npm run verify` passed: 296 test files, 7,893 tests passed, 11 skipped;
  format, lint, route type generation/typecheck and production build passed.
- The subsequently added ValueChoice regression tests also passed (2 tests):
  default radio selection, switching the posted choice and read-only comparison.
- Primary checkout remains clean. No migration, runtime service implementation,
  authorization, token-resolution or delivery state-machine code changed.
- The one intentional product change is LAN-231 B8: the root renders the shared
  sign-in screen. All other changes are presentation, shared-kit support or
  the documented copy dispositions.
