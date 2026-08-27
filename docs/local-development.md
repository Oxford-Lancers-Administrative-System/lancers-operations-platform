# Local development

From nothing to a running app against a local Supabase stack.

## Prerequisites

| Tool    | Version                 | Notes                                                     |
| ------- | ----------------------- | --------------------------------------------------------- |
| Node.js | ≥ 20.9 (22 recommended) | Next.js 16 minimum. CI and the container use 22.          |
| npm     | 10+                     | Ships with Node.                                          |
| Docker  | running                 | Required by the Supabase CLI. Docker Desktop or OrbStack. |
| Git     | any                     |                                                           |

The Supabase CLI is a dev dependency, so `npm install` provides it. You do not
need a separate Homebrew install.

## Clone to running, from a clean machine

```bash
git clone git@github.com:Oxford-Lancers-Administrative-System/lancers-operations-platform.git
cd lancers-operations-platform

npm install            # installs dependencies, including the Supabase CLI

npm run db:acquire -- LAN-###  # claim primary, or overflow if primary is occupied
npm run db:acquire-mission -- M-<id> --base-commit <sha> --migration-head <number>
npm run db:start               # first run pulls container images — several minutes
```

`db:start` generates the untracked `.env.local` for the assigned stack, then
automatically restores the synthetic review state, fixed confirmed review
account, and its one operator link. The password is read from mode-0600
machine-local coordinator state shared across worktrees and both slots; it is
never printed or stored in the repository. Then:

On a clean machine, the issue agent initializes that shared file from the
owner-approved credential in its private task context through the bootstrap's
`LANCERS_LOCAL_REVIEW_PASSWORD` process environment. The value is never placed
in a shell command or durable handoff and is removed from the process environment
after initialization. This is agent-owned setup; Brian is not given a command.

Local GoTrue accepts passwords of at least eight characters so it can restore
the owner-approved fixed review credential idempotently. This setting belongs to
the local Supabase configuration only and does not configure hosted Auth.

```bash
npm run dev:slot         # assigned application URL (:3000 primary, :3010 overflow)
```

The separate seed/user/link commands remain available for focused development,
but normal start and reset perform all three idempotently.

`db:seed` writes roughly seventeen thousand rows of deterministic synthetic data —
two seasons, 52 people, 110 events and the full participation loop. It contains
no real person, contact detail or club record: names come from an invented pool,
every email domain is under the reserved `.example` TLD, and every phone number
is in a range reserved for fiction. It refuses to run against anything but
loopback.

**The dataset's calendar is derived from your machine clock**, so today always
sits inside the seeded season: some of it has happened, with registers taken and
then lapsed, and the rest is still to come. The club's history is authored once
and slid onto today as a whole — by a whole number of weeks, so every weekday,
term week and weekly session keeps its place — rather than re-authored, so the
messiness the dataset exists for is unchanged. Two runs on the same day produce
identical rows; a run tomorrow produces the same club, one day later. The rule
and its bounds are in `scripts/lib/seed-clock.mjs`, and the seed prints the
offset it used, along with the three attendance states — a saved register, an
occurred session with none, and one whose register is open and empty — and the
event to open for each.

The practical consequence: **re-seed when you come back to a stack you left
running overnight.** `npm run db:reset` is the whole of it. The suites that read
the seeded dataset read the frame back out of the database rather than from the
clock, so they do not care which day it was seeded on.

`db:link-operator` creates the one `operator_accounts` row that lets a session
resolve to a club Person (LAN-71). It picks the seeded person holding the most
currently-effective committee seats in the current committee year, so the local
operator has a realistic role list rather than an empty one. It refuses any
non-local database, prints no key material, and is safe to run twice — a second
run reports the existing link and changes nothing. Skip it and the app still
works; `/operate` shows the unlinked account state — “You’re signed in, but this
account is not connected to a Lancers operator profile” — and no operator data.

