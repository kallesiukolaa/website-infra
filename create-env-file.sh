ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
REGION=$(aws configure get region)

echo The account id is $ACCOUNT_ID
echo The region id is $REGION

echo Creating .env file based on these values

cat > .env << EOF
ACCOUNT=$ACCOUNT_ID
REGION=$REGION
ECR_REPO=aws-repo-for-my-webpage
EOF