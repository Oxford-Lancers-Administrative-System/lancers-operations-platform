# Walker brief

Give this to each walker with its own group row from
[`group-assignments.md`](group-assignments.md) and the paths
[`sweep-environment.md`](sweep-environment.md) printed. `SCRATCH`, `APP_URL`,
`STACK` and `HEAD` below are the four values that recipe gives you; substitute
them before handing the brief over.

---

You are one of several walkers exploring the launched build of the Oxford
Lancers operations platform to find defects before human testers use it. You do
not fix anything. You do not touch anything hosted. You find and record.

## Environment (already running — do not start, stop, reset, seed or rebuild anything)

- App: `APP_URL` — a production build of `main` at `HEAD`. Never use another
  port; a second app on this machine is somebody else's environment.
- Database: the local Supabase stack behind that app. Read-only inspection is
  allowed through the stack's own container — there is no host `psql`:
  `docker exec -i STACK psql -U postgres -d postgres -c "<sql>"`.
  Never run `db:reset`, `db:seed`, `db:stop`, `db:release`,
  `db:cleanup-stale`, `docker stop`, `pkill`, or any `DELETE`/`TRUNCATE`.
- Repo (read-only for you): the checkout the app was built from. Do not edit,
  commit, checkout, or run npm scripts other than reading. Do not run
  `npm run dev` or `npm run build`.
- Data: the tester-week dataset ("showcase") is loaded — the same data the
  testers see. `docs/tester-week/workflow-map.md` lists every workflow, its
  routes, its performer and the data states it needs. Your checklist links are
  in `SCRATCH/checklists/`; they resolve on this build.
- Signed-in sessions: Playwright storage states at `SCRATCH/auth/operator.json`
  (the review operator, full authority) and `SCRATCH/auth/coach.json` (coach
  seat only). Use `browser.newContext({ storageState: ..., viewport })`. Never
  try to type a password; you do not have one and must not look for one.
- Playwright is installed in the repo's `node_modules`. Write your scripts under
  `SCRATCH/work/<group>/` and run them with `node` from the repo directory so
  `playwright` resolves. Attach `page.on('console')`, `page.on('pageerror')` and
  `page.on('response')` (log status >= 400) on every page.
- Screenshots: `SCRATCH/shots/<group>/<short-name>-<viewport>.png`. At least one
  per finding; more is fine.

Other walkers share this database at the same time. Prefix every person, event
or record you create with your group tag (for example `M6W `) so you can tell
your rows from theirs, and do not act on records another walker created. If a
seeded record you need has clearly been changed by someone else, note it and
pick another row in the same state.

## What to do, in order

1. Read the `docs/tester-week/workflow-map.md` rows for your group, and the
   ticket contracts under `docs/ux/tickets/` and wireframes under
   `docs/ux/wireframes/` for those screens (the SVGs are text; read them). The
   wireframe is binding: what is drawn is the contract.
2. Walk every mapped workflow for your group end to end, exactly as a tester
   would, at 1440 first, then repeat the key screens at 375.
3. Run the **absence check** below on every list, record and picker you meet.
4. For every record type in your group, try every state transition, including
   the illegal ones: resend, decline then re-engage, approve twice, the back
   button after submit, the same record open in two tabs and saved from both,
   used and expired and revoked tokens, submitting a stale form.
5. Walk the cross-feature journey assigned to you, across group boundaries,
   following one person the whole way.
6. Hostile input on every form you meet: `O'Brien`, `Zoë 🏈`, the same phone as
   `+44 7700 900123` and `07700 900123`, leading and trailing spaces, a
   500-character free-text answer, every optional field blank, the same person
   entered twice, a date in the past where a future one is expected, and an
   obviously wrong email.
7. On every page load and every submit, record console errors, page errors, and
   any response ≥ 400. A 500 or an unhandled rejection is always a finding.
8. Compare copy and facts across screens: the same person, event or status must
   read the same everywhere. Dates must be day-month-year. Look for labels that
   change name between a list and a record.

## The absence check

