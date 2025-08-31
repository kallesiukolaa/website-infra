import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  Cluster, 
  Compatibility, 
  ContainerImage, 
  CpuArchitecture, 
  FargateService, 
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
  PolicyStatement, 
  StarPrincipal 
} from 'aws-cdk-lib/aws-iam';

configDotenv({ path: ".env" })

export class WebsiteInfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpcUsed = Vpc.fromLookup(this, 'vpc-for-webpage-cluster', {
      isDefault: true
    })

    // AWS VPC endpoints have cost so we don't keep these. However the endpoints are required if you prefer to have a non-public ip address in your task. Because our webpage currently contains non-sensitive data, we aim to minimize cost. If this will change un comment these lines and set the next variable assignPublicIp false.

    let assignPublicIp = true

    /*

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

    ecrEndpoint.addToPolicy(new PolicyStatement({
      actions: ['s3:GetObject'],
      principals: [new StarPrincipal()],
      resources: ['arn:aws:s3:::prod-' + this.region + '-starport-layer-bucket/*']
    }))

    */

    const securityGroupUsed = new SecurityGroup(this, 'security-group-for-webpage', {
      vpc: vpcUsed,
      description: 'This Security Group is used for for the webpage. Do not delete this manually, its part of cdk stack.'
    })

    securityGroupUsed.addIngressRule(Peer.anyIpv6(), Port.HTTPS)

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
      ]
    })

    const service = new FargateService(this, 'Service-for-running-the-webpage', {
      cluster: cluster,
      taskDefinition: task,
      securityGroups: [securityGroupUsed],
      assignPublicIp: assignPublicIp
    })
  }
}
