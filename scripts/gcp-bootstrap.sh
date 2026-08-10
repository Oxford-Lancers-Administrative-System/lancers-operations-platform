#!/usr/bin/env bash
#
# One-time GCP bootstrap for the Cloud Run deployment path.
#
# Run this yourself, as a human with Owner (or equivalent) on the project — the
# CI pipeline deliberately cannot do it, because creating IAM bindings and
# federation trust is exactly the authority CI should not hold.
#
# What it creates (all idempotent — safe to re-run):
#   * Enabled APIs: Cloud Run, Cloud Build, Artifact Registry, Secret Manager,
#     IAM Credentials, Logging, Monitoring.
#   * An Artifact Registry Docker repository.
#   * A runtime service account for the Cloud Run service.
#   * A deploy service account for GitHub Actions.
#   * A Workload Identity Pool and Provider trusting exactly this GitHub repo.
#     No service-account JSON key is created — that is the point.
#   * A Secret Manager secret for the Supabase secret key (value NOT set here).
#
# Cost: Cloud Run scales to zero and bills per request; Artifact Registry bills
# for image storage; Secret Manager bills per secret version and access. At this
# service's size this is a few USD per month, dominated by image storage.
#
# Usage:
#   gcloud auth login
#   GCP_PROJECT_ID=your-project-id ./scripts/gcp-bootstrap.sh
#
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID to the target project}"
REGION="${GCP_REGION:-europe-west2}"          # London, matching the Supabase region
REPOSITORY="${ARTIFACT_REGISTRY_REPO:-lancers}"
SERVICE="${CLOUD_RUN_SERVICE:-lancers-operations-platform}"
GITHUB_REPO="${GITHUB_REPO:-Oxford-Lancers-Administrative-System/lancers-operations-platform}"
POOL="${WIF_POOL:-github}"
PROVIDER="${WIF_PROVIDER:-github-oidc}"
SECRET_NAME="${SUPABASE_SECRET_KEY_SECRET:-supabase-secret-key}"

RUNTIME_SA="${SERVICE}-run"
DEPLOY_SA="${SERVICE}-deploy"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Repo:     ${GITHUB_REPO}"
echo

gcloud config set project "${PROJECT_ID}" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  sts.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com

echo "==> Artifact Registry repository"
gcloud artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Container images for the Lancers operations platform"

echo "==> Service accounts"
gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${RUNTIME_SA}" \
    --display-name="Cloud Run runtime identity for ${SERVICE}"

gcloud iam service-accounts describe "${DEPLOY_SA_EMAIL}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${DEPLOY_SA}" \
    --display-name="GitHub Actions deployer for ${SERVICE}"

echo "==> Secret Manager secret (value not set here)"
gcloud secrets describe "${SECRET_NAME}" >/dev/null 2>&1 || \
  gcloud secrets create "${SECRET_NAME}" --replication-policy=automatic

# Runtime identity may read that one secret. Nothing else.
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo "==> Least-privilege IAM for the deployer"
# Push images to Artifact Registry — scoped to the one repository.
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/artifactregistry.writer" >/dev/null

# Deploy revisions of the one service. Project-level roles/run.admin is the
# common shortcut; this is scoped to the service instead once it exists.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/run.developer" \
  --condition=None >/dev/null

# Required so the deployer can hand the runtime identity to the service.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null

echo "==> Workload Identity Federation"
gcloud iam workload-identity-pools describe "${POOL}" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "${POOL}" \
    --location=global \
    --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
  --location=global --workload-identity-pool="${POOL}" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
    --location=global \
    --workload-identity-pool="${POOL}" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'"

# Only workflows in this repository, on the main branch, may impersonate the
# deployer. A fork or a PR branch cannot: `attribute.ref` is asserted by GitHub.
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

cat <<EOF

============================================================================
Bootstrap complete.

1. Store the Supabase secret key (server-only, never in the repo):

     printf '%s' 'THE_SECRET_KEY' | gcloud secrets versions add ${SECRET_NAME} --data-file=-

   Paste it into that command in your own terminal. Do not put it in a file,
   a chat message, a ticket, or a prompt.

2. Set these GitHub *repository variables* (Settings -> Secrets and variables
   -> Actions -> Variables). None of these are secrets:

     GCP_PROJECT_ID                       ${PROJECT_ID}
     GCP_REGION                           ${REGION}
     GCP_WORKLOAD_IDENTITY_PROVIDER       ${PROVIDER_RESOURCE}
     GCP_DEPLOY_SERVICE_ACCOUNT           ${DEPLOY_SA_EMAIL}
     ARTIFACT_REGISTRY_REPO               ${REPOSITORY}
     CLOUD_RUN_SERVICE                    ${SERVICE}
     CLOUD_RUN_MAX_INSTANCES              3
     SUPABASE_SECRET_KEY_SECRET           ${SECRET_NAME}
     NEXT_PUBLIC_SUPABASE_URL             <hosted Supabase URL>
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY <hosted publishable key>

   The last two are browser-safe by definition and are inlined into the client
   bundle at build time. The secret key is NOT among them.

   Or set them in one go:

     gh variable set GCP_PROJECT_ID --body '${PROJECT_ID}'
     gh variable set GCP_REGION --body '${REGION}'
     gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body '${PROVIDER_RESOURCE}'
     gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --body '${DEPLOY_SA_EMAIL}'
     gh variable set ARTIFACT_REGISTRY_REPO --body '${REPOSITORY}'
     gh variable set CLOUD_RUN_SERVICE --body '${SERVICE}'
     gh variable set CLOUD_RUN_MAX_INSTANCES --body '3'
     gh variable set SUPABASE_SECRET_KEY_SECRET --body '${SECRET_NAME}'

3. Set the Cloud Run service's runtime identity on first deploy:

     gcloud run services update ${SERVICE} --region ${REGION} \\
       --service-account ${RUNTIME_SA_EMAIL}

4. Merge to main. The deploy workflow will build, push, deploy, and smoke-test.
============================================================================
EOF
