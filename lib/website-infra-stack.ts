import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { configDotenv } from 'dotenv';
import {
  Policy,
  PolicyStatement} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { ARecord, HostedZone, RecordTarget, CnameRecord, AaaaRecord } from 'aws-cdk-lib/aws-route53'
import { ApiGatewayv2DomainProperties, CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import path from 'path';
import { CorsHttpMethod, DomainName, HttpApi, HttpMethod, ApiMapping } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { BlockPublicAccess, Bucket, BucketAccessControl, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Distribution, FunctionEventType, ViewerProtocolPolicy, Function as CloudFrontFunction, FunctionCode } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {Schedule} from 'aws-cdk-lib/aws-scheduler';
import {LambdaInvoke} from 'aws-cdk-lib/aws-scheduler-targets'

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

    let disposableDomainsUrl = "https://raw.githubusercontent.com/disposable/disposable-email-domains/master/domains.json";

    const webCert = Certificate.fromCertificateArn(this, 'cert-for-webpage', StringParameter.valueForStringParameter(this, '/website/certArn'))

    const webCertFI = Certificate.fromCertificateArn(this, 'cert-for-webpage-fi', StringParameter.valueForStringParameter(this, '/website/certArnFI'))

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'hosted_zone', {
      hostedZoneId: 'Z0337437VGT9EPZ7HEZ4',
      zoneName: 'technarion.com'
    })

    const hostedZoneFI = HostedZone.fromHostedZoneAttributes(this, 'hosted_zone_fi', {
      hostedZoneId: 'Z02748021O0SU6QSPNWG9',
      zoneName: 'technarion.fi'
    })

    //const websiteBucket = Bucket.fromBucketName(this, "web-site-bucket", process.env.WEB_SITE_BUCKET ?? '')

    const websiteBucket = new Bucket(this, 'website-origin-bucket-new', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      accessControl: BucketAccessControl.PRIVATE,
      bucketName: 'technarion-3-bucket-for-webpage',
      removalPolicy: RemovalPolicy.DESTROY
    })

    const accessLogsBucket = new Bucket(this, 'bucket-for-website-access-logs', {
      enforceSSL: true,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [
        {
          expiration: Duration.days(1),
          prefix: 'webapp'
        }
      ]
    })

    const tempAssetsBucket = new Bucket(this, 'bucket-for-temp-assets', {
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const rewriteFunction = new CloudFrontFunction(this, 'lambda-for-redirect', {
      comment: 'Rewrites path to include .html extension if missing (e.g., /contact to /contact.html)',
      code: FunctionCode.fromFile({
        filePath: path.join(__dirname, 'redirect-function/index.mjs')
      })
    })

    const distribution = new Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: FunctionEventType.VIEWER_REQUEST
          }
        ]
      },
      domainNames: ['technarion.com', 'www.technarion.com'], // Replace with your domain names
      certificate: webCert,
      defaultRootObject: 'index.html',
      logBucket: accessLogsBucket,
      logFilePrefix: 'webappCom'
    });

    const distributionFI = new Distribution(this, 'WebsiteDistribution-fi', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: FunctionEventType.VIEWER_REQUEST
          }
        ]
      },
      domainNames: ['technarion.fi', 'www.technarion.fi'], // Replace with your domain names
      certificate: webCertFI,
      defaultRootObject: 'index.html',
      logBucket: accessLogsBucket,
      logFilePrefix: 'webappFi'
    });


    const aAlias = new ARecord(this, 'a-record-for-domain', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: hostedZone
    })

    // Apex (AAAA)
    new AaaaRecord(this, 'ApexAAAA', {
      zone:hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    // Apex (AAAA)
    new AaaaRecord(this, 'ApexAAAAFI', {
      zone:hostedZoneFI,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distributionFI)),
    });

    const cnameRecord = new CnameRecord(this, 'cname-record-for-webpage', {
      domainName: 'technarion.com',
      zone: hostedZone,
      recordName: 'www'
    })

    const aAliasFI = new ARecord(this, 'a-record-for-domain-fi', {
      target: RecordTarget.fromAlias(new CloudFrontTarget(distributionFI)),
      zone: hostedZoneFI
    })

    const cnameRecordFI = new CnameRecord(this, 'cname-record-for-webpage-fi', {
      domainName: 'technarion.fi',
      zone: hostedZoneFI,
      recordName: 'www'
    })

    const senderLambda = new Function(this, 'lambda-for-senfing-contacts', {
      code: Code.fromAsset(path.join(__dirname, 'send-contact-message-lambda')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_LATEST,
      environment: {
        'TOPIC_ARN': StringParameter.valueForStringParameter(this, '/website/emailTopicArn'),
        'TEMP_ASSET_BUCKET_NAME': tempAssetsBucket.bucketName,
        'DISPOSABLE_DOMAINS_LIST': 'domains.json'
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

    senderLambda.role?.attachInlinePolicy(new Policy(this, 'policy-for-getting-emaildomain-list-from-s3', {
      statements: [
        new PolicyStatement({
          actions: ["s3:GetObject"],
          resources: [tempAssetsBucket.bucketArn + '/*']
        })
      ]
    }))

    const invalidationLambda = new Function(this, 'lambda-for-invalidating-distributions', {
      code: Code.fromAsset(path.join(__dirname, 'invalidation-function')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_LATEST,
      functionName: 'website-invalidate',
      environment: {
        'DISTRIBUTION_ID_COM': distribution.distributionId,
        'DISTRIBUTION_ID_FI': distributionFI.distributionId
      }
    })

    invalidationLambda.role?.attachInlinePolicy(new Policy(this, 'policy-for-invalidating-distributions', {
      statements: [
        new PolicyStatement({
          actions: ["cloudfront:CreateInvalidation"],
          resources: [distribution.distributionArn, distributionFI.distributionArn]
        })
      ]
    }))

    const disposableEmaillistUpdaterFunctions = new Function(this, 'lambda-for-updating-email-list', {
      code: Code.fromAsset(path.join(__dirname, 'update-disposable-email-domains')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_LATEST,
      functionName: 'update-disposable-email-domains',
      environment: {
        'FILE_URL': disposableDomainsUrl,
        'TEMP_ASSET_BUCKET_NAME': tempAssetsBucket.bucketName,
        'FILE_NAME': 'domains.json'
      }
    })

    disposableEmaillistUpdaterFunctions.role?.attachInlinePolicy(new Policy(this, 'policy-for-s3-access-domains', {
      statements: [
        new PolicyStatement({
          actions: ["s3:PutObject"],
          resources: [tempAssetsBucket.bucketArn + '/*']
        })
      ]
    }))

    const emailDomainListUpdateScheduler = new Schedule(this, 'emailDomainListUpdateScheduler', {
      schedule: {
        expressionString: 'cron(0 0 * * ? *)'
      },
      target: new LambdaInvoke(disposableEmaillistUpdaterFunctions)
    })

    const api = new HttpApi(this, "contact-delivery-api", {
      corsPreflight: {
        allowHeaders: ['*'],
        exposeHeaders: ['*'],
        allowMethods: [CorsHttpMethod.POST],
        allowOrigins: ['http://localhost:3000', 'https://technarion.com', 'https://technarion.fi', 'https://www.technarion.com', 'https://www.technarion.fi']
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

    const aaaaAliasForApi = new AaaaRecord(this, 'AAAA-record-for-api', {
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
