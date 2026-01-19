import {
  LambdaClient,
  GetFunctionCommand,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { CredentialService } from './credentialService';

/**
 * Lambda Function type
 */
export interface LambdaFunction {
  arn: string;
  name: string;
  runtime: string;
  isOutdated: boolean;
}

/**
 * Lambda Service
 * AWS Lambda SDK operations
 * Ports logic from aws_cli.rs:1020-1150 (get_lambda_functions)
 */
export class LambdaService {
  private credentialService = new CredentialService();

  /**
   * Get Lambda functions associated with an Amplify app and branch
   * Uses Gen2 tags (amplify:app-id and amplify:branch-name)
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param repoName Repository name (for Gen1 fallback, not used in Gen2)
   * @returns Array of Lambda functions
   */
  async getLambdaFunctions(
    region: string,
    appId: string,
    branchName: string,
    repoName?: string
  ): Promise<LambdaFunction[]> {
    const creds = this.credentialService.getAWSSDKCredentials();
    if (!creds) {
      throw new Error('No AWS credentials configured');
    }

    // Strategy 1: Gen2 tags (amplify:app-id and amplify:branch-name)
    const tagClient = new ResourceGroupsTaggingAPIClient({
      region,
      credentials: creds,
    });

    const response = await tagClient.send(
      new GetResourcesCommand({
        ResourceTypeFilters: ['lambda:function'],
        TagFilters: [
          { Key: 'amplify:app-id', Values: [appId] },
          { Key: 'amplify:branch-name', Values: [branchName] },
        ],
      })
    );

    const functions: LambdaFunction[] = [];

    if (response.ResourceTagMappingList) {
      const lambdaClient = new LambdaClient({ region, credentials: creds });

      for (const resource of response.ResourceTagMappingList) {
        const functionName = resource.ResourceARN?.split(':function:')[1];
        if (!functionName) continue;

        try {
          // Get function details
          const funcDetails = await lambdaClient.send(
            new GetFunctionCommand({ FunctionName: functionName })
          );

          const runtime = funcDetails.Configuration?.Runtime || 'unknown';

          functions.push({
            arn: resource.ResourceARN!,
            name: functionName,
            runtime,
            isOutdated: this.isRuntimeOutdated(runtime),
          });
        } catch (error) {
          // Skip functions we can't access
          console.warn(
            `Failed to get details for function ${functionName}:`,
            error
          );
        }
      }
    }

    return functions;
  }

  /**
   * Check if a runtime is outdated (older than Node.js 20)
   *
   * @param runtime Runtime string (e.g., "nodejs18.x")
   * @returns true if runtime is outdated
   */
  private isRuntimeOutdated(runtime: string): boolean {
    if (!runtime || !runtime.startsWith('nodejs')) {
      return false;
    }

    const match = runtime.match(/\d+/);
    if (!match) return false;

    const version = parseInt(match[0]);
    return version < 20; // nodejs20.x is current target
  }
}

