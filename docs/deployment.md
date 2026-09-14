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

merge to main ──▶  CI only. Nothing deploys.

gh workflow run  ──▶  deploy (.github/workflows/deploy.yml)
   deploy.yml         OIDC → GCP · build image · push to Artifact Registry
                      deploy Cloud Run revision · smoke-test /api/health
```

Nothing deploys on its own. A pull request does not, and neither does a merge —
deploying is always an explicit `workflow_dispatch`.
Brian dispatches it from `main` only after the required CI checks pass.

That separation is deliberate. A migration that drops a column has to be applied
to hosted **before** the revision expecting the new schema goes live, and a
deploy that fired on merge inverted that ordering.

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
| `CLUB_LINK_SECRET_SECRET`              | `club-link-secret` (the default; set only to override)         |
| `WHATSAPP_ACCESS_TOKEN_SECRET`         | `whatsapp-access-token` (the default; set only to override)    |
| `WHATSAPP_APP_SECRET_SECRET`           | `whatsapp-app-secret` (the default; set only to override)      |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET` | `whatsapp-webhook-verify-token` (the default; override only)   |
| `SCHEDULER_TRIGGER_TOKEN_SECRET`       | `scheduler-trigger-token` (the default; set only to override)  |
| `EMAIL_API_KEY_SECRET`                 | `resend-api-key` (the default; set only to override)           |
| `WHATSAPP_PHONE_NUMBER_ID`             | the club's WhatsApp Business phone-number id                   |
| `WHATSAPP_TEMPLATE_NAME`               | `lancers_event_invitation_v3` (the default; override only)     |
| `WHATSAPP_TEMPLATE_LANGUAGE`           | `en` (the default; override only)                              |
| `EMAIL_FROM_ADDRESS`                   | a bare address, e.g. `events@oxfordlancers.com` — see below    |
| `NEXT_PUBLIC_SUPABASE_URL`             | hosted Supabase URL                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | hosted publishable key                                         |

Until `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_DEPLOY_SERVICE_ACCOUNT` are set, the deploy workflow's preflight job records
a notice and skips cleanly rather than failing red.

## Secrets

Eight server-only values, and the first two are **different credentials with
different reach**. All live in **Secret Manager** and are injected into the
Cloud Run revision at runtime (`--set-secrets`). None is baked into the image,
present in the workflow environment, or in the repository.

| Variable                        | Secret Manager id               | What it is                                                                                                                                                                                                 | Status                            |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `SUPABASE_SECRET_KEY`           | `supabase-secret-key`           | Presented to the Data API. PostgREST connects as `authenticator`, switches to `service_role`. Bypasses RLS.                                                                                                | **Provisioned**                   |
| `DATABASE_URL`                  | `database-url`                  | Direct PostgreSQL connection for the service layer's transactions. A PostgreSQL login in its own right — a **second** privileged credential, scoped by ADR 0026 to reach exactly as far as `service_role`. | **Owner-provisioned. See below.** |
| `CLUB_LINK_SECRET`              | `club-link-secret`              | Signs the club link (LAN-157, D81). Not a database credential and reaches no data: it can only produce and verify one event's share token.                                                                 | **Owner-provisioned. See below.** |
| `WHATSAPP_ACCESS_TOKEN`         | `whatsapp-access-token`         | The Meta Cloud API bearer token the outbound sender authenticates with (LAN-101). See § Runtime configuration below.                                                                                       | **Provisioned**                   |
| `WHATSAPP_APP_SECRET`           | `whatsapp-app-secret`           | Verifies `X-Hub-Signature-256` on every inbound Meta callback (LAN-78). Without it `/api/webhooks/whatsapp` answers 503 to Meta's own delivery-status pushes.                                              | **Provisioned**                   |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `whatsapp-webhook-verify-token` | Echoed back during Meta's webhook subscription handshake (`GET /api/webhooks/whatsapp`). Without it the handshake cannot complete and Meta never subscribes the endpoint.                                  | **Provisioned**                   |
| `SCHEDULER_TRIGGER_TOKEN`       | `scheduler-trigger-token`       | The shared secret `POST /api/scheduler/messaging` requires. Without it the sweep refuses every call with 503 rather than running unauthenticated. See § Messaging scheduler below.                         | **Provisioned**                   |
| `EMAIL_API_KEY`                 | `resend-api-key`                | Resend's API key for the email fallback (LAN-169). Without it email delivery records a failed, retryable attempt naming the missing setting.                                                               | **Provisioned**                   |

### `CLUB_LINK_SECRET`

