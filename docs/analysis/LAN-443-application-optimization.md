# LAN-443 — application simplification and optimization

Baseline: `cd5f8187`, current `origin/main` when this worktree was created.
Issue: <https://linear.app/brian-schuster/issue/LAN-443>.
Branch: `chore/lan-443-simplify-application`.

## Starting point and scope

The inventory covered application TypeScript under `src/`, excluding `*.test.ts`,
`*.test.tsx` and generated `database.types.ts`: 715 files and 128,657 physical
lines. The largest modules were the messaging scheduler (3,593 lines), delivery
(2,634), capabilities (1,398), recruitment signup (1,010) and audience selection
(962). Knip found no unused code to remove.

Inspection included source-size ranking, identical function-body detection,
repeated array scans and grouping loops, date formatter construction, and the
running-slice contract. This was an internal refactor: no schema, grants,
authorization, messaging rules, UI layout/copy, dependencies or external
configuration changed. The original checkout's unrelated files were preserved.

## Changes and tradeoffs

- Draft and approved-event actions now share form decoding. Each action retains
  its own authorization, validation, transaction and redirect flow. Missing
  questions still means `null`; an empty questions section still means `[]`.
- Four identical PostgreSQL date conversions now use one implementation. Driver
  dates still use host-local date fields; converting these to UTC would change
  their meaning on some hosts.
- Roster, recruitment and onboarding activity reuse one ordered grouping helper.
  Input order, duplicate values and row references are preserved. This reduces
  independent loops at the cost of small selector callbacks.
- Weekly reports index event outcomes, grouped tallies and per-person cells.
  Repeated scans now use map lookups. SQL, metric definitions, discrepancy
  precedence, display-name collision behavior and final sorting are unchanged.
  The indexes use extra map storage in exchange for less repeated work.
- Club dates, event start offsets, chase labels and lights-out reuse seven fixed
  `Intl.DateTimeFormat` instances. Each call still computes the supplied date's
  actual London offset, including daylight-saving changes. Only formatters are
  reused; dates, decisions and user data are not cached.
- Chase labels no longer copy an already-filtered array or copy/reverse it to
  find the last sent rung. Stable sorting and first/last tie behavior remain.

## Code size and structural comparison

Physical source lines include comments and whitespace. Shared files added by
this change are included, so extraction does not disappear from the count.
The benchmark and this report are separate evidence artifacts, not application
code; adding them increases total repository text despite the application
reduction.

| Measure                                                         |  Before |   After |            Change |
| --------------------------------------------------------------- | ------: | ------: | ----------------: |
| Application source files                                        |     715 |     718 | +3 shared modules |
| Application source lines                                        | 128,657 | 128,621 |               −36 |
| Lines in the 17 affected application files                      |   3,890 |   3,854 |               −36 |
| Explicit loops in affected files                                |      30 |      25 |                −5 |
| `if`, conditional-expression and `case` nodes in affected files |     181 |     172 |                −9 |
| Function-like nodes, including callbacks                        |     226 |     232 |                +6 |

The structural counts come from the TypeScript parser. They are counts of syntax,
not a claim of a universal complexity score. Callbacks increased because the
shared grouping and index construction use selectors. The total line reduction
is modest (0.028%): the larger gain is eliminating repeated expensive work and
independent copies of rules, without compressing readable code or deleting tests.

For report assembly, let E be events and R the relevant result rows. Repeated
per-event `find`/`filter` scans previously cost up to O(E × R); building indexes
and reading tallies costs O(E + R). Per-person duplicate-cell lookup changes from
a scan of their event cells to a map lookup. Existing final sorts and database
query costs remain; this is not a measured end-to-end report latency claim.

## Reproducible performance comparison

Run from the checkout root:

```sh
node scripts/analysis/lan-443-benchmark.mjs cd5f8187
```

The script transpiles the actual baseline and working-tree modules, asserts
identical results for 37,336 inputs, warms each version, alternates measurement
order, and reports five-run median times for 2,000 calls. The inputs cover every
hour of a leap year, both London clock changes, date-only events and invalid day
strings. It makes no database calls and writes nothing.

Measured locally on Node v23.7.0, ICU 76.1, after the full test/build
run had completed:

| Helper (2,000 calls) | Before median | After median |  Ratio |
| -------------------- | ------------: | -----------: | -----: |
| `todayInClubZone`    |      68.32 ms |      3.14 ms | 21.78× |
| `formatClubDay`      |     197.84 ms |      2.88 ms | 68.69× |
| `eventStartInstant`  |     186.34 ms |      9.09 ms | 20.51× |
| `formatChaseDue`     |      66.40 ms |      1.14 ms | 58.14× |
| `isLightsOut`        |      66.67 ms |      4.06 ms | 16.40× |
| `lightsOutReleaseAt` |     136.94 ms |      7.44 ms | 18.41× |

These are warmed helper microbenchmarks, not application-wide speedups. Cold
module initialization still constructs the formatters, and production hardware,
Node/ICU versions, database work and network latency will change the result.
A preliminary run overlapping the test suite was discarded for timing purposes.

## Verification

- `npm run verify`: **passed**, including formatting, lint, route types/TypeScript,
  Knip, unit/database tests and the Next.js production build.
- Tests: **354 files passed; 9,000 tests passed; 11 skipped**. Existing weekly-report
  (58), roster-board (40), recruitment-board (5), onboarding-activity (4), event
  action, date and messaging suites cover the affected behavior.
- Lint: zero errors, 2,290 warnings, the same warning count as the initial run.
  No lint rule was disabled or changed.
- Benchmark: **37,336 before/after equality assertions passed**; the reproducible
  script is committed alongside this report.
- The subsequently added benchmark/report also passed focused ESLint/Prettier
  checks and `git diff --check`.
- The first sandboxed verification attempt stopped at the local lease-registry
  permission check. Re-running through the approved local-stack execution path
  passed. No database guard was bypassed.

The benchmark and this report are evidence additions after the application
verification run. GitHub CI status is recorded on the draft PR, rather than
predicted here. No independent agent review or production load test is claimed.

## Deliberately retained opportunities

The large delivery and scheduler modules contain superficially similar branches
with different consent, token, retry, escalation and audit behavior. Combining
those dispatchers needs its own complete contract and targeted failure analysis;
a smaller file alone would not prove a safer or faster application.

Calendar and Oxford-year date grouping look similar but differ in malformed-date
handling and undated ordering. They were not merged. Authentication helpers were
also left in place rather than changing a security boundary to remove a few lines.

No end-to-end request latency, production load, database query plan, browser
bundle reduction or infrastructure-cost improvement is claimed. There are more
formatter call sites and query paths that could be profiled in a subsequent
focused pass. No tests or explanatory domain history were removed to inflate the
line reduction.

## Production handoff

- Supabase schema migration: **No**; filenames: **None**.
- Compatibility and deployment order: backward compatible application-only change;
  merge before a deliberate owner deployment. No data or configuration step.
- Pilot setup required: **No**; scripts: **None**. Local synthetic proof suffices
  for these internal refactors.
- Pilot cleanup required: **No**; scripts: **None**.
- Other Brian action: **None** for setup. The PR stays draft; merge and deployment
  remain owner actions under the repository rules.
- Verification after Brian acts: follow `docs/deployment.md` smoke checks, then
  confirm an event edit, roster/recruitment reads and report generation behave as
  before. The normal scheduler continues applying the same lights-out rules.

Rollback is the previous application revision under `docs/deployment.md`; no
schema forward-fix, data cleanup, credential change or external setup is needed.
