# Owner-run production procedures

Everything in this directory is run **by hand, by Brian, against the hosted
project**. Nothing here is invoked by a workflow, a migration, an npm script, a
test, or an agent, and `tests/production-smoke-contract.test.ts` fails if any of
them starts referencing it.

That is the whole reason the directory exists. `scripts/lib/local-db.mjs` and
`src/lib/db/url.ts` refuse every non-loopback database unconditionally, and must
keep refusing — the seed path and the schema tests have no business anywhere
near production. A procedure that legitimately needs the hosted database is
therefore a separate, deliberately awkward thing that names its target out loud,
rather than a flag on a tool used every day.

## `bootstrap-founding-operators.mjs` and `bootstrap/`

The one-time founding-operator bootstrap — LAN-135. It gives the club its first
three administrators: Clint as active-year President, Stewart as standing
General Manager, and Brian as standing IT Officer.

It exists because of a genuine chicken-and-egg. Every administration path in the
application asks who is asking, and until this has run the honest answer is
"nobody" — so nobody can invite the first administrator through the
application. **After it has run, every further change is made in the
application, and a manual SQL provisioning touch is a defect.**

### Before you run it

Four things have to be true, in this order.

1. **The four migrations awaiting hosted are applied.** In particular
   `20260819090000_role_catalogue_structure.sql` and
   `20260819090100_role_catalogue.sql` — until they are, hosted has **no roles
   at all** and the script refuses with `role_not_in_catalogue`. The procedure
   is [`docs/migration-runbook.md`](../../docs/migration-runbook.md); applying
   one is your action and no agent's.
2. **The club has exactly one committee year running.** The script refuses on
   none and on more than one rather than guessing which an appointment belongs
   to.
3. **The deployed application's invitation callback is allow-listed** in the
   Supabase dashboard — the `/auth/invitation` path on the application's public
   origin. Without it the invited operator lands on the sign-in page holding a
   token nothing consumes.
4. **You have written the manifest**, outside this repository.

### The manifest

A JSON file you write yourself, in a directory this repository does not reach,
and delete afterwards. It carries real names and personal email addresses, so it
is never committed, never pasted into a ticket, a pull request or a prompt, and
never passed on the command line where shell history would keep it.

```json
{
  "operators": [
    { "roleCode": "president", "givenName": "…", "familyName": "…", "email": "…" },
    { "roleCode": "general_manager", "givenName": "…", "familyName": "…", "email": "…" },
    { "roleCode": "it_officer", "givenName": "…", "familyName": "…", "email": "…" }
  ]
}
```

All three seats must be present; further seats from the approved catalogue are
allowed. `knownAs` is optional. `personId` is optional and is how you resolve a
duplicate: omit it and the script looks for a Person who might already be this
person, **refusing the run** and printing the candidates if it finds any; set it
to a Person's UUID to link to that record, or to `"new"` to create a fresh one
anyway. The script never chooses for you.

### Running it

A rehearsal against your local stack needs no confirmation, because the loopback
check refuses anything else:

```bash
node scripts/production/bootstrap-founding-operators.mjs --manifest ~/founding-operators.json
```

The hosted run, in two steps. **Always the dry run first** — it is the default,
and it writes nothing. It does not merely intend to: it takes a content digest of
the five `public` tables it can write, before and after itself, and reports a
failure rather than success if they differ. Updates are caught as well as
inserts. The Auth server is outside that digest and provably untouched — the dry
run never reaches the code that creates a login, and the hosted credential has no
reach into the `auth` schema anyway:

```bash
DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)" SUPABASE_URL="https://fggbgeraiadetyiyjlvb.supabase.co" SUPABASE_SECRET_KEY="$(gcloud secrets versions access latest --secret=supabase-secret-key)" node scripts/production/bootstrap-founding-operators.mjs --manifest ~/founding-operators.json --app-base-url https://<the application origin> --confirm-target fggbgeraiadetyiyjlvb
```

Read the preview. For each of the three seats it says exactly one of `create` /
`link` / `already` for the Person, `create` / `already` for the login, and
`assign` / `already` for the seat — plus whether an email will be sent. It ends
with either `N record(s) would be created` or a `REFUSED` block naming every
conflict. **The preview contains personal names and addresses; it is for your
terminal only.**

When the preview is what you expect, add `--apply` to the same command. Nothing
else changes.

### What it refuses, and why that is the point