An operator issues one link per event and shares it with the squad; anybody
holding it sees who was asked, what they said and who turned up, without an
account. The link is **signed rather than guessable**: the token is
`HMAC-SHA256(CLUB_LINK_SECRET, "club-link:v1:<event>:<link row>")`, and
`club_link_tokens` stores only its SHA-256 digest, so this value is the only
thing that can produce a valid one.

**A missing value is a refusal, not a default.** Without it the share control
says the deployment cannot issue a link and names the setting; nothing is
created, and no link is signed with a fallback. Everything else on the event
page works. Provision it with:

```bash
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create club-link-secret --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding club-link-secret --member="serviceAccount:$(gcloud run services describe lancers-operations-platform --region europe-west2 --format='value(spec.template.spec.serviceAccountName)')" --role=roles/secretmanager.secretAccessor
```

before the next deploy. The workflow's `secrets:` block already injects it as
`CLUB_LINK_SECRET=club-link-secret:latest` (LAN-345), so nothing is added to the
revision by hand — a value set on the revision would be erased by the next
deploy, because `--set-secrets` replaces the list. Cloud Run refuses to create a
revision whose secret does not exist, so the two commands above must have run
before `deploy.yml` does; until they have, the run fails at revision creation and
traffic stays on the revision already serving.

**Rotating it invalidates every club link already shared**, because the tokens
are derived from it rather than stored. That is a deliberate act — the way to
withdraw every link at once — and not a routine one.

Locally there is nothing to do: `npm run db:start` generates a machine-local key
outside the repository and writes it into `.env.local`.

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
`databaseConfigured: true|false` and `schemaCompatible: true|false` — never a
value or error — so a deploy can be verified without anyone reading a secret.
The deploy workflow fails if any required field is `false`. The schema probe
selects one row from `public.events`; neither it nor the response reveals the
host, port, connection mode, role, credential, or failure reason.

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

**4 — Merge the pull request, wait for CI, then manually dispatch `deploy.yml`.**
The deploy workflow injects the secret and fails the revision unless
`/api/health` reports `secretsLoaded`, `databaseConfigured`, and
`schemaCompatible` as true.

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