`db:link-coach` creates a **second** local login, for the coach surface LAN-110
builds. It is needed because that surface is shown only to an operator whose sole
authority is coaching, and the operator login above deliberately holds committee
seats: signing in as it correctly produces the operator's board, so the coach's
screens cannot be reached from it at all. The script links a seeded person who
holds a current-season `head_coach` seat and no other role, and brings that
appointment forward to today when it has not started yet — the 2026-27 coaches
are seeded from 1 September, and the local stack's today is usually before that.
It changes `scripts/seed-local.mjs` not at all; the deterministic dataset other
suites are written against is untouched. Like the operator link it refuses any
non-local database, prints no key material, and is safe to run twice.

Both logins share one password, held in the protected machine-local review
account. There is no hosted counterpart to `db:link-coach`: on hosted, a coaching
seat is granted by Brian through the supported administrative path, and
`scripts/pilot/lan-110/README.md` says exactly how.

Sign in at the assigned `/login` URL shown by `db:acquire` with the fixed local
review account supplied directly in a visual-review handoff. You should reach
`/operate`, which sends you on to the
first destination your roles permit — `/operate/roster` today. The assigned
application port is `:3000` for primary and `:3010` for overflow.

> These local keys are generated by the CLI for a throwaway container. They are
> not club secrets — but `.env.local` is git-ignored and stays that way. A
> **production** secret key must never appear on a development machine.

## Optional: address search on the event venue field

The event editor's venue field (LAN-115) offers searchable place and address
suggestions when a provider is configured, and is an ordinary free-text field
when one is not. **Nothing needs configuring for the application to work**, and
the unconfigured state is the correct one for CI and for any deployment nobody
has chosen a provider for — no request is made to anybody.

To turn it on locally, add one line to `.env.local`:

```bash
VENUE_SEARCH_PROVIDER=photon
```

