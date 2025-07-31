# Remove directories if they exist
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue node_modules
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue nodejs_layer

# Install production dependencies using yarn
yarn install --production

# Create the nodejs_layer/nodejs directory and move node_modules into it
New-Item -ItemType Directory -Path nodejs_layer/nodejs -Force
New-Item -ItemType Directory -Path nodejs_layer/nodejs/node_modules -Force
Copy-Item -Path node_modules/* -Destination nodejs_layer/nodejs/node_modules -Recurse
Write-Output "nodejs layer ready"

# Prompt the user for the stage value
$arg1 = Read-Host "Enter stage value (prod|qa|develop) default is develop:"

# Set the stage variable, defaulting to "develop" if no input is provided
$stage = if ($arg1) { $arg1 } else { "develop" }

# Get current AWS account ID
$CURRENT_ACCOUNT_ID = (aws sts get-caller-identity --query "Account" --output text)
Write-Output "Current account id: $CURRENT_ACCOUNT_ID"

# Validate stage and account ID
if ($stage -eq "prod" -and $CURRENT_ACCOUNT_ID -ne "727646511034") {
    Write-Output "Error: You are not logged into PROD account"
    exit 1
}

if ($stage -ne "prod" -and $CURRENT_ACCOUNT_ID -eq "727646511034") {
    Write-Output "Error: You are logged into PROD account. Cannot deploy to $stage"
    exit 1
}

# Build the SAM application
sam build

# Deploy the SAM application with the specified stack name and stage parameter
# Update `--stack-name` and `Stage` value manually so we do not override the existing stack by mistake
sam deploy --stack-name "swa-bot-${stage}" --parameter-overrides "Stage=${stage}"  --resolve-s3 --confirm-changeset