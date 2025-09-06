import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  Cluster, 
  Compatibility, 
  ContainerImage, 
  CpuArchitecture, 
  DeploymentControllerType, 
  DeploymentStrategy, 
  FargateService, 
  LogDriver, 
  OperatingSystemFamily, 
  TaskDefinition 
} from 'aws-cdk-lib/aws-ecs';
import { 
  Vpc, 
  SecurityGroup, 
  Peer, 
  Port, 
  GatewayVpcEndpoint, 
  GatewayVpcEndpointAwsService, 
  InterfaceVpcEndpoint, 
  InterfaceVpcEndpointAwsService 
} from 'aws-cdk-lib/aws-ec2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { configDotenv } from 'dotenv';
import { 
  Policy,
  PolicyStatement, 
  StarPrincipal 
} from 'aws-cdk-lib/aws-iam';
import {LoadBalancer} from 'aws-cdk-lib/aws-elasticloadbalancing'
import {StringParameter} from 'aws-cdk-lib/aws-ssm'
import {ARecord, HostedZone, RecordTarget, CnameRecord} from 'aws-cdk-lib/aws-route53'
import { ClassicLoadBalancerTarget, LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, ListenerAction, Protocol, SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { DataProtectionPolicy, LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {Queue} from 'aws-cdk-lib/aws-sqs'
import {Code, Function, Runtime} from 'aws-cdk-lib/aws-lambda'
import path from 'path';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

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

    const vpcUsed = Vpc.fromLookup(this, 'vpc-for-webpage-cluster', {
      isDefault: true
    })

    // AWS VPC endpoints have cost so we don't keep these. 
    // However the endpoints are required if you prefer to have a non-public ip address in your task. 
    // Because our webpage currently contains non-sensitive data, we aim to minimize cost. 
    // If this will change un comment these lines and set the next variable assignPublicIp false.
    var assignPublicIp_val = process.env.PUBLIC_IP 

    if (assignPublicIp_val != 'TRUE' && assignPublicIp_val != 'FALSE') {
      throw new InvalidParameter("PUBLIC_IP parameter should be either TRUE or FALSE.");
    }

    let assignPublicIp = (assignPublicIp_val == 'TRUE')

    if (!assignPublicIp) {

      // If we don't want to have a private IP address, we need to create the needed gateways

      const ecrEndpoint = new GatewayVpcEndpoint(this, 'vpc-endpoint-for-ecr', {
        service: GatewayVpcEndpointAwsService.S3,
        vpc: vpcUsed,
      })

      const ecrEndpointECR = new InterfaceVpcEndpoint(this, 'vpc-interface-endpoint-ecr', {
        service: InterfaceVpcEndpointAwsService.ECR,
        vpc: vpcUsed
      })

      const ecrEndpointECRDocker = new InterfaceVpcEndpoint(this, 'vpc-interface-endpoint-ecr-docker', {
        service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
        vpc: vpcUsed
      })

      const ecrEndpointLogs = new InterfaceVpcEndpoint(this, 'vpc-interface-endpoint-cloudwatch-logs', {
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        vpc: vpcUsed
      })

      const endpointForSQS = new InterfaceVpcEndpoint(this, 'vpc-interface-endpoint-cloudwatch-sqs', {
        service: InterfaceVpcEndpointAwsService.SQS,
        vpc: vpcUsed
      })

      ecrEndpoint.addToPolicy(new PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [new StarPrincipal()],
        resources: ['arn:aws:s3:::prod-' + this.region + '-starport-layer-bucket/*']
      }))

    }

    const securityGroupUsed = new SecurityGroup(this, 'security-group-for-webpage', {
      vpc: vpcUsed,
      description: 'This Security Group is used for for the webpage. Do not delete this manually, its part of cdk stack.'
    })

    const securityGroupUsedForLBn = new SecurityGroup(this, 'security-group-for-webpagelb', {
      vpc: vpcUsed,
      description: 'This Security Group is used for for the webpage. Do not delete this manually, its part of cdk stack.'
    })

    const queueForContacts = new Queue(this, 'queueForContacts', {
      enforceSSL: true,
      receiveMessageWaitTime: Duration.seconds(10)
    })

    const cluster = new Cluster(this, 'ClusterForWebpage', {
      vpc: vpcUsed
    })

    const task = new TaskDefinition(this, 'task-for-running-the-webpage', {
      compatibility: Compatibility.FARGATE,
      cpu: '256',
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX
      },
      memoryMiB: '512'
    })

    const ecrRepo = Repository.fromRepositoryName(this, 'ecr-repo-for-the-app', process.env.ECR_REPO ?? '')

    task.addContainer('new-container-for-task', {
      image: ContainerImage.fromEcrRepository(ecrRepo),
      readonlyRootFilesystem: true,
      portMappings: [
        {
          containerPort: 3000,
          hostPort: 3000
        }
      ],
      logging: LogDriver.awsLogs({
        streamPrefix: 'WebSiteService',
        logGroup: new LogGroup(this, 'WebSiteServiceLogGroup', {
          retention: RetentionDays.ONE_DAY,
          removalPolicy: RemovalPolicy.DESTROY
        })
      }),
      environment:{
        'QUEUE_URL': queueForContacts.queueUrl
      }
    })

    const service = new FargateService(this, 'Service-for-running-the-webpage', {
      cluster: cluster,
      taskDefinition: task,
      securityGroups: [securityGroupUsed],
      assignPublicIp: assignPublicIp
    })

    const appLoadBalancer = new ApplicationLoadBalancer(this, 'load-balancer-for-webpage', {
      vpc: vpcUsed,
      securityGroup: securityGroupUsedForLBn,
      internetFacing: true
    })

    const targetGroup = new ApplicationTargetGroup(this, 'target-group-for-lb', {
      vpc: vpcUsed,
      port: 3000,
      targets: [service],
      protocol: ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthcheck',
        port: '3000',
        protocol: Protocol.HTTP,
        healthyHttpCodes: '200',
        interval: Duration.seconds(300)
      }
    })

    appLoadBalancer.addListener('https-listener', {
      certificates: [Certificate.fromCertificateArn(this, 'cert-for-webpage', StringParameter.valueForStringParameter(this, '/website/certArn'))],
      protocol: ApplicationProtocol.HTTPS,
      defaultTargetGroups: [targetGroup],
      sslPolicy: SslPolicy.TLS13_13
    })

    appLoadBalancer.addListener('http-redirect', {
      port: 80,
      defaultAction: ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true
      })
    })

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'hosted_zone', {
      hostedZoneId: 'Z0337437VGT9EPZ7HEZ4',
      zoneName: 'technarion.com'
    })


    const aAlias = new ARecord(this, 'a-record-for-domain', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(appLoadBalancer)),
      zone: hostedZone
    })

    const cnameRecord = new CnameRecord(this, 'cname-record-for-webpage', {
      domainName: 'technarion.com',
      zone: hostedZone,
      recordName: 'www'
    })

    const readerLambda = new Function(this, 'lambda-for-delivering-contacts', {
      code: Code.fromAsset(path.join(__dirname, 'new-contact-delivery-lambda')),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_22_X,
      environment: {
        'TOPIC_ARN': StringParameter.valueForStringParameter(this, '/website/emailTopicArn')
      }
    })

    const newContactEventSource = new SqsEventSource(queueForContacts);

    readerLambda.addEventSource(newContactEventSource)

    task.taskRole.attachInlinePolicy(new Policy(this, 'policy-for-pushing-contacts-to-sqs', {
      statements: [
        new PolicyStatement({
          actions: ["sqs:SendMessage"],
          resources: [queueForContacts.queueArn]
        })
      ]
    }))

    readerLambda.role?.attachInlinePolicy(new Policy(this, 'policy-for-pushing-contacts-to-sns', {
      statements: [
        new PolicyStatement({
          actions: ["sns:Publish"],
          resources: [StringParameter.valueForStringParameter(this, '/website/emailTopicArn')]
        })
      ]
    }))
  }
}
