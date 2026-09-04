# LAN-227 — Why the application is slow

Diagnosis only. Nothing here changes application behaviour; every fix below is
a proposal for Brian to approve. Measured 2026-09-04 on an agent-owned local
mission stack (`mission-m-lan-227-slowness-4`, Supabase API `:56401`,
PostgreSQL `:56402`) at `main` `73577d6`, seeded by `npm run db:start`, signed
in as the fixed local review operator.

## 1. Verdict

Two causes stack. Neither alone produces the ten-to-fifteen-second interaction
Brian sees; together they do, reproducibly.

1. **Baseline cost, in the application.** The events list query
   (`listCurrentSeasonEvents`, `src/lib/services/events.ts`) costs about one
   second of pure CPU on the seeded dataset and grows linearly with
   `events × rsvp_responses`. On top of it every operator page authenticates
   twice per render (layout and page), each time as five serial HTTP calls to
   the local Supabase API. Production build, quiet machine: `/operate/events`
   renders in **0.5 s**; other pages in 0.05–0.3 s.
2. **Amplifier, in the environment.** Brian's walkthroughs run under `next dev`
   (every review environment does — `scripts/visual-environment.mjs` and
   `scripts/local-app-command.mjs` both spawn `next dev`), on a machine that at
   measurement time was running three Supabase stacks (37 containers) inside
   one Docker VM sized 8 CPU / 7.75 GiB, four `next dev` servers, a
   `db:reset` in flight, and **22 GiB of 23.5 GiB swap in use** on a 16 GiB
   Mac. Under that load the same one-second query took **0.36–6.0 s** on the
   database side, and the same page took **1.4–17.1 s** end to end.

Suspect 1 from the scout (missing `event_id` indexes) is **not** the cause:
every participation table has a btree on `event_id` and the plans use them.
Suspect 3 (`listTermWindows()` per render) costs 0.3 ms and is irrelevant.

## 2. Measurements

All timings are full-document times (`curl -w %{time_total}`, or Next's own
per-request line in dev), which for a streamed App Router page equals the
server render time. Five requests per route unless noted.

### 2.1 Production build (`next build` + `next start`), machine quiet

| Route                               | Render (s), 3 runs |
| ----------------------------------- | ------------------ |
| `/operate/events`                   | 0.51 / 0.52 / 0.54 |
| `/operate/events?sort=name&dir=asc` | 0.56 / 0.70 / 12.2 |
| `/operate/events?status=occurred`   | 0.31 / 0.31 / 1.23 |
| `/operate/events/<id>`              | 0.22 / 0.21 / 0.19 |
| `/operate/roster`                   | 0.25 / 0.31 / 0.22 |
| `/operate/report`                   | 0.31 / 0.23 / 0.21 |
| `/operate/recruitment`              | 0.15 / 0.15 / 0.18 |
| `/dashboard`                        | 0.09 / 0.06 / 0.06 |
| `/calendar`                         | 0.07 / 0.07 / 0.05 |

In-page period and sort clicks on `/operate/events` (client navigation, RSC
round trip): 0.62–0.82 s each. The two outliers (12.2 s, 1.23 s) coincided
with load from other sessions on the machine; see 2.4.

### 2.2 `next dev`, same stack, same login, same moment as 2.3

| Route                               | Render (s), 5 runs               |
| ----------------------------------- | -------------------------------- |
| `/operate/events`                   | 17.1 / 9.0 / 3.0 / 1.4 / 2.0     |
| `/operate/events?sort=name&dir=asc` | 2.5 / 5.4 / 8.3 / 12.4 / 5.9     |
| `/operate/report`                   | 2.0 / 4.3 / 4.7 / 9.0 / 8.5      |
| `/operate/roster`                   | 2.7 / 1.6 / 1.7 / 1.4 / 1.2      |
| `/dashboard`                        | 0.45 / 0.27 / 0.33 / 0.35 / 0.25 |

Next's own breakdown attributes all of it to `application-code`
(`next.js: 7–112 ms, proxy.ts: 6–79 ms`), so this is not Turbopack compile
latency. In a quieter minute earlier in the session the same dev server served
`/operate/events` in 1.2–1.7 s and `/operate/events?period=all` in 4.2 s.

### 2.3 Production build, same moment as 2.2 (second port, same cookies)

