# Sweep environment recipe

What the operator runs once, before any walker starts. It produces the four
values the [walker brief](walker-brief.md) needs — `SCRATCH`, `APP_URL`,
`STACK` and `HEAD` — and the signed-in sessions the walkers use.

Everything here is local. No step reaches hosted Supabase, and no step needs a
secret typed anywhere: the review password lives in a machine-local file that
`scripts/lib/local-review-account.mjs` reads, and it must never be printed,
logged or passed on a command line.

## 0. A checkout at the head you are sweeping

Sweep a build, not a working tree. Check out the exact commit, note it as
`HEAD`, and `npm ci` if `node_modules` is missing — a fresh worktree has none,
and every guarded database command fails with a bare exit 1 when the Supabase
CLI is not there.

## 1. A database slot

```bash
npm run db:acquire -- LAN-###
npm run db:start
```

`db:start` renders this holder's configuration, brings the stack up, applies
every tracked migration, writes an untracked `.env.local` for that slot, and
seeds the review logins. The slot you are given decides the ports: the primary
slot serves the app on 3000 and Postgres on 54322, overflow on 3010 and 55322.

`STACK` is `supabase_db_lancers-operations-platform-<slot>`. There is no host
`psql`; query through the container:

```bash
docker exec -i supabase_db_lancers-operations-platform-primary psql -U postgres -d postgres -c "select 1"
```

Keep the lease alive for the length of the sweep — `npm run db:heartbeat` at
least every twenty minutes, or a loop in the background. A stale heartbeat is
enough for somebody else's cleanup to reap a stack that is still in use.

## 2. A clean schema, the two review logins, and the dataset

The tester-week dataset is the point of the sweep: walkers must meet what the
testers will meet. Load it onto a schema with nothing else on it.

```bash
node_modules/.bin/supabase db reset --local --yes --workdir <runtimeRoot>
```

`<runtimeRoot>` is the `runtimeRoot` on your lease — print it with
`node scripts/local-supabase-coordinator.mjs status`. Set `SUPABASE_WORKDIR` to
the same path for anything else you run, or the CLI hunts for the unsuffixed
project and reports the stack as stopped.

Then create the two logins, reading the email and password from
`readLocalReviewAccount` in `scripts/lib/local-review-account.mjs` and the
coach's address from `LOCAL_REVIEW_COACH_EMAIL` in the same module — never a
literal, and never echoed:

```
TEST_USER_EMAIL=<review operator>  TEST_USER_PASSWORD=<from the module>  node scripts/create-test-user.mjs
TEST_USER_EMAIL=<review coach>     TEST_USER_PASSWORD=<from the module>  node scripts/create-test-user.mjs
```

Read both users' ids out of `auth.users` and write them into the private
parameter file as `tester1.authUserId` and `tester5.authUserId`. Two of the five
seats is enough: the checklists deal each seat another seat's operator record
and walk on round the seats until they find one that exists, so five seats
resolve from two accounts.

Then the four loader phases, in order, all against the local database:

```
node scripts/production/showcase.mjs load       --params <params> --database-url $SUPABASE_DB_URL
node scripts/production/showcase.mjs report     --params <params> --database-url $SUPABASE_DB_URL
node scripts/production/showcase.mjs verify     --params <params> --database-url $SUPABASE_DB_URL
node scripts/production/showcase.mjs checklists --params <params> --database-url $SUPABASE_DB_URL \
  --out SCRATCH/checklists --base-url APP_URL
```

`verify` must end in "Everything reconciles." A state it reports as short is a
dataset defect, and finding it here costs a reload; finding it during the sweep
costs a walker's whole group. The parameter file and the checklists carry live
credentials for the named testers: keep both out of the repository and hand a
checklist only to its own tester.

## 3. A production build, not `next dev`

```bash
npm run build
npm run start   # or: PORT=<the slot's port> node_modules/.bin/next start
```

Walk the production build. `next dev` compiles on demand and multiplies a
one-second query into ten or more, so every page reads as slow and the "over
3 s is a finding" rule produces nothing but noise. `APP_URL` is
`http://127.0.0.1:<the slot's port>`.

A standalone `next start` does not load `.env.local` on its own. If pages return
500s, that is why — and a 500 renders fast, so a page that looks quick may
simply be broken. Check the status, not the timing.

## 4. Signed-in sessions

Walkers must never be given a password. Sign in once, through the real login
form, and hand out Playwright storage states instead — the password stays inside
that one process:

```js
// SCRATCH/walker-login.mjs — run with node from the repo directory.
import path from "node:path";
import { chromium } from "playwright";
import {
  readLocalReviewAccount,
  LOCAL_REVIEW_COACH_EMAIL,
} from "./scripts/lib/local-review-account.mjs";

const origin = process.env.ORIGIN ?? "http://127.0.0.1:3000";
const out = process.env.SCRATCH + "/auth";
const account = readLocalReviewAccount(process.cwd());
const browser = await chromium.launch();
for (const [name, email] of [
  ["operator", account.email],
  ["coach", LOCAL_REVIEW_COACH_EMAIL],
]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', account.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await ctx.storageState({ path: path.join(out, `${name}.json`) });
  console.log(`${name}: ${page.url().includes("/login") ? "FAILED" : "ok"}`);
  await ctx.close();
}
await browser.close();
```

The operator state holds committee seats and therefore sees the operator's
board; the coach state sees the coach surfaces only, and both are needed —
several workflows are about what the coach seat is refused.

## 5. Directories the walkers write into

```
SCRATCH/checklists/   the generated tester checklists
SCRATCH/auth/         operator.json, coach.json
SCRATCH/shots/<group>/    screenshots
SCRATCH/work/<group>/     the walker's own Playwright scripts
SCRATCH/findings/<group>.md   the output
```

Create them before dispatching, so a walker never has to decide where anything
goes.

## 6. Afterwards

Collect `SCRATCH/findings/*.md`, deduplicate across groups, file what survives,
and only then release the slot:

```bash
npm run db:release
```

Releasing earlier frees the stack under a walker that is still on it.