| Variable                          | Source                                                               | What happens if it is absent                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_POOL_MAX`               | **Yes** — literal `5`                                                | The code default of 10 applies: 30 connections over three instances, past the pooler's 15                                     |
| `VENUE_SEARCH_PROVIDER`           | **Yes** — literal `photon`                                           | Event venue entry degrades to plain text and says "address search is not set up here"                                         |
| `VENUE_SEARCH_BASE_URL`           | No, on purpose                                                       | Blank means the free public Photon instance; set it only to point at a self-hosted one                                        |
| `APP_BASE_URL`                    | **Yes** — literal, the Cloud Run host                                | Recovery and invitation have no trusted origin: no email is sent, and the return hop falls back                               |
| `WHATSAPP_PHONE_NUMBER_ID`        | **Yes** — repository variable                                        | The sender has no phone number to send from; approval queues invitations and delivers nothing                                 |
| `WHATSAPP_TEMPLATE_NAME`          | **Yes** — repository variable, default `lancers_event_invitation_v3` | Only relevant if a repository variable overrides a bad value; Meta rejects an unrecognised template name                      |
| `WHATSAPP_TEMPLATE_LANGUAGE`      | **Yes** — repository variable, default `en`                          | Meta resolves a template by name AND language together; a mismatched language fails every send with "template does not exist" |
| `EMAIL_FROM_ADDRESS`              | **Yes** — repository variable, bare address only                     | The email fallback has no verified sending identity and refuses, naming the missing setting                                   |
| `RECRUITMENT_WHATSAPP_GROUP_LINK` | **Yes** — repository variable                                        | The sign-up form's saved page offers recruits no group; it says so rather than inventing a link                               |
| `PLAYER_WHATSAPP_GROUP_LINK`      | **Yes** — repository variable                                        | The player's own page offers no group at all — the section is simply absent (LAN-327)                                         |
| `HUDL_JOIN_LINK`                  | **Yes** — repository variable                                        | The questionnaire's Hudl step shows its steps and states that the link is not published yet                                   |

`tests/deployment-configuration.test.ts` compares this table's reality against
the workflow: a feature that refuses to run unconfigured must either be
configured here (as a plain env var or, for a credential, a Secret Manager
binding — see § Secrets above) or be documented as a deliberate limitation
with the issue that owns it. It fails if a new one appears and neither
happens.

**`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` and
`WHATSAPP_TEMPLATE_LANGUAGE` are set as of LAN-168 item 0** (2026-09-14),
**`WHATSAPP_TEMPLATE_LANGUAGE` added by LAN-351**. None is a credential — the
phone-number id identifies which of the club's WhatsApp Business numbers to
send from, and the template name and language together pick an
already-approved message; Meta rejects an unrecognised name or a mismatched
language outright, so there is nothing here for a stolen value to do.
`WHATSAPP_PHONE_NUMBER_ID` is a repository variable Brian sets once, from the
Meta developer console. `WHATSAPP_TEMPLATE_NAME` defaults to
`lancers_event_invitation_v3`, the rebuilt production Utility invitation
template approved under LAN-348 (`TEMPLATE_NAMES.invitation` in
[`src/lib/delivery/templates.ts`](../src/lib/delivery/templates.ts)) — the
`_v2` submission carried one button by accident and is dead — and is
overridable by repository variable only if Meta ever requires resubmission
under a new name. `WHATSAPP_TEMPLATE_LANGUAGE` defaults to `en`, matching the
club's fourteen approved production templates, which are all `en` rather than
`en_GB`; Meta resolves a template by name AND language together, so a
mismatched default here fails every send with "template does not exist".
`WHATSAPP_ACCESS_TOKEN`, the only _credential_ of the four, is read from
Secret Manager — see § Secrets above — never appears in this workflow, the
image or the repository, and is unchanged by this cutover.

**`EMAIL_FROM_ADDRESS` must be a bare address** (`events@oxfordlancers.com`),
never the `Display Name <address>` form. `flags:` is a folded block whose
lines are joined by spaces, `--set-env-vars` is deliberately kept to one
whitespace-free token — the comment above the flag in `deploy.yml` explains
why, and `tests/deployment-configuration.test.ts` parses that token on
whitespace — and a display-name value would split the flag mid-value and
silently drop every setting after it, rather than fail loudly. This is
enforced by convention rather than by code: Resend accepts a bare address, and
the message simply carries no display name.

**There is no recipient allowlist, on any deployment.** LAN-287 removed
`DELIVERY_RECIPIENT_ALLOWLIST` and `DELIVERY_EMAIL_ALLOWLIST` (Brian's LAN-168
decision of 2 September 2026): membership supplies a player's eligibility, a
recruit's consent is recorded per season, onboarding consent is enforced where
it is granted, and a withdrawal, refusal or departure still refuses. Setting
either variable on a revision now does nothing.

This gap was found by LAN-82's walk: LAN-115's address search had merged and
worked locally, and no deployed revision had ever been told to enable it. The
same gap, for WhatsApp and email, is what LAN-168 item 0 closes: shipping the
code that reads a variable is not the same as the deploy setting it.

**The three club links are wired, and their values are Brian's** — LAN-327 and
LAN-333. `RECRUITMENT_WHATSAPP_GROUP_LINK` (the rookies group),
`PLAYER_WHATSAPP_GROUP_LINK` (the club's main group) and `HUDL_JOIN_LINK` are
configuration rather than credentials, but no agent can produce one: minting a
WhatsApp community invite and a Hudl join link happens in those products, as
the club's owner. They are also why none of the three may ever be a literal in
this repository — it is public, and a WhatsApp invite link is joinable by
anyone holding it.

So each is a **repository variable**, read into the workflow's single
`--set-env-vars` flag as `${{vars.RECRUITMENT_WHATSAPP_GROUP_LINK}}` and its
two siblings. Brian pastes the value once in **Settings → Secrets and variables
→ Actions → Variables**, and the next deploy carries it; it never appears in a
diff, a commit or a pull request. Not the Cloud Run console: `--set-env-vars`
replaces the revision's environment, so a hand-set value is erased by the next
deploy and the offer silently disappears again. Not Secret Manager either —
these are links the club hands out, and filing them as secrets would misreport
what they are.

An unset repository variable renders as the empty string, and every resolver
reads blank as unset, so until Brian sets one the surface refuses rather than
guessing — no group button on either side, and a Hudl step that names the
missing link rather than linking somewhere wrong. A link containing a comma
would split the flag; none of these three does.

**`APP_BASE_URL` is one of the variables the outbound sender needs and is set
alongside the others** — LAN-125 needs it for password recovery independently
of WhatsApp, and as of LAN-168 item 0 and LAN-351 all five
(`APP_BASE_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`) are present on every
deployed revision — see § Messaging scheduler below for what else the cutover
still needs before Meta actually delivers anything. It is in the workflow
rather than typed into the Cloud Run console because `--set-env-vars` replaces
the environment: a value set by hand would be erased by the next manual
deploy, and recovery would stop sending without any error appearing anywhere.

**It also decides where an email link lands after the token is spent** — LAN-141.
`/auth/invitation` and `/auth/recovery` used to build that redirect from the
request's own origin, which behind Cloud Run is the container's bind address, so
a working invitation ended at `http://0.0.0.0:8080/reset-password` and
`ERR_CONNECTION_REFUSED`. They now use the same rule as the outbound link:
`APP_BASE_URL`, otherwise a loopback request origin, otherwise a relative path.
A `Host` header is still not evidence. So `APP_BASE_URL` and the Cloud Run
hostname agreeing matters twice, and the acceptance test for a deploy is to open
a fresh invitation and a password reset end to end, not just to watch the email
arrive.

