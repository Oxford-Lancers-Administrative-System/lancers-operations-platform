# Deployment and rollback

The trivial page is deployed to **Cloud Run** on the **Cloud Run default URL**.
The custom domain (`app.oxfordlancers.com`) is blocked on a GoDaddy transfer and
is deliberately not part of this path.

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
