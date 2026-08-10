# 0005 — GitHub authenticates to GCP with OIDC and Workload Identity Federation

**Status:** Accepted · **Date:** 2026-08-08 (decided) / 2026-08-10 (recorded here)

## Context

CI needs to push container images and deploy Cloud Run revisions. The obvious
route is a service-account JSON key stored as a GitHub secret. That key is
long-lived, exfiltratable by any workflow or compromised dependency that can read
the environment, and has no natural expiry.

## Decision

No long-lived GCP service-account key is created or stored anywhere.

GitHub Actions requests an OIDC token (`permissions: id-token: write`), and GCP
Workload Identity Federation exchanges it for short-lived credentials for a
dedicated deploy service account. The trust is scoped by attribute condition to
exactly `Oxford-Lancers-Administrative-System/lancers-operations-platform`, so a
fork cannot impersonate the deployer.

Two distinct service accounts:

- **deploy** — used by GitHub Actions. Can write to one Artifact Registry
  repository, deploy revisions of one Cloud Run service (`roles/run.developer`
  granted **on that service**, not project-wide), and act as the runtime
  identity. Nothing else.
- **runtime** — the Cloud Run service's own identity. Can read one Secret Manager
  secret. It cannot deploy anything.

Every binding is scoped to an individual resource. There are no project-level
role grants. Two consequences follow, both deliberate:

- The Cloud Run service is created **once, by a human**, from a public
  placeholder image, because `roles/run.developer` can only be granted on a
  service that already exists. The pipeline thereafter only _updates_ it.
- `roles/run.developer` excludes `run.services.setIamPolicy`, so the deploy
  identity cannot change who may invoke the service. Public access is granted
  once at bootstrap; the workflow does not pass `--allow-unauthenticated`.

`scripts/gcp-bootstrap.sh` creates all of it idempotently, in two phases.

## Who can run the bootstrap

Verified against `oxford-lancers-operations` on 2026-08-10.

Phase A is covered by the roles Brian already holds (`artifactregistry.admin`,
`secretmanager.admin`, `iam.serviceAccountAdmin`, `run.admin`,
`serviceusage.serviceUsageAdmin`, `editor`).

Phase B — creating the Workload Identity Pool and provider — requires
`iam.googleapis.com/workloadIdentityPools.create`, which lives in
`roles/iam.workloadIdentityPoolAdmin`. **`roles/editor` deliberately excludes
it** and grants only read access to pools. That is not an oversight: a pool
establishes a trust relationship with an external identity provider, so creating
one is a credential-minting boundary rather than ordinary resource creation.
Granting the role itself requires `resourcemanager.projects.setIamPolicy`, held
only by a project Owner — `oxfordlancers@gmail.com` on this project.

The script detects this, completes Phase A, prints the exact grant to request,
and skips Phase B. Re-running it after the grant lands completes the setup.

## Consequences

- Bootstrap requires a human, and Phase B requires one targeted role grant from
  a project Owner. CI deliberately cannot grant itself permissions.
- Rotating credentials is not a task: there is nothing long-lived to rotate.
- If the repository is renamed or moved, the attribute condition must be updated
  or deploys stop working — a loud, safe failure.
- Adding a second Cloud Run service later means granting the deploy identity
  `roles/run.developer` on that service too. That friction is the point.
