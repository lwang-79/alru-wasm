import {
  AmplifyClient,
  ListAppsCommand,
  ListBranchesCommand,
  GetAppCommand,
  GetBranchCommand,
  UpdateAppCommand,
  UpdateBranchCommand,
  ListJobsCommand,
  GetJobCommand,
  StartJobCommand,
  CreateBranchCommand,
  DeleteBranchCommand,
  type App,
  type Branch,
  type JobSummary,
  type Job,
} from "@aws-sdk/client-amplify";
import { CredentialService } from "./credentialService";

/**
 * Amplify App type
 */
export interface AmplifyApp {
  appId: string;
  name: string;
  repository: string;
  environmentVariables: Record<string, string>;
}

/**
 * Amplify Branch type
 */
export interface AmplifyBranch {
  branchName: string;
  backendEnvironmentArn: string;
  environmentVariables: Record<string, string>;
}

/**
 * Amplify Job type
 */
export interface AmplifyJob {
  jobId: string;
  status: string;
  commitId: string;
  commitMessage: string;
}

/**
 * Amplify Job Details type
 */
export interface AmplifyJobDetails {
  jobId: string;
  status: string;
  commitId: string;
  commitMessage: string;
  startTime?: Date;
  endTime?: Date;
  summary: Record<string, string>;
}

/**
 * Amplify Service
 * AWS Amplify SDK operations
 * Ports logic from aws_cli.rs
 */
export class AmplifyService {
  private credentialService = new CredentialService();

  /**
   * Get Amplify client for a specific region
   */
  private getClient(region: string): AmplifyClient {
    const creds = this.credentialService.getAWSSDKCredentials();
    if (!creds) {
      throw new Error("No AWS credentials configured");
    }

    return new AmplifyClient({
      region,
      credentials: creds,
    });
  }

  /**
   * List all Amplify apps in a region
   * Ported from aws_cli.rs:150-200 (list_amplify_apps)
   *
   * @param region AWS region
   * @returns Array of Amplify apps
   */
  async listApps(region: string): Promise<AmplifyApp[]> {
    const client = this.getClient(region);
    const apps: AmplifyApp[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new ListAppsCommand({
          nextToken,
          maxResults: 50,
        }),
      );

      if (response.apps) {
        apps.push(
          ...response.apps.map((app) => ({
            appId: app.appId!,
            name: app.name!,
            repository: app.repository || "",
            environmentVariables: app.environmentVariables || {},
          })),
        );
      }

      nextToken = response.nextToken;
    } while (nextToken);

