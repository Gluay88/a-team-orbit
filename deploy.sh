#!/usr/bin/env bash
# Deploys A Team Orbit: backend (Lambda, API Gateway, DynamoDB) and, with WITH_SITE=true,
# S3 + CloudFront hosting for the React site.
#   ./deploy.sh                  API + database only
#   WITH_SITE=true ./deploy.sh   also host the React app on CloudFront (account must be CloudFront-verified)
set -euo pipefail
STAGE="${1:-prod}"
WITH_SITE="${WITH_SITE:-false}"
REGION="us-east-1"
STACK="a-team-orbit-${STAGE}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "→ Deploying backend ($STACK)"
(cd "$ROOT/backend" && serverless deploy --stage "$STAGE" --region "$REGION" --param="withSite=$WITH_SITE")

out() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API_URL="$(out HttpApiUrl)"
echo "API:  $API_URL"
if [ "$WITH_SITE" != "true" ]; then
  echo "Site hosting is off. Run locally: cd frontend && VITE_API_URL=$API_URL npm run dev"
  exit 0
fi
BUCKET="$(out SiteBucketName)"
DIST_ID="$(out DistributionId)"
SITE_URL="$(out SiteUrl)"

echo "→ Building React app (API: $API_URL)"
(cd "$ROOT/frontend" && npm install --no-audit --no-fund && VITE_API_URL="$API_URL" npm run build)

echo "→ Uploading to s3://$BUCKET"
aws s3 sync "$ROOT/frontend/dist" "s3://$BUCKET" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query "Invalidation.Id" --output text >/dev/null

echo ""
echo "API:  $API_URL"
echo "Site: $SITE_URL"
