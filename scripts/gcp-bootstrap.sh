#!/usr/bin/env bash
#
# One-time GCP bootstrap for the Cloud Run deployment path.
#
# Run this yourself. CI deliberately cannot: creating IAM bindings and identity
# federation trust is exactly the authority CI should not hold.
#
#   gcloud auth login
#   GCP_PROJECT_ID=oxford-lancers-operations ./scripts/gcp-bootstrap.sh
#
# Everything is idempotent — safe to re-run, and designed to be re-run after the
# Workload Identity grant below lands.
#
# ---------------------------------------------------------------------------
# Two phases, split by who can do what
# ---------------------------------------------------------------------------
#
# PHASE A needs the roles Brian already holds on this project (artifactregistry.
# admin, secretmanager.admin, iam.serviceAccountAdmin, run.admin,
# serviceusage.serviceUsageAdmin):
#
#   * Enable the required APIs.
#   * Artifact Registry Docker repository.
#   * Runtime service account (the Cloud Run identity) and deploy service
#     account (the GitHub Actions identity).
#   * Secret Manager secret for the Supabase secret key (value NOT set here).
#   * All IAM, scoped to individual resources rather than the whole project.
#   * The Cloud Run service itself, created once from a public placeholder image
#     so that the deploy workflow only ever has to *update* it.
#
# PHASE B needs `roles/iam.workloadIdentityPoolAdmin`, which `roles/editor` does
# NOT include — creating a pool and provider establishes a trust relationship
# with an external identity provider, so Google keeps it out of the basic roles:
#
#   * Workload Identity Pool and GitHub OIDC provider.
#
# If Phase B is not permitted, the script completes Phase A, prints the exact
# grant to request, and skips Phase B. Re-run it once the grant lands.
#
# No service-account JSON key is created at any point. That is the whole point
# of using federation — see docs/adr/0005-github-to-gcp-auth.md.
#
# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------
# Cloud Run scales to zero and bills per request; Artifact Registry bills for
# image storage; Secret Manager bills per secret version and access. At this
# service's size that is a few USD per month, dominated by image storage.
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
MAX_INSTANCES="${CLOUD_RUN_MAX_INSTANCES:-3}"
PLACEHOLDER_IMAGE="us-docker.pkg.dev/cloudrun/container/hello"

# Service account IDs are capped at 30 characters by GCP, and
# "lancers-operations-platform-run" is 31. Hence a separate short base name
# rather than deriving them from ${SERVICE}.
SA_PREFIX="${GCP_SA_PREFIX:-lancers-ops}"
RUNTIME_SA="${SA_PREFIX}-run"
DEPLOY_SA="${SA_PREFIX}-deploy"

for sa in "${RUNTIME_SA}" "${DEPLOY_SA}"; do
  if [ "${#sa}" -gt 30 ] || [ "${#sa}" -lt 6 ]; then
    echo "Service account id '${sa}' is ${#sa} chars; GCP requires 6-30." >&2
    echo "Set GCP_SA_PREFIX to something shorter." >&2
    exit 1
  fi
done

RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA_EMAIL="${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

say() { printf '\n==> %s\n' "$1"; }

echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Service:  ${SERVICE}"
echo "Repo:     ${GITHUB_REPO}"

gcloud config set project "${PROJECT_ID}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

# ===========================================================================
# PHASE A
# ===========================================================================

say "Enabling APIs"
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

say "Artifact Registry repository"
gcloud artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Container images for the Lancers operations platform"

say "Service accounts"
gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${RUNTIME_SA}" \
    --display-name="Cloud Run runtime identity for ${SERVICE}"

gcloud iam service-accounts describe "${DEPLOY_SA_EMAIL}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "${DEPLOY_SA}" \
    --display-name="GitHub Actions deployer for ${SERVICE}"

say "Secret Manager secret (value NOT set here)"
gcloud secrets describe "${SECRET_NAME}" >/dev/null 2>&1 || \
  gcloud secrets create "${SECRET_NAME}" --replication-policy=automatic

# The runtime identity may read that one secret. Nothing else.
gcloud secrets add-iam-policy-binding "${SECRET_NAME}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

say "Least-privilege IAM for the deployer"
# Push images — scoped to this one repository, not the whole registry.
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/artifactregistry.writer" >/dev/null

# Hand the runtime identity to the service at deploy time. `roles/run.developer`
# does not include `iam.serviceAccounts.actAs`, so this separate binding on the
# runtime service account is required.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA_EMAIL}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null

say "Cloud Run service (created once, from a placeholder image)"
# The service is created here rather than by the pipeline for two reasons:
#   1. `roles/run.developer` is granted on THIS SERVICE, not project-wide, so the
#      service has to exist before the binding can be made.
#   2. `roles/run.developer` excludes `run.services.setIamPolicy`, so public
#      access is granted here, once, and the deploy workflow never touches the
#      service's IAM policy.
if ! gcloud run services describe "${SERVICE}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud run deploy "${SERVICE}" \
    --region="${REGION}" \
    --image="${PLACEHOLDER_IMAGE}" \
    --service-account="${RUNTIME_SA_EMAIL}" \
    --max-instances="${MAX_INSTANCES}" \
    --min-instances=0 \
    --concurrency=80 \
    --cpu=1 \
    --memory=512Mi \
    --timeout=60s \
    --port=8080 \
    --allow-unauthenticated \
    --quiet