    return apps;
  }

  /**
   * List branches for an Amplify app
   * Ported from aws_cli.rs:220-270 (list_amplify_branches)
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @returns Array of branches
   */
  async listBranches(region: string, appId: string): Promise<AmplifyBranch[]> {
    const client = this.getClient(region);
    const branches: AmplifyBranch[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new ListBranchesCommand({
          appId,
          nextToken,
          maxResults: 50,
        }),
      );

      if (response.branches) {
        branches.push(
          ...response.branches.map((branch) => ({
            branchName: branch.branchName!,
            backendEnvironmentArn: branch.backendEnvironmentArn || "",
            environmentVariables: branch.environmentVariables || {},
          })),
        );
      }

      nextToken = response.nextToken;
    } while (nextToken);

    return branches;
  }

  /**
   * Get app details
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @returns App details
   */
  async getApp(region: string, appId: string): Promise<AmplifyApp> {
    const client = this.getClient(region);
    const response = await client.send(new GetAppCommand({ appId }));

    if (!response.app) {
      throw new Error(`App ${appId} not found`);
    }

    return {
      appId: response.app.appId!,
      name: response.app.name!,
      repository: response.app.repository || "",
      environmentVariables: response.app.environmentVariables || {},
    };
  }

  /**
   * Get branch details
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @returns Branch details
   */
  async getBranch(
    region: string,
    appId: string,
    branchName: string,
  ): Promise<AmplifyBranch> {
    const client = this.getClient(region);
    const response = await client.send(
      new GetBranchCommand({ appId, branchName }),
    );

    if (!response.branch) {
      throw new Error(`Branch ${branchName} not found`);
    }

    return {
      branchName: response.branch.branchName!,
      backendEnvironmentArn: response.branch.backendEnvironmentArn || "",
      environmentVariables: response.branch.environmentVariables || {},
    };
  }

  /**
   * Update app environment variables
   * AWS requires { " ": "" } for empty env vars
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param envVars Environment variables to set
   */
  async updateAppEnvironmentVariables(
    region: string,
    appId: string,
    envVars: Record<string, string>,
  ): Promise<void> {
    const client = this.getClient(region);

    // AWS requires { " ": "" } for empty env vars
    const vars = Object.keys(envVars).length === 0 ? { " ": "" } : envVars;

    await client.send(
      new UpdateAppCommand({
        appId,
        environmentVariables: vars,
      }),
    );
  }

  /**
   * Update branch environment variables
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param envVars Environment variables to set
   */
  async updateBranchEnvironmentVariables(
    region: string,
    appId: string,
    branchName: string,
    envVars: Record<string, string>,
  ): Promise<void> {
    const client = this.getClient(region);

    const vars = Object.keys(envVars).length === 0 ? { " ": "" } : envVars;

    await client.send(
      new UpdateBranchCommand({
        appId,
        branchName,
        environmentVariables: vars,
      }),
    );
  }

  /**
   * Remove legacy _CUSTOM_IMAGE environment variable if it starts with "amplify:"
   * Ported from aws_cli.rs:390-644 (update_custom_image_env_var)
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @returns Object with updated flag and list of changes
   */
  async removeCustomImageIfLegacy(
    region: string,
    appId: string,
    branchName: string,
  ): Promise<{ updated: boolean; changes: string[] }> {
    const changes: string[] = [];
    let updated = false;

    // Fetch latest CLI version for _LIVE_UPDATES check
    const latestCliVersion = await this.fetchLatestAmplifyCliVersion();

    // Check app-level
    const app = await this.getApp(region, appId);
    let appNeedsUpdate = false;
    const updatedAppEnvVars = { ...app.environmentVariables };

    // Check _CUSTOM_IMAGE
    if (updatedAppEnvVars["_CUSTOM_IMAGE"]?.startsWith("amplify:")) {
      delete updatedAppEnvVars["_CUSTOM_IMAGE"];
      changes.push("App: Removed legacy _CUSTOM_IMAGE (now using default latest Amplify image)");
      appNeedsUpdate = true;
    }

    // Check AMPLIFY_BACKEND_PULL_ONLY
    if (updatedAppEnvVars["AMPLIFY_BACKEND_PULL_ONLY"] === "true") {
      updatedAppEnvVars["AMPLIFY_BACKEND_PULL_ONLY"] = "false";
      changes.push("App: AMPLIFY_BACKEND_PULL_ONLY → true to false");
      appNeedsUpdate = true;
    }

    // Check _LIVE_UPDATES
    if (updatedAppEnvVars["_LIVE_UPDATES"]) {
      const updateResult = this.updateLiveUpdatesIfNeeded(
        updatedAppEnvVars["_LIVE_UPDATES"],
        latestCliVersion
      );
      if (updateResult.updated) {
        updatedAppEnvVars["_LIVE_UPDATES"] = updateResult.value;
        changes.push(`App: _LIVE_UPDATES → @aws-amplify/cli version set to ${latestCliVersion}`);
        appNeedsUpdate = true;
      }
    }

    if (appNeedsUpdate) {
      await this.updateAppEnvironmentVariables(
        region,
        appId,
        updatedAppEnvVars,
      );
      updated = true;
    }

    // Check branch-level
    const branch = await this.getBranch(region, appId, branchName);
    let branchNeedsUpdate = false;
    const updatedBranchEnvVars = { ...branch.environmentVariables };

    // Check _CUSTOM_IMAGE
    if (updatedBranchEnvVars["_CUSTOM_IMAGE"]?.startsWith("amplify:")) {
      delete updatedBranchEnvVars["_CUSTOM_IMAGE"];
      changes.push(`Branch: Removed legacy _CUSTOM_IMAGE (now using default latest Amplify image)`);
      branchNeedsUpdate = true;
    }

    // Check AMPLIFY_BACKEND_PULL_ONLY
    if (updatedBranchEnvVars["AMPLIFY_BACKEND_PULL_ONLY"] === "true") {
      updatedBranchEnvVars["AMPLIFY_BACKEND_PULL_ONLY"] = "false";
      changes.push(`Branch: AMPLIFY_BACKEND_PULL_ONLY → true to false`);
      branchNeedsUpdate = true;
    }

    if (branchNeedsUpdate) {
      await this.updateBranchEnvironmentVariables(
        region,
        appId,
        branchName,
        updatedBranchEnvVars,
      );
      updated = true;
    }

    return { updated, changes };
  }

  /**
   * Remove only _CUSTOM_IMAGE (Gen2 apps)
   */
  async removeCustomImageOnly(
    region: string,
    appId: string,
    branchName: string,
  ): Promise<{ updated: boolean; changes: string[] }> {
    const changes: string[] = [];
    let updated = false;

    // Check app-level
    const app = await this.getApp(region, appId);
    if (app.environmentVariables["_CUSTOM_IMAGE"]?.startsWith("amplify:")) {
      const updatedEnvVars = { ...app.environmentVariables };
      delete updatedEnvVars["_CUSTOM_IMAGE"];
      await this.updateAppEnvironmentVariables(region, appId, updatedEnvVars);
      changes.push("App: Removed legacy _CUSTOM_IMAGE (now using default latest Amplify image)");
      updated = true;
    }

    // Check branch-level
    const branch = await this.getBranch(region, appId, branchName);
    if (branch.environmentVariables["_CUSTOM_IMAGE"]?.startsWith("amplify:")) {
      const updatedEnvVars = { ...branch.environmentVariables };
      delete updatedEnvVars["_CUSTOM_IMAGE"];
      await this.updateBranchEnvironmentVariables(region, appId, branchName, updatedEnvVars);
      changes.push("Branch: Removed legacy _CUSTOM_IMAGE (now using default latest Amplify image)");
      updated = true;
    }

    return { updated, changes };
  }

  /**
   * Fetch latest @aws-amplify/cli version from npm registry
   */
  private async fetchLatestAmplifyCliVersion(): Promise<string> {
    try {
      const response = await fetch('https://registry.npmjs.org/@aws-amplify/cli/latest');
      const data = await response.json();
      return data.version;
    } catch (error) {
      console.warn('Failed to fetch latest CLI version:', error);
      return 'latest';
    }
  }

  /**
   * Update _LIVE_UPDATES if CLI version is outdated
   */
  private updateLiveUpdatesIfNeeded(
    liveUpdatesJson: string,
    latestVersion: string
  ): { updated: boolean; value: string } {
    try {
      const entries = JSON.parse(liveUpdatesJson) as Array<{ pkg: string; version: string }>;
      const cliEntry = entries.find(e => e.pkg === '@aws-amplify/cli');

      if (!cliEntry) {
        return { updated: false, value: liveUpdatesJson };
      }

      if (cliEntry.version === 'latest' || cliEntry.version === latestVersion) {
        return { updated: false, value: liveUpdatesJson };
      }

      // Update version
      cliEntry.version = latestVersion;
      return { updated: true, value: JSON.stringify(entries) };
    } catch (error) {
      console.warn('Failed to parse _LIVE_UPDATES:', error);
      return { updated: false, value: liveUpdatesJson };
    }
  }

  /**
   * List jobs for a branch
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param commitId Optional commit ID to filter by
   * @returns Array of jobs
   */
  async listJobs(
    region: string,
    appId: string,
    branchName: string,
    commitId?: string,
  ): Promise<AmplifyJob[]> {
    const client = this.getClient(region);
    const jobs: AmplifyJob[] = [];
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new ListJobsCommand({
          appId,
          branchName,
          nextToken,
          maxResults: 50,
        }),
      );

      if (response.jobSummaries) {
        const filteredJobs = commitId
          ? response.jobSummaries.filter((job) => job.commitId === commitId)
          : response.jobSummaries;

        jobs.push(
          ...filteredJobs.map((job) => ({
            jobId: job.jobId!,
            status: job.status!,
            commitId: job.commitId || "",
            commitMessage: job.commitMessage || "",
          })),
        );
      }

      nextToken = response.nextToken;
    } while (nextToken);

    return jobs;
  }

  /**
   * Get job details
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param jobId Job ID
   * @returns Job details
   */
  async getJob(
    region: string,
    appId: string,
    branchName: string,
    jobId: string,
  ): Promise<AmplifyJobDetails> {
    const client = this.getClient(region);
    const response = await client.send(
      new GetJobCommand({
        appId,
        branchName,
        jobId,
      }),
    );

    if (!response.job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const job = response.job;

    return {
      jobId: job.summary?.jobId || "",
      status: job.summary?.status || "PENDING",
      commitId: job.summary?.commitId || "",
      commitMessage: job.summary?.commitMessage || "",
      startTime: job.summary?.startTime,
      endTime: job.summary?.endTime,
      summary: (job.summary as unknown) as Record<string, string>,
    };
  }

  /**
   * Start a new job for a branch
   * Supports RETRY, RELEASE, MANUAL, and WEB_HOOK job types
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param jobType Job type (RETRY, RELEASE, MANUAL, WEB_HOOK)
   * @param jobId Optional job ID (required for RETRY)
   * @param commitId Optional commit ID
   * @param commitMessage Optional commit message
   * @returns Job details for the started job
   */
  async startJob(
    region: string,
    appId: string,
    branchName: string,
    jobType: "RETRY" | "RELEASE" | "MANUAL" | "WEB_HOOK",
    jobId?: string,
    commitId?: string,
    commitMessage?: string,
  ): Promise<AmplifyJobDetails> {
    const client = this.getClient(region);

    const response = await client.send(
      new StartJobCommand({
        appId,
        branchName,
        jobType,
        jobId,
        commitId,
        commitMessage,
      }),
    );

    if (!response.jobSummary) {
      throw new Error("Failed to start job - no job summary returned");
    }

    const job = response.jobSummary;

    return {
      jobId: job.jobId!,
      status: job.status!,
      commitId: job.commitId || "",
      commitMessage: job.commitMessage || "",
      startTime: job.startTime,
      endTime: job.endTime,
      summary: (job as unknown) as Record<string, string>,
    };
  }

  /**
   * Revert build spec to original
   * Updates the app's build spec in AWS Amplify
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param originalBuildSpec Original build spec YAML string
   */
  async revertBuildSpec(
    region: string,
    appId: string,
    originalBuildSpec: string,
  ): Promise<void> {
    const client = this.getClient(region);

    await client.send(
      new UpdateAppCommand({
        appId,
        buildSpec: originalBuildSpec,
      }),
    );
  }

  /**
   * Create a new branch in Amplify app
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   * @param description Optional description
   */
  async createBranch(
    region: string,
    appId: string,
    branchName: string,
    description?: string,
  ): Promise<void> {
    const client = this.getClient(region);

    await client.send(
      new CreateBranchCommand({
        appId,
        branchName,
        description,
        enableAutoBuild: true,
      }),
    );
  }

  /**
   * Delete a branch in Amplify app
   *
   * @param region AWS region
   * @param appId Amplify app ID
   * @param branchName Branch name
   */
  async deleteBranch(
    region: string,
    appId: string,
    branchName: string,
  ): Promise<void> {
    const client = this.getClient(region);

    await client.send(
      new DeleteBranchCommand({
        appId,
        branchName,
      }),
    );
  }
}