There is no API key, no account and no cost. The provider is
[Photon](https://photon.komoot.io), Komoot's open-source OpenStreetMap
geocoder; `src/lib/venue-search/photon.ts` records why it was chosen over the
keyed alternatives and why Nominatim — whose usage policy forbids autocomplete
— is not offered. Restart `npm run dev` after adding the line: it is read
server-side, per request, by `src/lib/venue-search/config.ts` alone.

| Variable                | Required  | Meaning                                                                                                                                                            |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VENUE_SEARCH_PROVIDER` | to enable | `photon` is the only implemented value. Unset, blank, or anything else means no address search — never a default.                                                  |
| `VENUE_SEARCH_BASE_URL` | no        | A self-hosted Photon instance, no trailing slash. Blank uses the free public one. Must be `http(s)`, with no credentials or query string, or the search stays off. |

**What using the public instance obliges.** It is free, with a fair-use
expectation and no availability guarantee. The field debounces so that typing a
venue is a handful of requests rather than one per keystroke, and the endpoint
is authorized with `event_calendar_management` so only calendar operators reach
it. If the club's usage ever outgrows fair use, the answer is a self-hosted
instance through `VENUE_SEARCH_BASE_URL`, not a busier public one. Suggestions
come from OpenStreetMap, which is ODbL-licensed; one chosen address stored on an
event is ordinary use.

**How it fails.** Every failure ends in the same place — type the venue by hand
— with a different sentence under the field: unconfigured, busy (the provider
rate-limited us), or unavailable (down, timed out, or answering with something
unusable). None of them blocks filling in or saving the draft, and the club's
own pitches, which no geocoder indexes, are typed rather than searched.

## Everyday commands

| Command                                                                      | What it does                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `npm run dev`                                                                | Dev server on :3000                               |
| `npm run dev:slot`                                                           | Dev server on the claimed slot's application port |
| `npm run build`                                                              | Production build (also typechecks)                |
| `npm run start`                                                              | Serve the production build                        |
| `npm run lint` / `lint:fix`                                                  | ESLint                                            |
| `npm run format` / `format:check`                                            | Prettier                                          |
| `npm run typecheck`                                                          | `next typegen` (route types) then `tsc --noEmit`  |
| `npm run test` / `test:watch`                                                | Vitest                                            |
| `npm run verify`                                                             | format:check → lint → typecheck → test → build    |
| `npm run db:acquire -- LAN-###`                                              | Claim a fenced primary/overflow database slot     |
| `npm run db:acquire-mission -- M-… --base-commit <sha> --migration-head <n>` | Allocate one isolated mission-owned stack         |
| `npm run db:attach-mission -- M-… --token <token>`                           | Attach a mission worker worktree to its stack     |
| `npm run db:start` / `db:stop` / `db:status`                                 | Guarded lifecycle for the claimed stack           |
| `npm run db:reset`                                                           | Reset, seed, and restore the fixed review login   |
| `npm run db:seed`                                                            | Load the deterministic synthetic dataset          |
| `npm run messaging:ticker`                                                   | Drive the messaging sweep locally, beside the app |
| `npm run db:seed-user`                                                       | Create/update the local test user                 |
| `npm run db:link-operator`                                                   | Link that test user to a seeded person and roles  |
| `npm run db:link-coach`                                                      | Link the second login to a coaching seat only     |
| `npm run types:generate`                                                     | Regenerate `src/lib/supabase/database.types.ts`   |
| `npm run types:check`                                                        | Fail if those types have drifted                  |
| `npm run check:rls`                                                          | Fail if a migration creates a table without RLS   |
| `npm run db:heartbeat`                                                       | Refresh the current slot lease                    |
| `npm run db:review-ready`                                                    | Validate browser evidence and protect review      |
| `npm run db:release`                                                         | Stop and release the current fenced stack         |
| `npm run db:cleanup-stale`                                                   | Stop and retire abandoned or orphaned stacks      |
| `npm run visual:start`                                                       | Supervise a pending visual environment            |
| `npm run visual:preflight -- /route …`                                       | Measure both viewports and capture the artifacts  |
| `npm run visual:status`                                                      | Report whether it is still genuinely ready        |
| `npm run visual:disposition -- --set <state>`                                | Record approved/rejected/obsolete/abandoned       |
| `npm run visual:release`                                                     | Stop the supervisor and hand the slot back        |

### Seeing the messaging ladder advance

The chase ladder is driven by one request — `POST /api/scheduler/messaging` —
and nothing in the application makes it. Cloud Scheduler makes it in the deployed
environment; locally, this does:

```bash
npm run messaging:ticker
```

Run it in a second terminal beside `npm run dev`. It reads `.env.local` for the
application port and `SCHEDULER_TRIGGER_TOKEN`, ticks every fifteen seconds
(`MESSAGING_TICK_MS` to change that), prints only the ticks that did something,
and **refuses any target that is not loopback**.

Without it, an approved event's invitation waits at its dispatch anchor, no
reminder is ever sent, and nothing escalates. That looks exactly like a broken
ladder and is not one — see `docs/operating-the-slice.md` §7.

**A fresh `.env.local`, as `npm run db:start`/`db:reset` write it, cannot send
anything yet — LAN-181, F-L3.** It carries the database connection, the
Supabase keys and the review login, and nothing about delivery: no
`APP_BASE_URL`, no `SCHEDULER_TRIGGER_TOKEN`, and none of `config.ts`'s
required outbound variables. Following only what is above this point gets you
`npm run messaging:ticker` refusing to start (`SCHEDULER_TRIGGER_TOKEN` is not
set), or, with a token added, a ticker that runs and reports `accepted 0,
refused N` forever with `.lancers-runtime/delivery-sink/` never created —
because `resolveOutboundConfig` refuses to run without its own settings, the
same way a deployment does. Add these by hand, once per worktree, after
`db:start` or `db:reset` has written the file (they are placeholders — see
"Two things" below for why none of this is a secret):

```
APP_BASE_URL=http://localhost:3000
SCHEDULER_TRIGGER_TOKEN=local-only-not-a-secret
WHATSAPP_PHONE_NUMBER_ID=local-stub
WHATSAPP_ACCESS_TOKEN=local-stub-not-a-secret
WHATSAPP_TEMPLATE_NAME=event_invitation
DELIVERY_RECIPIENT_ALLOWLIST=07700 900901
EMAIL_API_KEY=local-stub-not-a-secret
EMAIL_FROM_ADDRESS=Oxford Lancers <events@lancers.example.org>
DELIVERY_EMAIL_ALLOWLIST=nobody@example.test
```

`3000` is the primary slot's port; an overflow or mission slot's `.env.local`
already carries a different `PORT` from `db:start` — match `APP_BASE_URL` to
that value. `DELIVERY_RECIPIENT_ALLOWLIST` is the
one line worth reading rather than pasting: it has to hold the phone number of
whoever you want the club to be able to message, in the same free-text shape
you would type on a roster form — § 4's walkthrough has you create
"Runbook Walker" at `07700 900901` for exactly this reason. A seeded person's
own number works too; find one with
`select raw_value from public.contact_points where kind = 'phone' limit 1;`.
`DELIVERY_EMAIL_ALLOWLIST` only matters once a reminder reaches the email rung
or the WhatsApp-unresponsive fallback; a placeholder that matches nobody is
fine until you need to see one of those.

Two things make the loop reviewable with no Meta account and no Resend key:

- **The local delivery sink** stands in for both providers, accepts the real
  Graph and Resend payloads, validates each against the declared template
  registry, and writes every rendered message to `.lancers-runtime/delivery-sink/`.
  It is chosen by **runtime detection and never by a flag**: a deployed runtime
  cannot reach it however the environment is set.
- **`DELIVERY_SINK_FAILURES`** makes the sink refuse named recipients, so a real
  delivery failure — and a WhatsApp failure the email fallback then carried — are
  states somebody can actually look at.

`npm run db:seed` also seeds the ladder itself: events mid-chase, fully
delivered, queued, genuinely failed, one whose WhatsApp failed and whose email
carried it, somebody with no usable route, a held job, a cancelled job, and one
event past its escalation threshold with a flag raised.

### Closing out a finished issue

When an issue's pull request has merged, the slot it held is still held, its
worktree is still on disk, and its stack may still be running. Reclaim them in
this order — run the first command from **inside** the issue worktree:

```bash
npm run db:release   # stops first; the token lives in .lancers-runtime/
git worktree remove <path> && git worktree prune && git branch -d <branch>
```

Release is one fenced retirement operation: it marks the record as retiring,
stops its Supabase project, and only then makes the slot reusable. Removing the
worktree first still destroys its private token, but `db:cleanup-stale` can
retire the resulting orphan once every recorded holding path is gone.

`/finish-issue LAN-###` does exactly this, after proving from the repository
that the work merged, and closes the Linear issue with one comment. It fails
closed on an unmerged pull request, a dirty or unpushed worktree, or a lease
that now belongs to another session.

Two details bite if you do it by hand. The merge proof has to test the pull
request's **merge commit**, because this repository squash-merges and a merged
branch's own head is never an ancestor of `main`:

```bash
git fetch origin
gh pr list --head <branch> --state all --json number,state,mergeCommit,headRefOid
git merge-base --is-ancestor "<mergeCommit>" origin/main && echo merged
```

Find the pull request with `--head <branch> --state all`: a bare-text `--search`
does not match a head-branch name, and `gh pr list` shows only open pull
requests by default, so neither finds a merged one.

And to read the lease registry, use `npm run db:coordinator status`, which is
read-only and prints every slot's issue, worktree, state and application port
with tokens stripped. `npm run db:status` is a different thing: it validates
_this_ worktree's token, writes a heartbeat, and fails when there is no lease or
the stack is already stopped.

The authoritative lease registry lives in machine-local state, keyed by the
repository remote so clones and worktrees coordinate. `.lancers-runtime/` in
the claiming worktree holds generated config and its fencing token and is
ignored. Every lifecycle or mutating database command validates that token.
Primary keeps the familiar ports; overflow receives a distinct project ID,
complete service-port set, and application port automatically. Do not edit the
tracked `supabase/config.toml` to make a second stack.
If an interrupted holder leaves containers running, cleanup stops the recorded
Supabase project before returning the slot. Only a slot with no record at all
fails closed on occupied ports, because only there is it genuinely unknown whose
process is listening.

**When a slot becomes available again.** A lease is held while its heartbeat is
fresh — every guarded database command refreshes it — and for four hours after
the last one. Two facts decide recovery, and neither is the owning process on
its own: a conclusively dead owner is reclaimed at once, and an owner that
cannot be told apart from a live one waits out that window. The process alone
cannot decide because every agent in one Claude session shares that session's
pid, so a live pid says nothing about whether the agent that took the lease
still exists. A `review-ready` slot is never reclaimed on a timer; it remains
protected while any recorded holding worktree exists. `npm run db:cleanup-stale`
also retires an orphaned `review-ready` stack once every holder path is gone.

For UI work the environment has an owner of its own. `npm run visual:start`
spawns a detached supervisor that holds the application and refreshes the
database lease on a timer; the agent that started it can then exit, and the
environment stays reachable, authenticated and seeded until it is approved,
rejected, obsoleted or explicitly abandoned. `npm run visual:status` says
whether it is genuinely still ready, and refuses it once its supervisor is gone,
once it has stopped proving itself live, or — the failure that looks fine —
once the branch has moved past the head it serves, because Brian would then be
approving something that is not what would merge.

`npm run visual:preflight -- /route …` drives a real browser through the real
login and **measures** each viewport by asking the browser context how wide it
actually is, capturing a screenshot per route. This replaces a self-reported
`phone375Verified` boolean, which this machine could not honestly produce —
Chrome's window resizing is clamped well above 375px here — so the claim was
satisfied on paper and refused in practice. A browser context is exactly the
width it is told to be.

The result lands in ignored `.lancers-runtime/visual-review.json`, with the
screenshots beside it. `db:review-ready` refuses to protect the slot unless the
assigned loopback URL, real login, seeded states, review routes, exact head SHA,
and both measured viewports with the artifacts they name are all present, and
unless the running stack holds this holder's rendered configuration. Neither
record contains a password.

Run `npm run verify` before opening a pull request. It is what CI runs.

### Two test projects, and why your new test may be refused a database

There is one local database, so `vitest.config.ts` splits the suite in two. The
files listed in `DATABASE_TEST_SUITES` run in the `database` project, **one at a
time**; everything else runs in the `unit` project, in parallel, and is refused
a PostgreSQL connection and a call to the local Supabase Data API.

If a test you have just written fails with

> … opened a PostgreSQL connection, but it is not declared as a database suite.

then add its repository-relative path to `DATABASE_TEST_SUITES` in
`vitest.config.ts` and run it again. That is the whole procedure — the guard
exists so that nobody has to know this rule in advance.

Run one project on its own with `npx vitest run --project database` or
`--project unit`. The `database` project is the slow half by design; ADR
[0029](adr/0029-serialized-database-test-suites.md) records what it costs and
what it bought.

## Building and running the production container locally

The same image CI builds and Cloud Run runs. Worth doing before touching the
`Dockerfile` or anything that only breaks in a production build.

```bash
docker build -t lancers-ops:local \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://192.0.2.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_placeholder \
  --build-arg GIT_COMMIT_SHA=local .

docker run --rm -p 8080:8080 -e SUPABASE_SECRET_KEY=local-placeholder lancers-ops:local
```

Then probe it exactly as CI does:

```bash
curl -s localhost:8080/api/health          # {"status":"ok", ... "secretsLoaded":true}
curl -o /dev/null -w '%{http_code}\n' localhost:8080/          # 200
curl -o /dev/null -w '%{http_code}\n' localhost:8080/login     # 200
curl -o /dev/null -w '%{http_code}\n' localhost:8080/dashboard # 307
curl -o /dev/null -w '%{http_code}\n' localhost:8080/operate   # 307
```

`NEXT_PUBLIC_*` values are **inlined at build time**, so they must be passed as
build arguments — setting them at `docker run` has no effect. The placeholders
above point at TEST-NET-1 (RFC 5737), which is unroutable: the point is to prove
the image serves pages without reaching a database. To exercise it against your
local stack instead, build with your real `.env.local` values and run with
`--add-host=host.docker.internal:host-gateway`.

## Studio and mail

- Supabase Studio — <http://127.0.0.1:54323>
- Mailpit (all local outbound mail) — <http://127.0.0.1:54324>

On the overflow database slot every port is different — Studio is 55323 and
Mailpit 55324. `npm run db:status` prints the set your slot actually has.

## Password recovery, locally

Nothing leaves your machine: Supabase's local stack posts every email to Mailpit
instead of sending it, so the whole recovery journey is exercisable by hand.

1. Sign-in page → **Forgot password?**, or go straight to
   <http://localhost:3000/forgot-password>.
2. Enter the local review address. Any address is accepted and answered
   identically — that is deliberate, and it is why the confirmation says "if an
   account exists" rather than "sent".
3. Open Mailpit at <http://127.0.0.1:54324> and click the link in **Reset your
   Lancers Operations password**.
4. The link lands on `/auth/recovery`, which exchanges the one-time token and
   sends the browser to `/reset-password` with the token stripped from the URL.
5. Choose a new password. You are signed out and returned to `/login`, where the
   new password works and the old one does not.

Because it changes the password, do this against a synthetic account rather than
the fixed review login unless you intend to change that login's password — the
review login's password lives in protected machine-local state and is what
`npm run db:seed-user` restores.

## Operator invitation, locally

The same machinery, and the same Mailpit: an invitation never leaves the machine
either. This is the whole first-access journey, end to end.

1. Sign in as the local review operator, who holds `role_management`, and invite
   somebody through the Administration surfaces — or call
   `inviteOperator()` from a script or a test.
2. Open Mailpit at <http://127.0.0.1:54324> and click the link in **Your Oxford
   Lancers operations account**.
3. The link lands on `/auth/invitation`, which exchanges the one-time invite
   token and sends the browser to `/reset-password` with the token stripped from
   the URL.
4. Choose a password. The account is recorded as activated at that moment — not
   when the link was opened — and Administration moves it from **Invitation
   pending** to **Active**.
5. You are signed out and returned to `/login`, where the new password works.

An expired link is normal and is not an error: ask for a resend. **Delivery
failed** is what an account shows when the send itself failed; the person, the
account and their role assignment are all still there, and Resend is offered.

### The Auth configuration this depends on

Four entries in `supabase/config.toml`, and all of them are **local only** — the
hosted project's equivalents are set in the Supabase dashboard and are listed in
[`deployment.md`](deployment.md) § Password recovery.

| Setting                           | Value                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[auth] additional_redirect_urls` | includes `http://localhost:3000/auth/recovery`, `http://127.0.0.1:3000/auth/recovery`, `http://localhost:3000/auth/invitation` and `http://127.0.0.1:3000/auth/invitation`                                  |
| `[auth.email.template.recovery]`  | `./supabase/templates/recovery.html`, which links `{{ .RedirectTo }}?token_hash=…&type=recovery`                                                                                                            |
| `[auth.email.template.invite]`    | `./supabase/templates/invite.html`, which links `{{ .RedirectTo }}?token_hash=…&type=invite`                                                                                                                |
| `[auth.rate_limit] email_sent`    | 60 an hour. The CLI default of 2 makes the invitation flow untestable — one invitation, a resend and a correction is already three — and the limit protects nothing on a stack whose mail server is Mailpit |

The port is rewritten per slot when the coordinator renders the runtime config,
so the overflow slot allow-lists `http://localhost:3010/auth/recovery` instead.
Both loopback spellings are listed because a browser opened on either must work.

Exact URLs, not a wildcard. A destination Supabase does not recognise is silently
replaced with the Site URL, so the symptom of getting this wrong is a recovery
link that lands on the sign-in page with no error anywhere.

An edit to `supabase/config.toml` reaches the running stack on the next
`npm run db:start` or `npm run db:reset`, which re-render the slot's runtime copy
before the CLI reads it.

## Migrations

```bash
npx supabase migration new descriptive_name   # creates supabase/migrations/<ts>_descriptive_name.sql
# edit the file
npm run db:reset                              # re-apply everything from empty
npm run db:seed                               # confirm the seed still loads
npm run types:generate                        # regenerate types
npm run check:rls                             # RLS posture gate
npm run test                                  # constraint, security and seed tests
```

Commit the migration **and** the regenerated types together. CI fails if they
disagree.

Every migration that creates a table in an exposed schema must:

- enable RLS on it in the same migration — [ADR 0002](adr/0002-rls-posture.md);
- revoke all privileges from `anon`, `authenticated` **and** `service_role`,
  then grant back only what the server path needs — [ADR 0010](adr/0010-domain-table-access-posture.md);
- have an entry in [`architecture/data-model.md`](architecture/data-model.md).

Migrations already applied to a shared environment are **never** edited or
reordered. Correct them with a new migration, and read
[`migration-runbook.md`](migration-runbook.md) before going anywhere near hosted
Supabase.

## Working against the database directly

The domain tables are not reachable through the Data API by design, so schema
work and the schema tests connect to PostgreSQL directly:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

`scripts/lib/local-db.mjs` is the shared entry point used by the seed and the
tests. Its guard refuses any host that is not loopback and any hosted Supabase
connection string. Do not weaken it.

## Troubleshooting

**`Cannot connect to the Docker daemon`** — Docker is not running. Start it and
retry `npm run db:start`.

**`Email logins are disabled` on sign-in** — `[auth.email] enable_signup` in
`supabase/config.toml` has been set to `false`. In this CLI version that flag
also gates the email provider itself. Public registration is disabled by
`enable_signup = false` under `[auth]`, which is the correct lever. Leave
`[auth.email] enable_signup = true`.

**Both database slots are occupied** — continue database-independent work and
retry acquisition later. Inspect ownership with `npm run db:coordinator --
status`. Never edit the registry or break a live or uncertain lease.

**Types keep coming back "drifted"** — you edited
`src/lib/supabase/database.types.ts` by hand. Don't; regenerate it.

**Schema tests fail with "seed is not loaded"** — `npm run db:reset` wipes the
synthetic data. Re-run `npm run db:seed`.

**Sign-in stops working after a reset** — this is a defect: `db:reset`
automatically recreates and confirms the fixed review account and operator link.
Inspect the failed reset output and repair the local stack; do not ask Brian to
run setup commands.

**`/operate` says "Operator profile not connected", or `/dashboard` says this
account cannot access the operator area** — `db:reset` wipes the
`operator_accounts` row along with everything else, then recreates it. A missing
link after a successful reset is a bootstrap defect to repair.

The two `/operate` account states are different problems and say so. "Operator
profile not connected" means there is no `operator_accounts` row for the signed-in
user — the fix above. "Your Lancers operator access is inactive" means the row
exists with `is_active = false`, which locally only happens if you set it
yourself; set it back rather than re-seeding.

**`/operate/report` says you do not have access to this action** — it is meant
to, for everybody, until LAN-81 records who an "authorized report operator" is.
The capability is declared with no role codes in `src/lib/auth/capabilities.ts`
and refuses every operator, deliberately, rather than guessing.

**A database command says the token is missing, invalid, or stale** — acquire a
slot for this issue worktree. If a previous owner was reclaimed, its old token
is intentionally fenced out and must not be reused.
