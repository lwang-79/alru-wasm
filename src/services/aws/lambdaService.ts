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
import { AmplifyService } from './amplifyService';

/**
 * Lambda Function type
 */
export interface LambdaFunction {
  arn: string;
  name: string;
  runtime: string;
  isOutdated: boolean;
  isAutoManaged: boolean;
}

/**
 * Resource tag type
 */
interface ResourceTag {
  Key?: string;
  Value?: string;
}

/**
 * Lambda Service
 * AWS Lambda SDK operations
 * Ports logic from lambda.rs with all 3 fallback strategies
 */
export class LambdaService {
  private credentialService = new CredentialService();
  private amplifyService = new AmplifyService();

  /**
   * Get Lambda functions associated with an Amplify app and branch
   * Uses 3 fallback strategies:
   * 1. Gen2 tags (amplify:app-id and amplify:branch-name)
   * 2. Gen1 tags (user:Application and user:Stack)
   * 3. Name pattern matching
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param backendEnvironmentName Backend environment name
   * @param repoName Repository name (for determining auto-managed status)
   * @returns Array of Lambda functions
   */
  async getLambdaFunctions(
    region: string,
    appId: string,
    branchName: string,
    backendEnvironmentName: string,
    repoName?: string
  ): Promise<LambdaFunction[]> {
    const creds = this.credentialService.getAWSSDKCredentials();
    if (!creds) {
      throw new Error('No AWS credentials configured');
    }

    const tagClient = new ResourceGroupsTaggingAPIClient({
      region,
      credentials: creds,
    });
    const lambdaClient = new LambdaClient({ region, credentials: creds });

    // Get app name for Gen1 fallback
    const app = await this.amplifyService.getApp(region, appId);
    const appName = app.name;

    // Strategy 1: Gen2 tags (amplify:app-id and amplify:branch-name)
    try {
      const gen2Response = await tagClient.send(
        new GetResourcesCommand({
          ResourceTypeFilters: ['lambda:function'],
          TagFilters: [
            { Key: 'amplify:app-id', Values: [appId] },
            { Key: 'amplify:branch-name', Values: [branchName] },
          ],
        })
      );

      if (gen2Response.ResourceTagMappingList && gen2Response.ResourceTagMappingList.length > 0) {
        return await this.getFunctionDetailsFromArns(
          gen2Response.ResourceTagMappingList,
          lambdaClient,
          repoName || ''
        );
      }
    } catch (error) {
      console.warn('Strategy 1 (Gen2 tags) failed:', error);
    }

    // Strategy 2: Gen1 tags (user:Application and user:Stack)
    try {
      const gen1Response = await tagClient.send(
        new GetResourcesCommand({
          ResourceTypeFilters: ['lambda:function'],
          TagFilters: [
            { Key: 'user:Application', Values: [appName] },
            { Key: 'user:Stack', Values: [backendEnvironmentName] },
          ],
        })
      );

      if (gen1Response.ResourceTagMappingList && gen1Response.ResourceTagMappingList.length > 0) {
        return await this.getFunctionDetailsFromArns(
          gen1Response.ResourceTagMappingList,
          lambdaClient,
          repoName || ''
        );
      }
    } catch (error) {
      console.warn('Strategy 2 (Gen1 tags) failed:', error);
    }

    // Strategy 3: Name pattern matching (final fallback)
    try {
      return await this.getLambdaFunctionsByNamePattern(
        lambdaClient,
        appId,
        branchName,
        repoName || ''
      );
    } catch (error) {
      console.warn('Strategy 3 (name pattern) failed:', error);
      return [];
    }
  }

  /**
   * Get function details from ARNs
   */
  private async getFunctionDetailsFromArns(
    resourceList: any[],
    lambdaClient: LambdaClient,
    repoName: string
  ): Promise<LambdaFunction[]> {
    const functions: LambdaFunction[] = [];

    for (const resource of resourceList) {
      const functionName = resource.ResourceARN?.split(':function:')[1];
      if (!functionName) continue;

      try {
        const funcDetails = await lambdaClient.send(
          new GetFunctionCommand({ FunctionName: functionName })
        );

        const runtime = funcDetails.Configuration?.Runtime || 'unknown';
        const tags = resource.Tags || [];
        const isAutoManaged = this.isAutoManagedFunction(tags, repoName);

        functions.push({
          arn: resource.ResourceARN!,
          name: functionName,
          runtime,
          isOutdated: this.isRuntimeOutdated(runtime),
          isAutoManaged,
        });
      } catch (error) {
        console.warn(`Failed to get details for function ${functionName}:`, error);
      }
    }

    return functions;
  }

  /**
   * Get Lambda functions by name pattern (Strategy 3 fallback)
   * Lists all functions and filters by naming convention
   */
  private async getLambdaFunctionsByNamePattern(
    lambdaClient: LambdaClient,
    appId: string,
    branchName: string,
    repoName: string
  ): Promise<LambdaFunction[]> {
    const functions: LambdaFunction[] = [];
    
    try {
      const listResponse = await lambdaClient.send(new ListFunctionsCommand({}));
      
      if (!listResponse.Functions) {
        return functions;
      }

      // Filter functions by name pattern: should contain appId or branchName
      const pattern = new RegExp(`(${appId}|${branchName})`, 'i');
      
      for (const func of listResponse.Functions) {
        if (!func.FunctionName || !pattern.test(func.FunctionName)) {
          continue;
        }

        const runtime = func.Runtime || 'unknown';
        
        functions.push({
          arn: func.FunctionArn || '',
          name: func.FunctionName,
          runtime,
          isOutdated: this.isRuntimeOutdated(runtime),
          isAutoManaged: false, // Can't determine without tags
        });
      }
    } catch (error) {
      console.warn('Failed to list functions by name pattern:', error);
    }

    return functions;
  }

  /**
   * Determine if a Lambda function is auto-managed by Amplify
   * Logic ported from alru Rust backend (lambda.rs:132-152)
   * 
   * - For Gen2: Check "amplify:friendly-name" tag
   *   - If friendly-name contains repository name (case-insensitive), it's auto-managed
   * - For Gen1: If "amplify:friendly-name" doesn't exist, check "aws:cloudformation:logical-id"
   *   - If logical-id is NOT "LambdaFunction", it's auto-managed
   * 
   * @param tags Resource tags
   * @param repoName Repository name
   * @returns true if function is auto-managed
   */
  private isAutoManagedFunction(tags: ResourceTag[], repoName: string): boolean {
    // First check for amplify:friendly-name tag (Gen2)
    const friendlyName = tags.find(t => t.Key === 'amplify:friendly-name');
    if (friendlyName?.Value) {
      // If friendly-name contains repository name (case-insensitive), it's auto-managed
      return friendlyName.Value.toLowerCase().includes(repoName.toLowerCase());
    }

    // Fallback: check aws:cloudformation:logical-id (Gen1)
    const logicalId = tags.find(t => t.Key === 'aws:cloudformation:logical-id');
    if (logicalId?.Value) {
      // If logical-id is NOT "LambdaFunction", it's auto-managed
      return logicalId.Value !== 'LambdaFunction';
    }

    // Default: assume not auto-managed
    return false;
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

