#!/usr/bin/env bash
# =============================================================================
# Mystical 배포 스크립트 — Mystical-Client 자격증명으로 실행
# 사전 준비: aws configure --profile mystical-client
# =============================================================================
set -euo pipefail

PROFILE="mystical-client"
REGION="ap-northeast-2"
ACCOUNT_ID=$(aws sts get-caller-identity --profile $PROFILE --query Account --output text)

FRONTEND_BUCKET="mystical-frontend-${ACCOUNT_ID}"
OUTPUT_BUCKET="mystical-output-${ACCOUNT_ID}"
LAMBDA_NAME="mystical-render"
LAMBDA_ROLE="mystical-lambda-role"
LAYER_NAME="ghostscript"
API_NAME="mystical-api"

echo "▶ Account: $ACCOUNT_ID / Region: $REGION"

# ── Phase 2: S3 버킷 ──────────────────────────────────────────────────────────

echo "[2-1] 프론트엔드 버킷 생성"
aws s3api create-bucket \
  --bucket "$FRONTEND_BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" \
  --profile $PROFILE 2>&1 | grep -v "BucketAlreadyOwnedByYou" || true

aws s3api put-public-access-block \
  --bucket "$FRONTEND_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile $PROFILE

echo "[2-2] 정적 파일 업로드"
aws s3 sync ./new/paint/ "s3://$FRONTEND_BUCKET/" \
  --exclude "*.onnx" \
  --cache-control "no-cache" \
  --profile $PROFILE

# best.onnx는 장기 캐시
aws s3 cp ./new/paint/best.onnx "s3://$FRONTEND_BUCKET/best.onnx" \
  --cache-control "public, max-age=604800" \
  --profile $PROFILE

echo "[2-3] output 버킷 생성"
aws s3api create-bucket \
  --bucket "$OUTPUT_BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" \
  --profile $PROFILE 2>&1 | grep -v "BucketAlreadyOwnedByYou" || true

aws s3api put-public-access-block \
  --bucket "$OUTPUT_BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --profile $PROFILE

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$OUTPUT_BUCKET" \
  --lifecycle-configuration file://iam/output-lifecycle.json \
  --profile $PROFILE

# ── Phase 3: Lambda ────────────────────────────────────────────────────────────

echo "[3-1] Ghostscript Layer 등록"
# ghostscript-*.zip 패턴으로 자동 탐지 (파일명 버전 무관)
LAYER_ZIP=$(ls ./ghostscript-*.zip 2>/dev/null | head -1)
if [ -n "$LAYER_ZIP" ]; then
  echo "  ZIP 발견: $LAYER_ZIP"
  LAYER_ARN=$(aws lambda publish-layer-version \
    --layer-name "$LAYER_NAME" \
    --zip-file "fileb://$LAYER_ZIP" \
    --compatible-runtimes python3.12 \
    --compatible-architectures arm64 \
    --region "$REGION" \
    --profile $PROFILE \
    --query LayerVersionArn --output text)
  echo "  Layer ARN: $LAYER_ARN"
else
  echo "⚠️  ghostscript-*.zip 없음 — 현재 디렉토리에 파일을 배치 후 재실행"
  exit 1
fi

echo "[3-2] Lambda 실행 역할 확인 (Mystical-Admin으로 사전 생성 필요)"
ROLE_ARN=$(aws iam get-role --role-name "$LAMBDA_ROLE" \
  --profile $PROFILE --query Role.Arn --output text 2>/dev/null || true)
if [ -z "$ROLE_ARN" ]; then
  echo "⚠️  역할 '$LAMBDA_ROLE' 없음 — Mystical-Admin으로 iam/trust-lambda.json 기반 역할 생성 후 재실행"
  exit 1
fi
echo "  Role ARN: $ROLE_ARN"

echo "[3-3] Lambda 패키지 빌드 및 배포"
LAMBDA_ZIP="lambda_package.zip"
rm -f "$LAMBDA_ZIP"

if command -v zip &>/dev/null; then
  # Linux/Mac 환경
  cd lambda
  zip -r "../$LAMBDA_ZIP" handler.py ps_lib/
  cd ..