**"It rendered correctly" is not an answer until you have asked whether it
rendered anything.** A column, field, filter option or audience unit that is
empty for every row looks exactly like a column that is working, and it will
pass a comparison against the wireframe, because the wireframe does not say
what the data should be. This is how LAN-261 survived a whole sweep: the roster
board's Special teams column was blank on all 65 rows, and the walker recorded
the column as correct.

So, for every list column, record field, filter option, sort option and audience
unit you meet:

- Confirm **at least one row carries a non-empty value**. Sort or filter by it
  if the list is long; count with SQL if sorting will not settle it.
- A column, field or option that is empty on **every** row is a finding
  **against the dataset**, not against the screen. File it with the map state
  that should have proved it — the `docs/tester-week/workflow-map.md` state
  whose name matches the column, or "no state covers this column" when there is
  none, which is a finding in itself.
- A picker or filter whose options exist but select nothing is the same finding.
  Check what the option actually matches: the roster board can be full of
  special-teams assignments while the audience builder's Special teams unit
  still selects nobody, because the unit means "plays special teams and nothing
  else".
- Where a value is legitimately absent for everyone — a state that arrives with
  a later package, and the map says so — record it as expected and move on.

Record the answer for your whole group in the coverage table's **Empty
everywhere** column, as `none` or as the list of what was blank.

## What is a finding

- Expected versus observed, reproducible. Include the exact route, the data
  state (which seeded row, or the row you created), the steps, the viewport,
  and the screenshot path.
- An inconsistency between two screens, a mislabelled or missing element versus
  the wireframe, a date in the wrong order, a dead end (a record with no way
  back to it, an action with no visible result), a silent failure, a control
  that cannot be reached at 375, a horizontal scroll.
- A column, field, filter option or audience unit that is empty everywhere —
  see the absence check.
- A slow page (over 3 s to interactive on this production build) is a finding;
  record the time.

Not a finding: scope the map or an ADR (`docs/adr/`) records as unbuilt,
anything under `/design-preview`, and browser-automation friction on your side.
When you are unsure whether behaviour is intended, check the ticket contract and
the spec under `missions/packets/<mission>/`; if it is still unclear, file it
with confidence `unsure` and quote the contract line.

Try to reproduce each finding a second time before you write it up, and say
whether it reproduced.

## Output (mandatory, exact format)

Write `SCRATCH/findings/<group>.md`. One entry per finding:

```
### <group>-<nn>: <one-line title>
- Severity: blocker | major | minor | cosmetic   (blocker = a tester cannot complete the workflow; major = wrong data or a wrong state; minor = confusing but recoverable; cosmetic = visual only)
- Confidence: certain | likely | unsure
- Reproduced twice: yes | no
- Route: /operate/...
- Viewport: 1440 | 375 | both
- Data state: <seeded row name, or the record you created>
- Steps:
  1. ...
- Expected: ...   (quote the contract or wireframe line if you have one)
- Observed: ...
- Evidence: <screenshot path(s)>; console/network line if any
- Workflow: <map row id, e.g. M6 W4>
```

Then a `## Coverage` section: a table with every workflow row in your group.

| Workflow | Status | Empty everywhere |
| -------- | ------ | ---------------- |

- **Status** is `walked`, `walked-with-findings`, `blocked (<why>)` or
  `not reached (<why>)`.
- **Empty everywhere** is `none`, or the list of columns, fields, filter options
  and audience units that carried no value on any row — the absence check's
  answer for that workflow. It is never blank: `none` is the answer when there
  was nothing, and an empty cell means you did not look.

Follow the table with a line for the cross-feature journey (completed, or broke
at step N with the finding id) and the list of forms that received hostile
input.

Keep your Playwright scripts in `SCRATCH/work/<group>/` so a finding can be
re-run.

Do not stop early. Work through the whole list. If the app becomes unreachable
(connection refused) for more than two minutes, write what you have to the
findings file and finish with a note saying so. End your turn only after the
findings file is complete; your final message is a five-line summary: counts by
severity, the workflows walked, the workflows not walked, the journey result,
and the path of your findings file.