else
  echo "    already exists — leaving the running revision alone"
  gcloud run services add-iam-policy-binding "${SERVICE}" \
    --region="${REGION}" \
    --member="allUsers" \
    --role="roles/run.invoker" >/dev/null
fi

# Deploy new revisions of THIS service only.
gcloud run services add-iam-policy-binding "${SERVICE}" \
  --region="${REGION}" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/run.developer" >/dev/null

SERVICE_URL="$(gcloud run services describe "${SERVICE}" --region="${REGION}" --format='value(status.url)')"

# ===========================================================================
# PHASE B — needs roles/iam.workloadIdentityPoolAdmin
# ===========================================================================

say "Workload Identity Federation"
WIF_DONE=false

if gcloud iam workload-identity-pools describe "${POOL}" --location=global >/dev/null 2>&1; then
  echo "    pool '${POOL}' already exists"
  WIF_DONE=true
elif gcloud iam workload-identity-pools create "${POOL}" \
       --location=global --display-name="GitHub Actions" 2>/tmp/wif-error; then
  WIF_DONE=true
else
  echo "    SKIPPED — insufficient permission to create the pool."
  sed 's/^/    | /' /tmp/wif-error | head -5
fi

if [ "${WIF_DONE}" = true ]; then
  gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
    --location=global --workload-identity-pool="${POOL}" >/dev/null 2>&1 || \
    gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
      --location=global \
      --workload-identity-pool="${POOL}" \
      --display-name="GitHub OIDC" \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
      --attribute-condition="assertion.repository == '${GITHUB_REPO}'"

  # Only workflows in this repository may impersonate the deployer. A fork
  # cannot: `attribute.repository` is asserted by GitHub, not by the workflow.
  gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA_EMAIL}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null
fi

rm -f /tmp/wif-error
PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

# ===========================================================================
# Report
# ===========================================================================

echo
echo "============================================================================"
if [ "${WIF_DONE}" != true ]; then
cat <<EOF
PHASE A COMPLETE. PHASE B BLOCKED.

Creating a Workload Identity Pool needs the permission
\`iam.googleapis.com/workloadIdentityPools.create\`, which lives in
\`roles/iam.workloadIdentityPoolAdmin\`. \`roles/editor\` deliberately excludes it:
a pool establishes a trust relationship with an external identity provider, so
it is a credential-minting boundary rather than ordinary resource creation.

Ask a project Owner to run exactly this, once:

  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\
    --member="user:<your-google-account>" \\
    --role="roles/iam.workloadIdentityPoolAdmin"

It grants the ability to manage identity federation pools in this one project.
It does not grant access to data, billing, or the ability to change anyone
else's permissions.

Then re-run this script. It is idempotent and will pick up where it stopped.
EOF
else
cat <<EOF
BOOTSTRAP COMPLETE.
EOF
fi

cat <<EOF

Service URL (placeholder until the first real deploy):
  ${SERVICE_URL}

1. Store the Supabase secret key. Paste it into this command in your own
   terminal — do not put it in a file, a ticket, a chat message, or a prompt:

     printf '%s' 'THE_SECRET_KEY' | gcloud secrets versions add ${SECRET_NAME} --data-file=-

2. Set the GitHub repository variables. None of these are secrets:

     gh variable set GCP_PROJECT_ID --body '${PROJECT_ID}'
     gh variable set GCP_REGION --body '${REGION}'
     gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --body '${DEPLOY_SA_EMAIL}'
     gh variable set CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT --body '${RUNTIME_SA_EMAIL}'
     gh variable set ARTIFACT_REGISTRY_REPO --body '${REPOSITORY}'
     gh variable set CLOUD_RUN_SERVICE --body '${SERVICE}'
     gh variable set CLOUD_RUN_MAX_INSTANCES --body '${MAX_INSTANCES}'
     gh variable set SUPABASE_SECRET_KEY_SECRET --body '${SECRET_NAME}'
EOF

if [ "${WIF_DONE}" = true ]; then
cat <<EOF
     gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body '${PROVIDER_RESOURCE}'
EOF
else
cat <<EOF
     # GCP_WORKLOAD_IDENTITY_PROVIDER — available after Phase B completes
EOF
fi

cat <<EOF

   Plus the two browser-safe Supabase values from the hosted project. These are
   inlined into the client bundle at build time and are public by design:

     gh variable set NEXT_PUBLIC_SUPABASE_URL --body '<hosted Supabase URL>'
     gh variable set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --body '<hosted publishable key>'

3. Merge to main. The deploy workflow builds, pushes, deploys, and smoke-tests.
============================================================================
EOF
