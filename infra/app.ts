import * as cdk from "aws-cdk-lib";
import { WeddingStack } from "./wedding-stack";

const app = new cdk.App();
new WeddingStack(app, "WeddingPhotoStack", { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1" } });
