import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { configDotenv } from 'dotenv';
import {
  Policy,
  PolicyStatement} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { ARecord, HostedZone, RecordTarget, CnameRecord } from 'aws-cdk-lib/aws-route53'
import { ApiGatewayv2DomainProperties, CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import path from 'path';
import { CorsHttpMethod, DomainName, HttpApi, HttpMethod, ApiMapping } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Distribution, OriginAccessIdentity, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';

configDotenv({ path: ".env" })

class InvalidParameter extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidParameterInputError";
  }
}

export class WebsiteInfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const webCert = Certificate.fromCertificateArn(this, 'cert-for-webpage', StringParameter.valueForStringParameter(this, '/website/certArn'))

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'hosted_zone', {
      hostedZoneId: 'Z0337437VGT9EPZ7HEZ4',
      zoneName: 'technarion.com'
    })

    const websiteBucket = Bucket.fromBucketName(this, "web-site-bucket", process.env.WEB_SITE_BUCKET ?? '')

    const originAccessIdentity = new OriginAccessIdentity(
      this,
      'OAI',
    );
    websiteBucket.grantRead(originAccessIdentity);

    const distribution = new Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: new S3Origin(websiteBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: ['technarion.com', 'www.technarion.com'], // Replace with your domain names
      certificate: webCert,
      defaultRootObject: 'index.html',
    });


    const aAlias = new ARecord(this, 'a-record-for-domain', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: hostedZone
    })

    const cnameRecord = new CnameRecord(this, 'cname-record-for-webpage', {
      domainName: 'technarion.com',
      zone: hostedZone,
      recordName: 'www'
    })

    const senderLambda = new Function(this, 'lambda-for-senfing-contacts', {
      code: Code.fromAsset(path.join(__dirname, 'send-contact-message-lambda')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_LATEST,
      environment: {
        'TOPIC_ARN': StringParameter.valueForStringParameter(this, '/website/emailTopicArn')
      }
    })

    senderLambda.role?.attachInlinePolicy(new Policy(this, 'policy-for-pushing-contacts-to-sns-sender', {
      statements: [
        new PolicyStatement({
          actions: ["sns:Publish"],
          resources: [StringParameter.valueForStringParameter(this, '/website/emailTopicArn')]
        })
      ]
    }))

    const api = new HttpApi(this, "contact-delivery-api", {
      corsPreflight: {
        allowHeaders: ['*'],
        exposeHeaders: ['*'],
        allowMethods: [CorsHttpMethod.POST],
        allowOrigins: ['http://localhost:3000', 'https://technarion.com', 'https://technarion.fi', 'https://www.technarion.com']
      }
    })

    api.addRoutes({
      integration: new HttpLambdaIntegration('senderLambdaIntegration', senderLambda),
      path: '/contact',
      methods: [HttpMethod.POST]
    })

    const domainName = new DomainName(this, 'domainname-for-api', {
      certificate: Certificate.fromCertificateArn(this, 'cert-for-api', StringParameter.valueForStringParameter(this, '/website/apiCertArn')),
      domainName: 'api.technarion.com'
    })

    const aAliasForApi = new ARecord(this, 'A-record-for-api', {
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(domainName.regionalDomainName, domainName.regionalHostedZoneId)
      ),
      zone: hostedZone,
      recordName: 'api.technarion.com'
    })

    const apiMapping = new ApiMapping(this, 'api-mapping', {
      api: api,
      domainName: domainName
    })
  }
}