## Messaging scheduler

Cloud Run has no background worker or cron of its own. Nothing advances the
WhatsApp/email chase ladder — invitation, two WhatsApp reminders, an email
reminder, then escalation — unless something POSTs
`/api/scheduler/messaging` on a schedule (`src/app/api/scheduler/messaging/route.ts`).
Locally that is `npm run messaging:ticker`, beside `npm run dev`; in the
deployed environment it is a **Cloud Scheduler job**, `lancers-messaging-sweep`,
which the deploy itself owns.

- **Cadence.** Every five minutes (`*/5 * * * *`), `Europe/London` time zone,
  a 60-second attempt deadline.
- **Owned by the deploy.** The _Ensure the messaging scheduler job_ step in
  `deploy.yml` runs after every successful smoke test and creates the job if
  it does not exist, or updates it in place if it does — so a job an operator
  paused in the console is left alone by a re-deploy that only changes the
  image, and a schedule or URL change here reaches the job on the next deploy
  rather than needing a separate manual step.
- **Authenticated the same way a human never could be.** The job carries
  `Authorization: Bearer <token>`, read at deploy time from the
  `scheduler-trigger-token` Secret Manager secret (the same one
  `SCHEDULER_TRIGGER_TOKEN` injects into the running revision) and masked in
  the workflow log the instant it is read. The route compares it in constant
  time and answers `401` to anything else, `503` if the revision has no token
  configured at all.

**Two IAM grants the deploy identity needs, once**, made by Brian — the deploy
identity is deliberately least-privilege everywhere else in this pipeline, and
creating scheduler jobs and reading this one secret are both outside what it
already holds:

```bash
gcloud projects add-iam-policy-binding oxford-lancers-operations \
  --member="serviceAccount:${GCP_DEPLOY_SERVICE_ACCOUNT}" \
  --role="roles/cloudscheduler.admin"

gcloud secrets add-iam-policy-binding scheduler-trigger-token \
  --member="serviceAccount:${GCP_DEPLOY_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud services enable cloudscheduler.googleapis.com --project=oxford-lancers-operations
```

`${GCP_DEPLOY_SERVICE_ACCOUNT}` is the same deploy identity named by the
repository variable of that name — see § Repository variables above.

**Until both grants are made, the deploy still succeeds.** The scheduler step
cannot fail the deploy: the revision is already serving by the time it runs,
and a missing scheduler job is a follow-up owner action, not a broken
revision. A permission-shaped failure — reading the secret, describing,
creating or updating the job — is caught, printed as one line naming the two
grants and the API to enable, and turned into a workflow `::warning::`
annotation rather than a red step. Check the deploy's own run summary for that
warning to know whether the job needs attention.

**Manual-run check.** Confirm the job actually works with one manual
invocation, from the Cloud Scheduler console (**Force run**) or:

```bash
gcloud scheduler jobs run lancers-messaging-sweep --location=europe-west2
```

Expect an HTTP `200` and, against an empty queue, a body reporting
`accepted 0, refused 0` — no error, and no message sent. A `401` means the
token in the job's header does not match the revision's `SCHEDULER_TRIGGER_TOKEN`;
a `503` means the running revision has no token configured at all.

**Cutover order.** Deploy first, then configure Meta's webhook. Both
`WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` must be present on
the _running_ revision before `/api/webhooks/whatsapp` will do anything but
answer `503` — see `resolveWebhookConfig` in
[`src/lib/delivery/config.ts`](../src/lib/delivery/config.ts). Pointing Meta's
webhook at a revision that predates this deploy, or attempting the
subscription handshake before it, fails the handshake outright. See
[`docs/whatsapp-cutover.md`](whatsapp-cutover.md) for the exact owner runbook.

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

- `GET /api/health` → `{ status, service, revision, commit, secretsLoaded, databaseConfigured, schemaCompatible, timestamp }`.
- When `DATABASE_URL` is configured, it selects from `public.events` and returns
  503 unless the current schema is readable. It is a deploy-readiness check, not
  a Cloud Run liveness probe.
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

```bash
gh workflow run deploy.yml
```

Merging does **not** deploy. The workflow builds from `main`, pushes an image
tagged with the commit SHA, deploys a new revision, and smoke-tests it.

**If the commit being deployed needs a migration, apply it first.** Back up,
apply, then deploy — never the other way round.

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
pull request, otherwise a later manual deploy could re-deploy the bad code.

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
