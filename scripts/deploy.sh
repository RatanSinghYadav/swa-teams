#!/bin/bash

rm -rf node_modules
rm -rf nodejs_layer

yarn install --production

mkdir -p nodejs_layer/nodejs
mv node_modules nodejs_layer/nodejs
echo nodejs layer ready

read -p "Enter stage value (prod|qa|develop) default is develop: " arg1

stage=${arg1:-develop}

CURRENT_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "Current account id: $CURRENT_ACCOUNT_ID"

if [[ $stage == "prod" && "$CURRENT_ACCOUNT_ID" != "727646511034" ]]; then
  echo "Error: You are not logged into PROD account"
  exit 1
fi

if [[ $stage != "prod" && "$CURRENT_ACCOUNT_ID" == "727646511034" ]]; then
  echo "Error: You are logged into PROD account. Cannot deploy to $stage"
  exit 1
fi

sam build
#update `--stack-name` and `Stage` value manually so we do not override the existing stack by mistake
sam deploy --stack-name "swa-bot-${stage}" --parameter-overrides "Stage=${stage}" --capabilities CAPABILITY_IAM --resolve-s3