| Route                               | Render (s), 5 runs               |
| ----------------------------------- | -------------------------------- |
| `/operate/events`                   | 1.5 / 1.3 / 3.0 / 2.2 / 1.9      |
| `/operate/events?sort=name&dir=asc` | 1.7 / 1.7 / 2.2 / 1.7 / 1.4      |
| `/operate/report`                   | 0.38 / 0.41 / 0.38 / 0.60 / 0.73 |
| `/operate/roster`                   | 1.2 / 1.7 / 1.9 / 1.1 / 1.9      |

Same machine state as 2.2: production is 3–8× faster than dev under load, and
3–6× slower than production on a quiet machine. Both factors are real.

### 2.4 The machine during 2.2 and 2.3

```
com.apple.Virtualization (Docker VM)   149 % CPU   8.2 GB
kernel_task                            135 % CPU
supabase_analytics_<onboarding stack>  104 % CPU   (one container, idle stack)
vm.swapusage: total = 23552 M  used = 22090 M
docker: 37 containers = 3 Supabase stacks × 12 + 1
next dev servers on the host: 4 (three from other sessions)
db:reset in flight from another worktree: 1
```

### 2.5 Database side (`pg_stat_statements`, this stack only)

The events list statement, identical SQL and data, across the passes above:

| Pass                      | Calls | Mean (ms) | Min (ms) | Max (ms) |
| ------------------------- | ----- | --------- | -------- | -------- |
| Production, quiet         | 30    | 410       | —        | 1 096    |
| Dev + production, loaded  | 25    | 931       | ~0       | 4 246    |
| Dev, sort by name, loaded | 14    | 1 996     | 359      | 5 991    |

The next-most-expensive statement on any page (`/operate/roster`'s membership
read) totals 40 ms across 14 calls. Nothing else on the measured pages is a
database problem.

### 2.6 Outbound HTTP from the server per page render

From a `fetch` timing hook loaded with `NODE_OPTIONS=--import`, production pass:

| Endpoint                         | Calls | Mean (ms) | Max (ms) |
| -------------------------------- | ----- | --------- | -------- |
| `GET /auth/v1/user`              | 89    | 94        | 351      |
| `GET /rest/v1/operator_accounts` | 89    | 16        | 110      |
| `GET /rest/v1/people`            | 89    | 14        | 123      |
| `GET /rest/v1/role_assignments`  | 89    | 11        | 93       |
| `GET /rest/v1/roles`             | 89    | 11        | 202      |

89 calls for 45 page renders: `resolveOperatorAccess()` runs **twice per
render**, once in `src/app/operate/layout.tsx` and once in the page's
`gateShellPage`, and nothing deduplicates it across the request. Each run is
five serial round trips, so ~150 ms quiet and ~300 ms loaded, doubled. That is
the whole render time of the fast pages and the floor under every slow one.

## 3. `EXPLAIN ANALYZE` — the real events list query

Run against the seeded data (110 events in season, 5 094 invitations, 4 585
`rsvp_responses`, 5 099 audience rows, 264 attendance rows), no filters, the
page's default sort:

```
Sort  (actual time=1340.863..1340.874 rows=110)
  Buffers: shared hit=742680
  ->  Seq Scan on events e  (actual time=10.988..1340.075 rows=110)
        SubPlan 1  audience_count   Index Only Scan event_audience_members_event_idx   0.02 ms × 110
        SubPlan 2  invitation_count Index Only Scan invitations_event_status_idx       0.07 ms × 110
        SubPlan 3  response_count   Hash Join (Unique over rsvp_responses_current_idx) 2.7 ms × 110
        SubPlan 4  said_yes_count   Nested Loop                                        9.3 ms × 110
              ->  Subquery Scan on r  Filter: response = 'yes'   rows=3322 loops=110
                    ->  Unique -> Sort (4585 rows, 443 kB) -> Seq Scan on rsvp_responses  loops=110
              ->  Index Only Scan invitations_id_event_key  loops=365420
        SubPlan 5  showed_count     Seq Scan on attendance_records                     0.07 ms × 110
        SubPlan 7  register_saved   hashed Seq Scan on attendance_records              once
Planning Time: 6.6 ms
Execution Time: 1341.4 ms
```

