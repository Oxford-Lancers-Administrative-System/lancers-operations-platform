# Deployment and rollback

The application is deployed to **Cloud Run** in `europe-west2`, and is reached
by the public on **`https://app.oxfordlancers.com`**, which Firebase Hosting
serves by rewriting to that service — see
[The public hostname](#the-public-hostname--firebase-hosting-in-front-of-cloud-run)
below and [ADR 0031](adr/0031-firebase-hosting-front-door.md). Cloud Run's own
`run.app` hostname still answers and is useful for telling whether a fault is in
Hosting or in the container.

## Shape of the pipeline

```
pull request  ──▶  CI only (.github/workflows/ci.yml)
                   format · lint · typecheck · test · build
                   migrations from empty · RLS gate · type-drift gate
                   container build + health probe

merge to main ──▶  CI, then deploy (.github/workflows/deploy.yml)
                   OIDC → GCP · build image · push to Artifact Registry
                   deploy Cloud Run revision · smoke-test /api/health
```

A pull request never deploys. Only `main` does.

## One-time GCP setup

Run by a human. CI cannot do this, by design — see
[ADR 0005](adr/0005-github-to-gcp-auth.md).

Target project: **`oxford-lancers-operations`** (`878714496182`), billing enabled.

```bash
gcloud auth login
GCP_PROJECT_ID=oxford-lancers-operations ./scripts/gcp-bootstrap.sh
```

The script is idempotent and runs in two phases.

**Phase A** — covered by the roles Brian already holds. Enables the APIs (Cloud
Run, Cloud Build, Artifact Registry, Secret Manager, IAM Credentials, IAM, STS,
Logging, Monitoring); creates the Artifact Registry repository, the runtime and
deploy service accounts, the Secret Manager secret (empty), all resource-scoped
IAM, and the Cloud Run service itself from a public placeholder image.

**Phase B** — creates the Workload Identity Pool and GitHub OIDC provider. This
needs `roles/iam.workloadIdentityPoolAdmin`, which `roles/editor` does **not**
include, because creating a pool establishes trust with an external identity
provider. If it is not permitted, the script finishes Phase A, prints the grant
to request, and skips Phase B. Re-run it once the grant lands.

The grant a project Owner must make, once. **The Owner of this project does not
use the command line**, so the Console steps are the primary instructions:

1. Open <https://console.cloud.google.com/iam-admin/iam?project=oxford-lancers-operations>
   and sign in as the Owner (`oxfordlancers@gmail.com`).
2. Check the project name at the top reads **Oxford Lancers Operations**.
3. Click **＋ GRANT ACCESS**.
4. **New principals**: `brian.daniel.schuster@gmail.com`
5. **Assign roles** → **Select a role** → type `Workload Identity Pool` in the
   filter → choose **IAM Workload Identity Pool Admin**.
6. Click **SAVE**. The change takes effect within about a minute.

The CLI equivalent, for an Owner who prefers it:

```bash
gcloud projects add-iam-policy-binding oxford-lancers-operations \
  --member="user:brian.daniel.schuster@gmail.com" \
  --role="roles/iam.workloadIdentityPoolAdmin"
```

It creates **no** service-account JSON key at any point.

Afterwards the script prints the exact `gh variable set` commands and the command
for storing the Supabase secret key. Paste the secret into your own terminal; it
must not appear in a file, a ticket, a chat message, or a prompt.

### Why the service is created by hand

`roles/run.developer` can only be granted on a Cloud Run service that already
exists, and it excludes `run.services.setIamPolicy`. So the service is created
once at bootstrap — with a placeholder image and public access — and the deploy
identity is scoped to updating that one service. It can never widen its own
access or expose a different service.

### Repository variables the deploy reads

None of these are secrets.

| Variable                               | Example                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `GCP_PROJECT_ID`                       | `lancers-ops`                                                  |
| `GCP_REGION`                           | `europe-west2`                                                 |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`       | `projects/123.../providers/github-oidc`                        |
| `GCP_DEPLOY_SERVICE_ACCOUNT`           | `lancers-operations-platform-deploy@….iam.gserviceaccount.com` |
| `ARTIFACT_REGISTRY_REPO`               | `lancers`                                                      |
| `CLOUD_RUN_SERVICE`                    | `lancers-operations-platform`                                  |
| `CLOUD_RUN_MAX_INSTANCES`              | `3`                                                            |
| `SUPABASE_SECRET_KEY_SECRET`           | `supabase-secret-key`                                          |
| `DATABASE_URL_SECRET`                  | `database-url` (the default; set only to override)             |
| `NEXT_PUBLIC_SUPABASE_URL`             | hosted Supabase URL                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | hosted publishable key                                         |

Until `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_DEPLOY_SERVICE_ACCOUNT` are set, the deploy workflow's preflight job records
a notice and skips cleanly rather than failing red.

## Secrets

Two server-only values, and they are **different credentials with different
reach**. Both live in **Secret Manager** and are injected into the Cloud Run
revision at runtime (`--set-secrets`). Neither is baked into the image, present
in the workflow environment, or in the repository.

| Variable              | Secret Manager id     | What it is                                                                                                                                                                                                 | Status                            |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `SUPABASE_SECRET_KEY` | `supabase-secret-key` | Presented to the Data API. PostgREST connects as `authenticator`, switches to `service_role`. Bypasses RLS.                                                                                                | **Provisioned**                   |
| `DATABASE_URL`        | `database-url`        | Direct PostgreSQL connection for the service layer's transactions. A PostgreSQL login in its own right — a **second** privileged credential, scoped by ADR 0026 to reach exactly as far as `service_role`. | **Owner-provisioned. See below.** |

**`DATABASE_URL` is required.** The service layer is the only path to domain
data, so a revision without it serves pages and fails on the first write. The
deploy gate refuses such a revision — see § Activating the runtime database
connection.

The value names `app_runtime`, a least-privilege login created by hand in the
hosted project: it owns no table, holds neither `CREATEROLE` nor `CREATEDB`, and
takes its privileges from membership of `service_role`. Do **not** use
`postgres`: locally that is what the connection is, it has admin privileges, and
copying that shape to production would hand the runtime a database
administrator. [ADR 0026](adr/0026-hosted-runtime-database-connection.md) records
the role, the grants, the `BYPASSRLS` decision and the connection mode.

Rotate the Supabase secret key with:

```bash
printf '%s' 'NEW_KEY' | gcloud secrets versions add supabase-secret-key --data-file=-
gcloud run services update lancers-operations-platform --region europe-west2
```

`/api/health` reports `secretsLoaded: true|false` and
`databaseConfigured: true|false` — presence only, never the value — so a deploy
can be verified without anyone reading a secret. The deploy workflow fails if
either is `false`. Neither field reveals the host, port, connection mode, role
or any error, and the endpoint never connects to the database.

## Activating the runtime database connection

Run **once**, by Brian, in this order. Steps 1–3 must be complete **before the
pull request that adds the deploy gate is merged**, or the next deploy of `main`
fails on a revision with no `DATABASE_URL`.

Nothing in this sequence is performed by an agent, and no secret value appears in
the repository, in Linear, or in a prompt.

**1 — Create the role in the hosted project.** Supabase → SQL Editor. Invent a
long password and keep it in your password manager; it appears in this statement
and in step 2 and nowhere else.

```sql
create role app_runtime login password 'REPLACE-WITH-A-LONG-PASSWORD' nocreatedb nocreaterole noreplication connection limit 20;
grant service_role to app_runtime;
alter role app_runtime bypassrls;
alter role app_runtime set statement_timeout = '15s';
```

Verify it, in the same editor:

```sql
select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolconnlimit from pg_roles where rolname = 'app_runtime';
```

Expect `false, false, false, true, 20`. Anything else, stop.

**2 — Create the secret.** Build the connection string from Supabase → **Connect**
→ **Transaction pooler**, with **Use IPv4 connection** switched on. Take that
string and make two substitutions:

- the user is shown as `postgres.<project-ref>` — change the role part to
  `app_runtime`, keeping the project reference and the dot;
- replace the password placeholder with the password from step 1.

Leave the host, the port `6543` and the database `postgres` exactly as shown.
Those four components must match
[`src/lib/db/runtime-target.ts`](../src/lib/db/runtime-target.ts) or the deployed
runtime refuses to open it — deliberately, so a mistake here fails at startup
rather than silently reaching the wrong database.

**The string must also carry no `?` and no `#`.** Supabase's Connect dialog
appends query parameters for some driver presets — `?sslmode=…`,
`?pgbouncer=true` and similar — and the runtime refuses any string that has one.
That is not fussiness: `pg` copies query parameters into its connection
configuration, where `host`, `port` and `user` **override** the address in front
of them, so a string that reads as the approved target can open a completely
different database. If the string you copied has a `?`, delete it and everything
after it. If the deployed revision reports a refusal mentioning "query or
fragment", this is why.

Paste the finished string into your own terminal, in place of the placeholder
below. It must not be typed into a file, a ticket, or a chat.

```bash
printf '%s' 'PASTE-THE-CONNECTION-STRING-HERE' | gcloud secrets create database-url --data-file=- --replication-policy=automatic
```

**3 — Let the runtime read it.**

```bash
gcloud secrets add-iam-policy-binding database-url --member="serviceAccount:$(gcloud run services describe lancers-operations-platform --region europe-west2 --format='value(spec.template.spec.serviceAccountName)')" --role=roles/secretmanager.secretAccessor
```

**4 — Merge the pull request.** The deploy workflow injects the secret and fails
the revision unless `/api/health` reports both `secretsLoaded` and
`databaseConfigured` as true.

**5 — Prove the credential actually works.** Presence is not correctness: a wrong
password, a role without `BYPASSRLS`, or a pooler refusing the login all pass the
gate and fail on the first transaction an operator attempts.

```bash
DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)" node scripts/production/connection-smoke-test.mjs --confirm-target <project-ref>
```

Expect seven `PASS` lines. See
[`scripts/production/README.md`](../scripts/production/README.md).

**6 — Sign in to the deployed app and open one page that reads club data.** If
the role could not bypass RLS the pages render empty rather than erroring, which
is the one failure the smoke test names explicitly and the health check cannot.

### Rotating it

```bash
printf '%s' '<new connection string>' | gcloud secrets versions add database-url --data-file=-
gcloud run services update lancers-operations-platform --region europe-west2
```

Reset the role's password in Supabase first (`alter role app_runtime password
'…'`). The previous secret version stays enabled until you disable it, so a
rotation is reversible.

### If the deploy fails on `databaseConfigured`

The revision has no `DATABASE_URL`. Either the secret does not exist, or the
runtime service account cannot read it — steps 2 and 3. Roll back with
`gh workflow run deploy.yml -f image_tag=<previous-commit-sha>`; the previous
image does not require the variable.

The `databaseConfigured` gate applies to the build path only. On a rollback it
degrades to a warning, because an image built before this field existed cannot
report it and the revision is already serving by the time the check runs —
gating it would turn every rollback red during the incident the rollback is
fixing, and leave no way to tell "rolled back" from "rollback failed".

`NEXT_PUBLIC_*` values are browser-safe by definition and are inlined into the
client bundle at build time, so they are build arguments, not runtime secrets.

## Runtime configuration that is not a secret

Some features refuse to run until a deployment says which external service they
may talk to. That refusal is deliberate — an unconfigured deployment reaches out
to nobody — but it means **shipping the code is not the same as turning the
feature on**, and the two can drift apart silently. Every such variable is set
on the Cloud Run revision by `deploy.yml`, in **one** `--set-env-vars` flag, not
in Secret Manager, because none of them is a credential.

One flag, and that is load-bearing: `--set-env-vars` **replaces** the revision's
environment rather than adding to it. A second one, or one of them alongside the
action's `env_vars:` input, leaves whichever ran last as the only environment the
revision has — and the variables in the other list are simply absent, which looks
exactly like the defect below.

| Variable                | Set by the deploy            | What happens if it is absent                                                                   |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_POOL_MAX`     | **Yes** — `5`                | The code default of 10 applies: 30 connections over three instances, past the pooler's 15      |
| `VENUE_SEARCH_PROVIDER` | **Yes** — `photon`           | Event venue entry degrades to plain text and says "address search is not set up here"          |
| `VENUE_SEARCH_BASE_URL` | No, on purpose               | Blank means the free public Photon instance; set it only to point at a self-hosted one         |
| `APP_BASE_URL`          | **Yes** — the Cloud Run host | Password recovery has no trusted origin to build a link from and quietly sends nobody anything |
| `WHATSAPP_*` (three)    | **No — not yet**             | Approval creates invitations and **delivers nothing**, recorded as a configuration failure     |

`tests/deployment-configuration.test.ts` compares this table's reality against
the workflow: a feature that refuses to run unconfigured must either be
configured here or be listed below as knowingly absent. It fails if a new one
appears and neither happens.

**The WhatsApp variables are knowingly absent.** They are not a configuration
oversight and cannot be fixed by editing this workflow: they need the club's own
Meta business portfolio, WhatsApp Business Account, Cloud API access and an
approved message template, which is **LAN-101** and is Brian's. Until it closes,
a deployed approval queues delivery jobs that fail with a sentence naming the
missing settings, and the invitation stays retryable. Nothing is silently lost,
and no hand-sent message stands in for it.

This gap was found by LAN-82's walk: LAN-115's address search had merged and
worked locally, and no deployed revision had ever been told to enable it.

**`APP_BASE_URL` is the fourth WhatsApp variable and is now set** — LAN-125 needs
it for password recovery, and the sender still refuses without the other three,
so setting it enables no delivery. It is in the workflow rather than typed into
the Cloud Run console because `--set-env-vars` replaces the environment: a value
set by hand would be erased by the next merge to `main`, and recovery would stop
sending without any error appearing anywhere.

## Password recovery — hosted Supabase Auth

Password recovery is the one feature whose configuration lives **outside this
repository as well as in it**. The application half ships with the code; the
Supabase project half is set in the hosted dashboard, by Brian, and this section
is the exact list.

The deployed service answers on the permanent club hostname:

```
https://app.oxfordlancers.com
```

That value appears in exactly two places and they must agree: `APP_BASE_URL` in
`.github/workflows/deploy.yml`, and the redirect allow-list below.
`tests/auth-recovery-configuration.test.ts` fails if they drift.

**1. Authentication → URL Configuration.**

| Field                | Value                                           |
| -------------------- | ----------------------------------------------- |
| Site URL             | `https://app.oxfordlancers.com`                 |
| Redirect URL (exact) | `https://app.oxfordlancers.com/auth/recovery`   |
| Redirect URL (exact) | `https://app.oxfordlancers.com/auth/invitation` |

Two exact URLs, not a wildcard — the second is LAN-131's first-access
invitation. The application asks for those destinations and no others; anything
Supabase does not recognise it silently replaces with the Site URL, which would
land every recovery link on the sign-in page rather than the reset page, and
every invitation link on the sign-in page holding a token nothing consumes — a
failure with no error message anywhere.

The local CLI equivalent is `[auth] site_url` and `additional_redirect_urls` in
`supabase/config.toml`, which is **local only**. Nothing in this repository
configures the hosted project's Auth settings, and nothing should.

**2. Authentication → Email Templates → Reset Password.**

Set the subject to `Reset your Lancers Operations password` and paste the body
from [`supabase/templates/recovery.html`](../supabase/templates/recovery.html).
The link in it must stay in this shape:

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

The default template links to Supabase's own `/verify` endpoint, which returns
the session in a URL fragment a server-rendered page cannot read. The token-hash
form also works from a different device than the one that asked for the reset,
which is what an operator who requests it on a laptop and opens the email on a
phone actually does.

**2b. Authentication → Email Templates → Invite user.** (LAN-131)

Set the subject to `Your Oxford Lancers operations account` and paste the body
from [`supabase/templates/invite.html`](../supabase/templates/invite.html). The
link in it must stay in this shape:

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

Same reasoning as the recovery template, and one more that is specific to an
invitation: nobody asks for their own invitation, so a PKCE link — which only
works in the browser that requested it — cannot work at all here. The invited
person opens the email wherever they read email.

Until this template is set, the hosted project sends its own built-in invite
email, whose link this application cannot complete, and it does so **without any
error** — the send succeeds and the person simply cannot get in.

**3. Project Settings → Authentication → SMTP Settings.**

Supabase's built-in email sender is for development traffic only: it is rate
limited to a handful of messages an hour and its deliverability to real mailboxes
is not guaranteed. Dependable recovery for the pilot needs a custom SMTP provider
(Resend, Postmark, SendGrid or similar) configured here, with a sender address on
a domain the club controls. Until that is done, hosted recovery email should be
treated as **untested in production** — see the known limitation on LAN-125's
pull request.

The SMTP credential is Brian's to enter directly into the Supabase dashboard. It
must not be added to this repository, to Secret Manager, to a workflow, or to any
prompt.

**Do not switch hosted Auth to custom SMTP yet.** Brian's recorded answer during
mission M-OPERATOR-ADMIN-WITHOUT-SQL (question `Q-1`, 19 August 2026) is that the
Resend sending domain `mail.oxfordlancers.com` is not verified, and switching now
would break the password recovery that currently works through the built-in
sender. Production first-access delivery is tracked as an open external gate
(LAN-136) and the dashboard steps above as LAN-137. Until both close, hosted
invitation email is **untested in production** and no agent may configure any of
it.

**4. Authentication → Rate Limits.** The hosted project enforces an
emails-per-hour limit that the local stack does not. Leave it at the project
default unless the pilot proves it too low; the application already normalises a
rate-limited request into the same public confirmation as every other outcome, so
the symptom of a limit being hit is an email that does not arrive, not an error
on screen.

## Cost and capacity controls

| Control              | Value                         | Why                                                                            |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `--max-instances`    | 3 (`CLOUD_RUN_MAX_INSTANCES`) | Caps runaway cost and, more importantly, caps concurrent Supabase connections. |
| `--min-instances`    | 0                             | Scales to zero. Cold starts are acceptable for this workload.                  |
| `--concurrency`      | 80                            | Node handles concurrent requests; one instance per request would be wasteful.  |
| `--cpu` / `--memory` | 1 / 512Mi                     | Enough for the standalone Next.js server.                                      |
| `--timeout`          | 60s                           | Nothing here should take a minute.                                             |

Raise `max-instances` only alongside a deliberate look at Supabase connection
limits.

> **A stray service-level annotation looks like it contradicts this.**
> `gcloud run services describe` reports `run.googleapis.com/maxScale=20` at the
> service level, which is a Cloud Run system default. The value that actually
> governs scaling is the one on the revision template,
> `autoscaling.knative.dev/maxScale=3`, set from `--max-instances`. Verified on
> the live revision. It is deliberately left alone: mutating a system-managed
> annotation on a working production service to tidy a display value is not worth
> the risk. Check the effective cap with:
>
> ```bash
> gcloud run revisions describe <revision> --region europe-west2 \
>   --format="value(metadata.annotations)" | tr ';' '\n' | grep maxScale
> ```

## Health check and logging

- `GET /api/health` → `{ status, service, revision, commit, secretsLoaded, databaseConfigured, timestamp }`.
- It touches no dependency on purpose: a health check that fails when the
  database blips turns a blip into an outage.
- `commit` is the Git SHA baked into the image at build time, so a running
  revision can always be tied back to a commit.

> **`/api/health`'s `commit` is the source of truth — not the Cloud Run
> `commit-sha` revision label.** That label is set by the deploy action from the
> triggering workflow run's `github.sha`, which during a rollback is the _current_
> `main`, not the commit of the image actually being deployed. After a rollback
> the label will disagree with reality; the health endpoint will not, because its
> value is compiled into the image. To confirm from the registry side instead,
> compare image digests:
>
> ```bash
> gcloud artifacts docker images list \
>   europe-west2-docker.pkg.dev/oxford-lancers-operations/lancers/lancers-operations-platform \
>   --include-tags --format='table(version, tags)'
> ```

- Cloud Run captures stdout/stderr into Cloud Logging automatically. Query with:

```bash
gcloud run services logs read lancers-operations-platform --region europe-west2 --limit 100
```

## The public hostname — Firebase Hosting in front of Cloud Run

`https://app.oxfordlancers.com` is **not** served by Cloud Run directly. Firebase
Hosting terminates TLS at Google's edge and forwards every request to the Cloud
Run service through a catch-all rewrite. Cloud Run never learns it has a custom
domain.

This exists because Cloud Run's own free custom-domain feature — domain
mappings — is refused in `europe-west2`:

```
ERROR: 501 UNIMPLEMENTED: Creating domain mappings is not allowed in europe-west2.
```

The service is in London deliberately, next to hosted Supabase. Google's
documented alternative is a global external Application Load Balancer at roughly
£15–20/month before a single request. Firebase Hosting does the same job for £0.
The reasoning and the rejected alternatives are in
[`adr/0031-firebase-hosting-front-door.md`](adr/0031-firebase-hosting-front-door.md).

**Do not replace this with a load balancer**, and note that
`gcloud run integrations create --type=custom-domains` silently provisions one.

### The configuration

`firebase.json` at the repository root. `firebase/public/` is deliberately empty
so that nothing matches statically and every request falls through to the
rewrite. It is **not** Next.js's `public/` directory, and must not be repointed
at it — that would publish those assets to the edge, where they would be served
by Hosting and would not change when the container is redeployed.

### Redeploying the front door

Only needed when `firebase.json` itself changes. Application deploys do not touch
it.

```bash
npx firebase deploy --only hosting
```

`.firebaserc` pins the project, so no `--project` flag is needed. The Blaze plan
is required and is attached to the project's existing billing account.

### Rolling back the front door

Hosting keeps every release. Roll back in the Firebase console under
**Hosting → Release history**, or redeploy a corrected `firebase.json`. Rolling
back Hosting does **not** roll back the application — for that, see
[Rolling back](#rolling-back) below.

If the front door itself is broken, the Cloud Run hostname still serves the
application directly and can be used to confirm whether a fault is in Hosting or
in the container.

### The session cookie must be named `__session`

Firebase forwards **only** the cookie named exactly `__session` and strips every
other one, so its CDN can cache safely. Supabase's default cookie name does not
survive the front door, and the failure is silent in both directions: sign-in
looks like it worked and the next page redirects to `/login`, and a password
reset link lands on `/reset-password` with no session and reports that the link
cannot be used.

`src/lib/supabase/cookies.ts` holds the name and every cookie-backed Supabase
client uses it. Do not remove `cookieOptions` from any of them;
`src/lib/supabase/cookies.test.ts` fails if you do.

The session must also stay under roughly 3180 bytes, or `@supabase/ssr` splits
it into `__session.0`, `__session.1`, … which Firebase also strips. It was 2653
bytes on 2026-08-21. If the application ever adds custom JWT claims, re-measure.
A split session logs a named `[auth]` error rather than failing quietly.

### Edge caching

Firebase caches responses according to the `Cache-Control` the application sends.
Dynamically rendered routes send `private, no-cache, no-store` and are never
cached. Statically prerendered routes send `s-maxage=31536000`, and **a Cloud Run
deploy does not purge Firebase's edge cache** — a changed static route can serve
stale for a long time. Today only `/` is affected, and it is a placeholder. When
that changes, add a `headers` override to `firebase.json`.

## Deploying

Merge to `main`. That is the whole procedure. The workflow builds, pushes an
image tagged with the commit SHA, deploys a new revision, and smoke-tests it.

Watch it:

```bash
gh run watch
```

## Rolling back

Every image is tagged with its commit SHA and every Cloud Run revision is
retained, so there are two routes.

**Preferred — redeploy a known-good image via the pipeline:**

```bash
gh workflow run deploy.yml -f image_tag=<previous-commit-sha>
```

The build step is skipped (the image already exists) and the smoke test still
runs. This keeps the pipeline as the single path to production.

**Fastest — shift traffic to the previous revision directly:**

```bash
gcloud run revisions list --service lancers-operations-platform --region europe-west2
gcloud run services update-traffic lancers-operations-platform \
  --region europe-west2 --to-revisions <previous-revision>=100
```

Use this when the site is down and minutes matter. Follow it with a revert
pull request, otherwise the next merge to `main` re-deploys the bad code.

**Verify either way:**

```bash
curl -s https://<service-url>/api/health
```

Confirm `status: ok`, `secretsLoaded: true`, and that `commit` is the SHA you
expected.

## What is deliberately not here

- **Migrations are not run by the deploy pipeline.** Applying a migration to the
  single production database is a deliberate human action, not a side effect of
  merging. See [ADR 0001](adr/0001-local-supabase-only.md).
- **No custom domain.** Blocked; use the Cloud Run default URL.
- **No staging environment.** There is one production project and local.
