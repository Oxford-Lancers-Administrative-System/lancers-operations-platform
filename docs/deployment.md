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

Requires a human with Owner on the target project. CI cannot do this, by design
— see [ADR 0005](adr/0005-github-to-gcp-auth.md).

```bash
gcloud auth login
GCP_PROJECT_ID=<project-id> ./scripts/gcp-bootstrap.sh
```

That script is idempotent and creates: the enabled APIs (Cloud Run, Cloud Build,
Artifact Registry, Secret Manager, IAM Credentials, STS, Logging, Monitoring), an
Artifact Registry Docker repository, a runtime service account, a deploy service
account, a Workload Identity Pool and Provider trusting only this repository, and
an empty Secret Manager secret. It creates **no** service-account JSON key.

It then prints the exact `gh variable set` commands and the command for storing
the Supabase secret key. Paste the secret into your own terminal; it must not
appear in a file, a ticket, a chat message, or a prompt.

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
| `NEXT_PUBLIC_SUPABASE_URL`             | hosted Supabase URL                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | hosted publishable key                                         |

Until `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and
`GCP_DEPLOY_SERVICE_ACCOUNT` are set, the deploy workflow's preflight job records
a notice and skips cleanly rather than failing red.

## Secrets

The Supabase secret key lives in **Secret Manager** and is injected into the
Cloud Run revision at runtime (`--set-secrets`). It is never baked into the
image, never present in the workflow environment, and never in the repository.

Rotate it with:

```bash
printf '%s' 'NEW_KEY' | gcloud secrets versions add supabase-secret-key --data-file=-
gcloud run services update lancers-operations-platform --region europe-west2
```

`/api/health` reports `secretsLoaded: true|false` — presence only, never the
value — so a deploy can be verified without anyone reading a secret. The deploy
workflow fails if that is `false`.

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

## Health check and logging

- `GET /api/health` → `{ status, service, revision, commit, secretsLoaded, timestamp }`.
- It touches no dependency on purpose: a health check that fails when the
  database blips turns a blip into an outage.
- `commit` is the Git SHA baked in at build time, so a running revision can
  always be tied back to a commit.
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
