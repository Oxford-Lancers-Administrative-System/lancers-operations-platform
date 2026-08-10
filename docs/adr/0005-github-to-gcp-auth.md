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
  repository, deploy Cloud Run revisions (`roles/run.developer`), and act as the
  runtime identity. Nothing else.
- **runtime** — the Cloud Run service's own identity. Can read one Secret Manager
  secret. It cannot deploy anything.

`scripts/gcp-bootstrap.sh` creates all of it idempotently.

## Consequences

- Bootstrap requires a human with project Owner. CI deliberately cannot grant
  itself permissions.
- Rotating credentials is not a task: there is nothing long-lived to rotate.
- If the repository is renamed or moved, the attribute condition must be updated
  or deploys stop working — a loud, safe failure.
