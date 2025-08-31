#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WebsiteInfraStack } from '../lib/website-infra-stack';
import { configDotenv } from 'dotenv';

configDotenv({path: ".env"})

const app = new cdk.App();
new WebsiteInfraStack(app, 'WebsiteInfraStack', {env: {account: process.env.ACCOUNT, region: process.env.REGION}});