The cost is SubPlans 3 and 4, and overwhelmingly 4. `current_rsvp` is a
`DISTINCT ON (invitation_id)` view over `rsvp_responses`; correlated on
`i.event_id`, the planner cannot push the event into the view, so for **every
event row** it re-materialises the latest answer for **every invitation in
the club** (sort 4 585 rows, 110 times), and then, for the `response = 'yes'`
variant, probes `invitations` once per surviving response (365 420 index
probes). 742 680 buffer hits to return 110 rows. This is CPU-bound, which is
why it degrades in proportion to machine load.

### 3.1 Index situation (from `pg_indexes`, not the migrations)

| Table                    | Relevant indexes                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `events`                 | `events_season_date_idx (season_id, scheduled_on)`, `events_status_date_idx`, `events_status_idx`, pkey, 3 more |
| `event_audience_members` | `event_audience_members_event_idx (event_id)` + 4 unique/partial                                                |
| `invitations`            | `invitations_event_status_idx (event_id, status)`, `invitations_id_event_key (id, event_id)` + 6 more           |
| `rsvp_responses`         | `rsvp_responses_current_idx (invitation_id, responded_at desc, recorded_at desc)` + 2                           |
| `attendance_records`     | `attendance_records_event_idx (event_id)` + 4                                                                   |
| `terms`, `seasons`       | pkey and uniqueness only; both tables have under ten rows                                                       |

Every foreign key the query touches is indexed and every plan above uses the
index. **No index is missing; no index would fix SubPlan 4**, because its cost
is the per-event re-derivation of `current_rsvp`, not a lookup.

### 3.2 How it scales (rolled-back inserts on this stack)

| Data                                | `said_yes_count` subquery alone |
| ----------------------------------- | ------------------------------- |
| Seeded: 110 events, 4 585 responses | 874 ms                          |
| 110 events, 9 170 responses (2×)    | 937 ms                          |
| 110 events, 18 340 responses (4×)   | 2 205 ms                        |
| 220 events (2×), 4 585 responses    | 2 177 ms                        |

Linear in each factor, so quadratic in a season's growth. The tester-week
dataset (LAN-221, "a club that has been running for a term") and a real
season both move along this curve; production will be slower than this seed,
not faster.

### 3.3 The same result from one pass

For the cost of a fix, not as one: the six correlated subqueries replaced by
three grouped aggregates joined once (the `current_rsvp` view computed once,
not 110 times), same data, same output columns, no new index:

```
Sort  (actual time=68.794..69.137 rows=110)
Execution Time: 69.8 ms          (was 1 341 ms — 19× faster)
```

## 4. Named cause per slow surface

| Surface                                        | Cause                                                                                                                                                                         | Evidence      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `/operate/events` and every sort/filter/period | The list query re-derives `current_rsvp` per event (SubPlans 3–4); ~1 s CPU at seed size, first because `period` is applied after the query, so every click re-runs all of it | §3, §2.5      |
| every `/operate/*` page                        | Operator resolution runs twice per render, five serial HTTP calls each (~0.3 s quiet, ~0.6 s loaded)                                                                          | §2.6          |
| `/operate/report`                              | No expensive statement (max 8 ms); slow only under load, plus a React hydration mismatch in `<TableBody>` logged on every render, which forces a client re-render in dev      | §2.2, dev log |
| `/operate/roster`                              | No expensive statement (40 ms total); cost is the double gate plus render                                                                                                     | §2.5, §2.6    |
| everything, on Brian's machine                 | `next dev` (3–8× production) on a host with three stacks, four dev servers and 22 GiB swapped; a CPU-bound query then runs 1–6 s and the page 1–17 s                          | §2.2–2.4      |

Secondary, recorded because they were seen, not because they explain the
symptom:

