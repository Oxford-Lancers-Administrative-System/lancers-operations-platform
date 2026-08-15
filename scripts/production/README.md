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

Expected output is seven `PASS` lines. Any `FAIL` means the credential is not
correct — nothing has been left behind, but the deployment is not verified.
Diagnosis and the exact activation steps are in
[`docs/deployment.md`](../../docs/deployment.md) § Activating the runtime
database connection.
