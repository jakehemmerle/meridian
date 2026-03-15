#!/usr/bin/env bash
set -euo pipefail

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
GCP_REGION="${GCP_REGION:-us-central1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-meridian-web}"
IMAGE="gcr.io/${GCP_PROJECT_ID}/${CLOUD_RUN_SERVICE}"

echo "==> Building Docker image for linux/amd64..."
docker build --platform linux/amd64 -t "${IMAGE}" .

echo "==> Pushing image to GCR..."
docker push "${IMAGE}"

echo "==> Deploying to Cloud Run (${GCP_REGION})..."
gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --image "${IMAGE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 3

URL=$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --format 'value(status.url)')

echo ""
echo "==> Deployed: ${URL}"