else
  # Windows Git Bash 환경 - 스테이징 디렉토리를 생성하여 압축을 진행
  echo "zip 명령 없음 -> 스테이징 디렉토리를 생성하여 압축을 진행합니다."
  
  STAGING_DIR="lambda_staging"
  rm -rf "$STAGING_DIR"
  mkdir -p "$STAGING_DIR"
  
  cp -L lambda/handler.py "$STAGING_DIR/"
  cp -RL lambda/ps_lib "$STAGING_DIR/"

  python -c "
import os
import zipfile

zip_name = '$LAMBDA_ZIP'
base_dir = '$STAGING_DIR'

with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
    handler_path = os.path.join(base_dir, 'handler.py')
    if os.path.exists(handler_path):
        z.write(handler_path, 'handler.py')
    
    ps_lib_dir = os.path.join(base_dir, 'ps_lib')
    for root, dirs, files in os.walk(ps_lib_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, base_dir)
            z.write(full_path, rel_path)
"
  rm -rf "$STAGING_DIR"
fi

# 압축 파일 생성 여부 검증
if [ ! -f "$LAMBDA_ZIP" ] || [ ! -s "$LAMBDA_ZIP" ]; then
  echo "오류: $LAMBDA_ZIP 파일이 생성되지 않았거나 비어 있습니다. 압축 과정을 확인하세요."
  exit 1
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}"

# 래퍼가 에러를 감지해 스크립트를 강제 종료하는 것을 방지하기 위해
# 존재하지 않아도 에러를 반환하지 않는 list-functions를 활용해 존재 여부를 조회합니다.
echo "Lambda 함수 존재 여부 확인 중..."
FUNC_EXISTS=$(aws lambda list-functions \
  --region "$REGION" \
  --profile $PROFILE \
  --query "Functions[?FunctionName=='$LAMBDA_NAME'].FunctionName" \
  --output text)

if [ -n "$FUNC_EXISTS" ]; then
  echo "Lambda 함수가 이미 존재하므로 코드를 업데이트합니다."
  aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file fileb://lambda_package.zip \
    --region "$REGION" \
    --profile $PROFILE
else
  echo "Lambda 함수가 존재하지 않으므로 새로 생성합니다."
  aws lambda create-function \
    --function-name "$LAMBDA_NAME" \
    --runtime python3.12 \
    --architectures arm64 \
    --role "$ROLE_ARN" \
    --handler handler.handler \
    --zip-file fileb://lambda_package.zip \
    --timeout 30 \
    --memory-size 512 \
    --environment "Variables={RESULT_BUCKET=$OUTPUT_BUCKET}" \
    --layers "$LAYER_ARN" \
    --region "$REGION" \
    --profile $PROFILE
fi

# ── Phase 4: API Gateway ───────────────────────────────────────────────────────

echo "[4-1] HTTP API 생성"
API_ID=$(aws apigatewayv2 create-api \
  --name "$API_NAME" \
  --protocol-type HTTP \
  --region "$REGION" \
  --profile $PROFILE \
  --query ApiId --output text)

LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"

# Lambda 통합 생성
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id "$API_ID" \
  --integration-type AWS_PROXY \
  --integration-uri "$LAMBDA_ARN" \
  --payload-format-version 2.0 \
  --region "$REGION" \
  --profile $PROFILE \
  --query IntegrationId --output text)

# POST /render 라우트
aws apigatewayv2 create-route \
  --api-id "$API_ID" \
  --route-key "POST /render" \
  --target "integrations/$INTEGRATION_ID" \
  --region "$REGION" \
  --profile $PROFILE

# $default 스테이지 자동 배포
aws apigatewayv2 create-stage \
  --api-id "$API_ID" \
  --stage-name '$default' \
  --auto-deploy \
  --region "$REGION" \
  --profile $PROFILE

# Lambda에 API Gateway 호출 권한 부여
aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id apigw-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/render" \
  --region "$REGION" \
  --profile $PROFILE

LAMBDA_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/render"
echo "API URL: $LAMBDA_URL"

echo ""
echo "✅ Phase 2~4 완료"
echo "다음 단계:"
echo "  1. CloudFront 배포 생성 (콘솔 권장)"
echo "  2. index.html에 LAMBDA_URL=$LAMBDA_URL 주입 후 재업로드"
echo "  3. CloudFront 캐시 무효화: aws cloudfront create-invalidation --distribution-id DIST_ID --paths '/*'"