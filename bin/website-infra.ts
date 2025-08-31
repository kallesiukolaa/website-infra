#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WebsiteInfraStack } from '../lib/website-infra-stack';

const app = new cdk.App();
new WebsiteInfraStack(app, 'WebsiteInfraStack');
