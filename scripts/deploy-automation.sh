#!/usr/bin/env bash
set -euo pipefail

# Deploy Meridian automation service as Cloud Run Jobs with Cloud Scheduler triggers.
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate project
#   - Artifact Registry repository created
#   - Service account with Cloud Run invoker role
#   - Deployer keypair stored in Secret Manager
#
# Usage:
#   ./scripts/deploy-automation.sh
#
# Environment variables (required):
#   GCP_PROJECT         — GCP project ID
#   GCP_REGION          — GCP region (default: us-central1)
#   GCP_SA_EMAIL        — Service account email for Cloud Scheduler
#   SECRET_NAME         — Secret Manager secret name for the deployer keypair

: "${GCP_PROJECT:?GCP_PROJECT is required}"
: "${GCP_SA_EMAIL:?GCP_SA_EMAIL is required}"
: "${SECRET_NAME:=meridian-deployer-keypair}"

GCP_REGION="${GCP_REGION:-us-central1}"
IMAGE="gcr.io/${GCP_PROJECT}/meridian-automation"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Building and pushing automation image..."
gcloud builds submit "${REPO_ROOT}" \
  --tag "${IMAGE}" \
  --project "${GCP_PROJECT}"

# ─── Common Cloud Run Job flags ──────────────────────────────────────────────

COMMON_FLAGS=(
  --image="${IMAGE}"
  --region="${GCP_REGION}"
  --project="${GCP_PROJECT}"
  --max-retries=1
  --task-timeout=600s
  --set-secrets="ANCHOR_WALLET=/secrets/keypair.json:${SECRET_NAME}:latest"
  --set-env-vars="ANCHOR_WALLET=/secrets/keypair.json"
)

# ─── Create or update Cloud Run Jobs ────────────────────────────────────────

create_or_update_job() {
  local job_name="$1"
  local command_arg="$2"

  if gcloud run jobs describe "${job_name}" --region="${GCP_REGION}" --project="${GCP_PROJECT}" &>/dev/null; then
    echo "==> Updating job: ${job_name}"
    gcloud run jobs update "${job_name}" "${COMMON_FLAGS[@]}" --args="${command_arg}"
  else
    echo "==> Creating job: ${job_name}"
    gcloud run jobs create "${job_name}" "${COMMON_FLAGS[@]}" --args="${command_arg}"
  fi
}

create_or_update_job "meridian-morning" "morning"
create_or_update_job "meridian-afternoon" "afternoon"

# ─── Configure Cloud Scheduler ──────────────────────────────────────────────

create_or_update_schedule() {
  local schedule_name="$1"
  local cron="$2"
  local job_name="$3"

  local uri="https://${GCP_REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCP_PROJECT}/jobs/${job_name}:run"

  if gcloud scheduler jobs describe "${schedule_name}" --location="${GCP_REGION}" --project="${GCP_PROJECT}" &>/dev/null; then
    echo "==> Updating schedule: ${schedule_name}"
    gcloud scheduler jobs update http "${schedule_name}" \
      --location="${GCP_REGION}" \
      --project="${GCP_PROJECT}" \
      --schedule="${cron}" \
      --time-zone="America/New_York" \
      --uri="${uri}" \
      --http-method=POST \
      --oauth-service-account-email="${GCP_SA_EMAIL}"
  else
    echo "==> Creating schedule: ${schedule_name}"
    gcloud scheduler jobs create http "${schedule_name}" \
      --location="${GCP_REGION}" \
      --project="${GCP_PROJECT}" \
      --schedule="${cron}" \
      --time-zone="America/New_York" \
      --uri="${uri}" \
      --http-method=POST \
      --oauth-service-account-email="${GCP_SA_EMAIL}"
  fi
}

# Morning: create markets at 8:00 AM ET on weekdays
create_or_update_schedule "meridian-morning-trigger" "0 8 * * 1-5" "meridian-morning"

# Afternoon: close+settle at 4:05 PM ET on weekdays
create_or_update_schedule "meridian-afternoon-trigger" "5 16 * * 1-5" "meridian-afternoon"

echo ""
echo "==> Deployment complete!"
echo "    Image:    ${IMAGE}"
echo "    Jobs:     meridian-morning, meridian-afternoon"
echo "    Triggers: meridian-morning-trigger (8:00 AM ET), meridian-afternoon-trigger (4:05 PM ET)"