- `src/lib/services/roster-board.ts:304` issues nine `tx.query` calls under one
  `Promise.all` on a single pooled client. `pg` serialises them and logs a
  deprecation ("client.query() when the client is already executing a query
  … removed in pg@9.0"). No time is saved and the warning will become an
  error on the next major.
- The dev server logs a hydration mismatch on `/operate/report` (server
  renders a `MuiBox` where the client renders a `MuiTypography` "No" cell).
  Not a server-time cost; it is a correctness defect and a client-side cost.

## 5. Is it a regression?

Yes, on both layers, and the first is datable.

- **2026-08-23.** Two merges the same day: `b6b8164` (LAN-153) added
  `said_yes_count` — the `response = 'yes'` correlated subquery that is
  SubPlan 4 — to `COUNT_COLUMNS`; `dae1bc2` (LAN-151) made the seed
  materialise a full year of event instances ("roughly seventy events" per its
  own comment; 110 today with recruitment and social additions) with the whole
  roster in every audience. Before that day the list query had three
  subqueries over a handful of events; after it, six over a season, one of
  them the expensive shape. `response_count` (SubPlan 3, the cheaper
  re-derivation) has been there since `d598e47`, 2026-08-12.
- **The environment layer** has no commit. Concurrency in the harness grew with
  each mission: per-mission stacks (LAN-179 review runtimes, mission
  implementation stacks) mean three full Supabase stacks and four dev servers
  is now an ordinary afternoon, on a 16 GiB machine whose Docker VM alone is
  allotted 7.75 GiB. The onboarding stack's `supabase_analytics` container
  was consuming a full core while idle.

Neither the onboarding mission nor `feat/lan-217-operator-record` touched any
of this, as the scout said.

## 6. Proposed fixes, for approval

None needs a migration. In order of value per cost:

| #   | Fix                                                                                                                                                                                                                                                                               | Removes                                                 | Cost                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rewrite `COUNT_COLUMNS` in `listCurrentSeasonEvents` (and its coach/detail siblings that share it) as grouped aggregates joined once, as in §3.3. Public names and output unchanged.                                                                                              | ~1.3 s → ~0.07 s per events render, and the quadratic   | Application code in one service; the existing events tests and `PARTICIPATION_TABLES` guard prove it. One Sonnet implementation plus review. Normal grade.           |
| 2   | Memoise `resolveOperatorAccess()` per request with React `cache()` so layout and page share one resolution.                                                                                                                                                                       | Half the auth HTTP on every operator page (~0.15–0.3 s) | A few lines in `src/lib/auth/operator.ts`; auth-adjacent so Highest grade review. Could ship with #1.                                                                |
| 3   | Serve review environments from a production build: `visual-environment.mjs` runs `next build` once then `next start` instead of `next dev`. Nothing Brian reviews needs HMR.                                                                                                      | The 3–8× dev-mode multiplier on every walkthrough       | Tooling only; adds ~35 s build per environment start. Note `next start` warns about `output: standalone`; use `node .next/standalone/server.js` or drop the warning. |
| 4   | Environment hygiene, owner-run: cap concurrent stacks (`db:cleanup-stale` after each mission epoch; retire the idle onboarding and mockup stacks), set `[analytics] enabled = false` in `supabase/config.toml` for local stacks, raise the Docker VM memory or lower concurrency. | The swap and the CPU contention                         | Config and runbook; `supabase/config.toml` is tracked so it is a reviewed change. Zero application risk.                                                             |
| 5   | Apply `period` in SQL rather than after the query; and, if the list is ever paged, page it.                                                                                                                                                                                       | Reading the whole season to show one week               | Small once #1 lands; deferrable — after #1 the whole season is 70 ms.                                                                                                |
| 6   | Secondary: sequence the nine `roster-board.ts` queries (or move the independent ones out of the transaction); fix the `/operate/report` hydration mismatch.                                                                                                                       | A pg@9 break and a client re-render                     | Small; can ride the simplification pass (LAN-219).                                                                                                                   |

Not proposed: any index. The catalog already carries the useful ones and the
expensive plan is not a lookup problem. Not proposed: caching the events page
across requests — it is per-operator and changes on every recorded answer, and
after #1 there is nothing left worth caching.

## 7. How to reproduce

On an agent-owned mission stack, from the worktree, with the app served on the
lease's port:

```sh
npm run build && npx next start -p <port>        # production
npx next dev -p <port>                            # what Brian sees
```

Sign in with the local review account (Playwright through the real `/login`),
export the cookies, then:

```sh
for i in 1 2 3 4 5; do curl -s -o /dev/null -H "Cookie: $CK" -w '%{time_total}\n' http://127.0.0.1:<port>/operate/events; done
```

Database side, inside the stack's `supabase_db_*` container:

```sql
select pg_stat_statements_reset();
-- drive the pages, then:
select calls, mean_exec_time, max_exec_time, left(query, 80)
  from pg_stat_statements order by total_exec_time desc limit 10;
```

The `EXPLAIN` in §3 is the literal statement from `listCurrentSeasonEvents`
with the page's default parameters bound; the scaling rows in §3.2 were
produced inside `begin … rollback`.
