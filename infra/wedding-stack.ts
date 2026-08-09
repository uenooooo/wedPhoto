import * as cdk from "aws-cdk-lib";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";

export class WeddingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const media = new s3.Bucket(this, "Media", {
      cors: [{ allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST], allowedOrigins: ["*"], allowedHeaders: ["*"], exposedHeaders: ["ETag"] }],
      blockPublicAccess: new s3.BlockPublicAccess({ blockPublicAcls: true, ignorePublicAcls: true, blockPublicPolicy: false, restrictPublicBuckets: false }),
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    media.addToResourcePolicy(new iam.PolicyStatement({ actions: ["s3:GetObject"], principals: [new iam.AnyPrincipal()], resources: [media.arnForObjects("ready/*"), media.arnForObjects("archives/*")] }));

    const convertRole = new iam.Role(this, "MediaConvertRole", { assumedBy: new iam.ServicePrincipal("mediaconvert.amazonaws.com") });
    media.grantRead(convertRole, "uploads/*");
    media.grantPut(convertRole, "ready/*");

    const processor = new lambda.DockerImageFunction(this, "Processor", {
      code: lambda.DockerImageCode.fromImageAsset("infra/processor"),
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,
      environment: { BUCKET: media.bucketName, MEDIACONVERT_ROLE_ARN: convertRole.roleArn },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    media.grantRead(processor, "uploads/*");
    media.grantPut(processor, "ready/*");
    processor.addToRolePolicy(new iam.PolicyStatement({ actions: ["mediaconvert:CreateJob"], resources: ["*"] }));
    processor.addToRolePolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [convertRole.roleArn] }));
    media.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(processor), { prefix: "uploads/" });

    const zipVpc = new ec2.Vpc(this, "ZipVpc", { maxAzs: 2, natGateways: 0 });
    const vpc = new ecs.Cluster(this, "ZipCluster", { vpc: zipVpc });
    const task = new ecs.FargateTaskDefinition(this, "ZipTask", { cpu: 1024, memoryLimitMiB: 2048 });
    const zipImage = new ecrAssets.DockerImageAsset(this, "ZipImage", { directory: "workers/zip" });
    task.addContainer("zip-worker", { image: ecs.ContainerImage.fromDockerImageAsset(zipImage), logging: ecs.LogDrivers.awsLogs({ streamPrefix: "zip" }) });
    media.grantRead(task.taskRole, "ready/*");
    media.grantPut(task.taskRole, "archives/*");

    const appUser = new iam.User(this, "VercelAppUser");
    appUser.addToPolicy(new iam.PolicyStatement({ actions: ["s3:ListBucket"], resources: [media.bucketArn] }));
    appUser.addToPolicy(new iam.PolicyStatement({ actions: ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], resources: [media.arnForObjects("uploads/*"), media.arnForObjects("ready/*"), media.arnForObjects("archives/*")] }));
    appUser.addToPolicy(new iam.PolicyStatement({ actions: ["ecs:RunTask"], resources: [task.taskDefinitionArn] }));
    appUser.addToPolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [task.executionRole!.roleArn, task.taskRole.roleArn] }));

    new cdk.CfnOutput(this, "BucketName", { value: media.bucketName });
    new cdk.CfnOutput(this, "VercelUserName", { value: appUser.userName });
    new cdk.CfnOutput(this, "ZipClusterArn", { value: vpc.clusterArn });
    new cdk.CfnOutput(this, "ZipTaskDefinitionArn", { value: task.taskDefinitionArn });
    new cdk.CfnOutput(this, "ZipSecurityGroupId", { value: zipVpc.vpcDefaultSecurityGroup });
    new cdk.CfnOutput(this, "ZipSubnetIds", { value: zipVpc.publicSubnets.map((subnet) => subnet.subnetId).join(",") });
  }
}
