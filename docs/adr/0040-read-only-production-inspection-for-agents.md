# 0040 — Agents read production through a column-limited, write-less login

**Status:** Accepted · **Date:** 2026-09-26 · **Extends:**
[0026](0026-hosted-runtime-database-connection.md) · **Narrows:**
[0001](0001-local-supabase-only.md)

Decided by Brian through LAN-435 on 2026-09-26, in conversation, after an
independent research pass checked the method against current PostgreSQL and
Supabase documentation.

## Context

Production defects such as LAN-434 and LAN-437 cannot be diagnosed from the
code alone: the question is whether the rows or the resolver are wrong. Until
now the only people who could read production were operators through the
application and Brian in the SQL editor, so every investigation stalled on him.

Every credential that reaches production — `postgres`, the secret key,
`app_runtime` — can write. None of them may be handed to an agent.

## Decision

### A dedicated login that owns nothing and can write nothing

`agent_readonly`, created by the owner-run paste
`scripts/production/agent-readonly.sql`. Not a superuser, no `CREATEROLE`,
`CREATEDB`, replication or role membership, and `noinherit`. It holds `USAGE`
on `public` only and `SELECT` on individual columns only. PostgreSQL refuses
every insert, update, delete, truncate, DDL statement and grant, whatever the
session settings say; `tests/agent-readonly-role.test.ts` proves each refusal
with the read-only default switched off, so the grants alone are on trial.

`default_transaction_read_only`, a 15 s statement timeout, a 30 s idle
timeout and a connection limit of 2 are set on the role as defence in depth.
They are not the boundary: a client can override the first three for its own
session.

### Rows through `bypassrls`; columns through column privileges

Every domain table has RLS enabled with zero policies (ADR 0002), so a plain
`SELECT` grant reads zero rows. The role carries `bypassrls`, as `app_runtime`
does, for the reasons ADR 0026 gives against permissive policies. On a role
with no write privilege it widens only what can be read.

What can be read is then narrowed by granting `SELECT` column by column,
never table-wide. Hidden, by an explicit list plus a name pattern
(`email|phone|postcode|address|password|secret|_hash$|date_of_birth|student_number`):

- dates of birth, student numbers and BAFA numbers;
- every email address and phone number, including operators' login emails
  and emergency contacts;
- what a player typed on a signed agreement form, and disputed fact values;
- token hashes, the sign-up code, the safety destination fingerprint, and
  `notification_jobs.template_variables`, which carries the personal links a
  message was sent with — a bearer link is a write path through the app.

`auth`, `storage`, `staging` and `internal` are not granted at all. Free text
(notes, reasons, answers) stays visible: Brian decided its diagnostic value
outweighs what someone might type into it. A query naming a hidden column,
or `select *` on a table that has one, fails with `permission denied`.

The grant is recomputed from the live catalogue on every run of the paste. New
tables and columns are invisible until the paste is run again, and the name
pattern hides an obviously sensitive column even if nobody listed it.

### Views and a migration were rejected

An `inspect` schema of owner-rights views was the first design. It needs a
migration, makes every later migration that touches an exposed column also
rebuild a view, and gives no more protection than column privileges do.

### The official Supabase MCP server was rejected

Its read-only mode authenticates with a Supabase personal access token, which
reaches the Management API rather than one database role, and Supabase's own
documentation warns against connecting it to production. Which role it
queries as, and whether that role sees RLS-protected rows, is undocumented.

### Session-mode pooler, a literal target

`prod:inspect` connects to the shared Supavisor pooler on port 5432 (session
mode), because Supabase applies per-role settings only in session mode. The
host, port, database and user are a frozen literal in
`scripts/diagnostics/prod-inspect.mjs`; nothing in the environment moves them.
The local-only guards in `src/lib/db/url.ts` and `scripts/lib/local-db.mjs`
are unchanged and know nothing about it.

### The password lives in the primary checkout's `.env.local`

The paste generates it server-side on its first run and never again. Brian
adds `AGENT_READONLY_PASSWORD` to the `.env.local` of the primary checkout; the
tool finds that file through git from any worktree and reads nothing else. The
macOS Keychain and 1Password were considered: the Keychain is not a tool Brian
uses, and 1Password asks for Touch ID on each read, which defeats autonomous
use.

### Every query is logged, never its rows

Each attempt appends when, where, the stated `--purpose`, the SQL, and the row
count or error code to `~/.lancers/prod-inspect.jsonl`.

## Consequences

- **Worst case is a read-only disclosure.** Whoever holds the password can copy
  names, roles, memberships, events, RSVPs, message state and free text. They
  cannot contact or further identify anyone from it, and cannot change
  anything. Revocation is one statement in the SQL editor:
  `alter role agent_readonly nologin;`.
- **Rows an agent reads enter its transcript.** Agents query ids, states and
  dates first and read free text only when the defect is about it.
- **`.env.local` is copied into agent worktrees**, so the password sits in
  those copies too; all are on Brian's machine and ignored by git.
- **The role can change its own session defaults.** PostgreSQL lets any role
  alter its own settings; this cannot grant it a privilege.
- **Re-run the paste after a migration** that adds a table or column agents
  should see. Add any new sensitive column to the paste's hidden list in the
  same pull request as its migration.