It refuses the **whole run** if anything at all conflicts — one bad entry stops
the other two. A half-applied bootstrap is the worst state it could leave the
club in: some seats filled, some not, and a human reconciling by hand, which is
the thing this whole mission abolishes. Re-running after a fix is free, because
every step is idempotent.

The refusals you may actually meet:

| Refusal                               | What it means                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `role_not_in_catalogue`               | the catalogue migrations are not applied yet                                           |
| `no_operating_cycle`                  | no committee year is running, or more than one is                                      |
| `person_duplicate_candidates`         | somebody in `people` might already be this person — pin `personId`, or say `"new"`     |
| `auth_login_without_operator_account` | a Supabase Auth login exists that nothing points at; remove it, or use another address |
| `seat_already_held`                   | a single-holder seat is taken; ending an appointment is a decision, made in the app    |
| `operator_account_deactivated`        | the account exists and was deactivated; reinstatement is a decision, made in the app   |

### Afterwards

Three invitation emails go out, each landing on the password screen. The three
holders choose a password and are active operators; from that moment the
application is the way roles and access change. Re-running the script is safe
and does nothing, and it sends no second email unless you pass `--resend`.

If a send fails, the operators still exist — correctly — and are recorded as
_Delivery failed_ with the reason. Fix the mail configuration and re-run with
`--apply --resend`.

`tests/production-bootstrap-contract.test.ts` proves all of the above against
**local** Supabase, including that the dry run writes nothing, that a second run
changes nothing, that a refused run leaves the database untouched, and that the
audit evidence it writes is read back by the application's own history screens.

## `showcase.mjs` and `showcase/`

The Monday showcase loader — LAN-124. Reads the club's two workbooks and loads a
season's worth of data into a database, with `preflight`, `preview`, `load`,
`verify`, `manifest` and `rollback` phases.

Same rules as everything else here: Brian runs it by hand, a hosted run names the
project with `--confirm-target`, and nothing automated may invoke it. A local run
needs no confirmation because the loopback check refuses anything else.

The procedure a human follows is [`OWNER-RUNBOOK.md`](../../OWNER-RUNBOOK.md) at
the repository root, not this file. What it loads and how those rows are
identified is recorded in
[`docs/pilot-data-manifest.md`](../../docs/pilot-data-manifest.md) § The Monday
showcase — worth reading before running it, because these rows carry no
`PILOT-` sentinel and no sweep will find them.

## `connection-smoke-test.mjs`

Proves the hosted runtime credential actually works, once, after activation.

The deploy gate can only prove `DATABASE_URL` is **present** — `/api/health`
never connects, because a health check that fails on a database blip turns the
blip into an outage. Presence is not correctness: a wrong password, a role
missing `BYPASSRLS`, or a pooler refusing the login all pass that gate and then
fail on the first transaction an operator attempts. This closes that gap.

It checks, in order:

1. reads return rows — the `BYPASSRLS` decision is working;
2. a row is visible inside its own transaction;
3. a forced rollback leaves nothing behind;
4. a transaction commits;
5. the synthetic row it created is removed;
6. rewriting audit history is refused;
7. changing the schema is refused.

### What it writes

One `public.people` row, with a fixed identifier and a `PILOT-LAN-94` sentinel
in its name. It is deleted before it is created and again afterwards, so
re-running is always safe and a half-finished run leaves nothing to reconcile.
No new column, no new table, no other row touched — proved against local
Supabase by `tests/production-smoke-contract.test.ts`, including that a
bystander row survives.

### Running it

Get the connection string from Secret Manager into your shell, then:

```bash
DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)" node scripts/production/connection-smoke-test.mjs --confirm-target fggbgeraiadetyiyjlvb
```

The connection string is passed in the environment rather than as an argument so
it does not land in shell history with the password in it. The
`--confirm-target` value is checked against the one production project; without
it, or with anything else, the script refuses. It also refuses to run inside CI
or a test runner.

**The string may carry no `?` and no `#`.** `pg` copies query parameters into its
connection configuration, where `host`, `port` and `user` override the address in
front of them — so a string that reads as the approved target can open a
different database entirely. Both this script and the deployed runtime refuse any
string carrying one. If the value in Secret Manager has a `?`, fix it there
rather than working around it here.

Expected output is seven `PASS` lines. Any `FAIL` means the credential is not
correct — nothing has been left behind, but the deployment is not verified.
Diagnosis and the exact activation steps are in
[`docs/deployment.md`](../../docs/deployment.md) § Activating the runtime
database connection.
