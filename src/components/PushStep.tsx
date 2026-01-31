import { createSignal, Show, For, onCleanup, onMount } from "solid-js";
import type { AmplifyJobDetails } from "../services/aws/amplifyService";
import {
  appState,
  setAppState,
  checkAndResetPushStepIfNeeded,
  updatePushStepContext,
} from "../store/appStore";
import { WebContainerService } from "../services/container/webContainerService";
import { GitService, type GitCredentials } from "../services/git/gitService";
import { AmplifyService } from "../services/aws/amplifyService";
import { CredentialService } from "../services/aws/credentialService";
import { WizardStep } from "./common/WizardStep";
import { OperationCard } from "./common/OperationCard";
import type { OperationStatus } from "./common/OperationCard";
import { OperationFeedback } from "./common/OperationFeedback";
import { DeploymentJobCard } from "./common/DeploymentJobCard";
import "./shared-tailwind.css";

interface PushStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

export function PushStep(props: PushStepProps) {
  // Use store state for persistence
  const pushStatus = () => appState.pushStep.status;
  const setPushStatus = (status: typeof appState.pushStep.status) =>
    setAppState("pushStep", "status", status);

  const deploymentMode = () => appState.pushStep.deploymentMode;
  const setDeploymentMode = (mode: "current" | "test") => {
    setAppState("pushStep", "deploymentMode", mode);
    // Reset push status when changing mode
    if (pushStatus() !== "pending") {
      setPushStatus("pending");
      setPushError(null);
      setCommitHash(null);
      setTargetBranch(null);
      setDeploymentJob({ job: null, scenario: null, checkError: null });
      setPostTestSelection(null);
      setManagementStatus(null);

      // Clear any active polling intervals
      if (jobCheckInterval !== null) {
        clearInterval(jobCheckInterval);
        jobCheckInterval = null;
      }
    }
  };

  const pushError = () => appState.pushStep.error;
  const setPushError = (error: string | null) =>
    setAppState("pushStep", "error", error);

  const commitHash = () => appState.pushStep.commitHash;
  const setCommitHash = (hash: string | null) =>
    setAppState("pushStep", "commitHash", hash);

  const targetBranch = () => appState.pushStep.targetBranch;
  const setTargetBranch = (branch: string | null) =>
    setAppState("pushStep", "targetBranch", branch);

  const deploymentJob = () => appState.pushStep.deploymentJob;
  const setDeploymentJob = (state: {
    job: AmplifyJobDetails | null;
    scenario: DeploymentScenario | null;
    checkError: string | null;
  }) => setAppState("pushStep", "deploymentJob", state);

  const postTestSelection = () => appState.pushStep.postTestSelection;
  const setPostTestSelection = (selection: "push" | "manual" | null) =>
    setAppState("pushStep", "postTestSelection", selection);

  const lastFailedJob = () => appState.pushStep.lastFailedJob;
  const setLastFailedJob = (job: AmplifyJobDetails | null) =>
    setAppState("pushStep", "lastFailedJob", job);

  const step4Job = () => appState.pushStep.step4Job;
  const setStep4Job = (state: {
    job: AmplifyJobDetails | null;
    checkError: string | null;
  }) => setAppState("pushStep", "step4Job", state);

  const step4LastFailedJob = () => appState.pushStep.step4LastFailedJob;
  const setStep4LastFailedJob = (job: AmplifyJobDetails | null) =>
    setAppState("pushStep", "step4LastFailedJob", job);

  const retryingJob = () => appState.pushStep.retryingJob;
  const setRetryingJob = (retrying: boolean) =>
    setAppState("pushStep", "retryingJob", retrying);

  // Local signals
  const [checkingForJob, setCheckingForJob] = createSignal(false);
  const [managementStatus, setManagementStatus] = createSignal<string | null>(
    null,
  );
  const [managementLoading, setManagementLoading] = createSignal(false);
  const [cleanupStatus, setCleanupStatus] = createSignal<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = createSignal(false);
  const [showCleanupDialog, setShowCleanupDialog] = createSignal(false);
  const [gitCredentials, setGitCredentials] =
    createSignal<GitCredentials | null>(null);

  let jobCheckInterval: number | null = null;

  // Check if state should be reset on mount
  onMount(() => {
    checkAndResetPushStepIfNeeded();
    updatePushStepContext();

    // Default to test branch if not set
    if (!deploymentMode()) {
      setDeploymentMode("test");
    }
  });

  // Cleanup interval on unmount
  onCleanup(() => {
    if (jobCheckInterval !== null) {
      clearInterval(jobCheckInterval);
    }
  });

  // Deployment scenario types
  type DeploymentScenario = "test-branch" | "current-branch";

  // Deployment result interface
  interface DeploymentResult {
    success: boolean;
    commitHash: string | null;
    error: string | null;
    noChanges: boolean;
  }

  // Job check result interface
  interface JobCheckResult {
    job: AmplifyJobDetails | null;
    error: string | null;
  }

  // Shared deployment handler function
  const handleDeploy = async (
    scenario: DeploymentScenario,
    targetBranch: string,
  ): Promise<DeploymentResult> => {
    const clonePath = appState.repository.clonePath;

    if (!clonePath) {
      return {
        success: false,
        commitHash: null,
        error: "No repository path found",
        noChanges: false,
      };
    }

    try {
      const container = await WebContainerService.getInstance();
      const gitService = new GitService(container);

      // Get credentials
      let creds = gitCredentials();
      if (!creds) {
        creds = await getStoredGitCredentials();
        if (creds) {
          setGitCredentials(creds);
        }
      }

      if (!creds) {
        try {
          creds = await promptForGitCredentials();
          setGitCredentials(creds);
        } catch (e) {
          return {
            success: false,
            commitHash: null,
            error: String(e),
            noChanges: false,
          };
        }
      }

      if (!creds || !creds.username || !creds.password) {
        return {
          success: false,
          commitHash: null,
          error: "Invalid Git credentials",
          noChanges: false,
        };
      }

      const currentBranch =
        appState.amplifyResources.selectedBranch?.branch_name;

      // Handle branch operations based on scenario
      if (scenario === "test-branch" && currentBranch) {
        // Create test branch with timestamp
        const credsDetails = new CredentialService().getCredentials();
        const username = credsDetails?.git?.username || "user";
        const timestamp = Math.floor(Date.now() / 1000);
        const testBranch = `test-${username}-${timestamp}`;

        await gitService.createBranch(clonePath, testBranch);
        await gitService.checkout(clonePath, testBranch);
        targetBranch = testBranch;
      }

      // Generate commit message based on scenario
      const targetRuntime = appState.runtimeInfo.targetRuntime;
      const backendType = appState.repository.backendType;
      const commitMessage = `chore: Update Lambda runtime to ${targetRuntime}

- Updated ${backendType} backend runtime configurations
- Upgraded Amplify packages to latest versions
${appState.repository.changes.length > 0 ? `- Modified ${appState.repository.changes.length} file(s)` : ""}

This update ensures Lambda functions use supported Node.js runtimes.`;

      // Check for changes
      const changedFiles = await gitService.getChangedFiles(clonePath);

      if (changedFiles.length === 0) {
        // No changes to commit

        // For test branch, still push the branch ref
        if (scenario === "test-branch" && targetBranch !== currentBranch) {
          try {
            await gitService.push(
              clonePath,
              creds,
              (message: string) => {
                console.log(`[Git Progress] ${message}`);
              },
              targetBranch,
            );
            const hash = await gitService.getCurrentCommit(clonePath);

            return {
              success: true,
              commitHash: hash,
              error: null,
              noChanges: false,
            };
          } catch (pushError) {
            console.warn("Failed to push test branch ref:", pushError);
            return {
              success: false,
              commitHash: null,
              error: String(pushError),
              noChanges: false,
            };
          }
        }

        // For current branch, return no changes
        return {
          success: true,
          commitHash: null,
          error: null,
          noChanges: true,
        };
      }

      // Commit and push changes
      const hash = await gitService.commitAndPush(
        clonePath,
        commitMessage,
        creds,
        (message: string) => {
          console.log(`[Git Progress] ${message}`);
        },
        targetBranch || undefined,
      );

      return {
        success: true,
        commitHash: hash,
        error: null,
        noChanges: false,
      };
    } catch (e) {
      const errorMessage = String(e);

      // Clear credentials on authentication failure
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("authentication failed")
      ) {
        setGitCredentials(null);
        return {
          success: false,
          commitHash: null,
          error: "Authentication failed. Please check your credentials.",
          noChanges: false,
        };
      }

      return {
        success: false,
        commitHash: null,
        error: errorMessage,
        noChanges: false,
      };
    }
  };

  // Get stored Git credentials
  const getStoredGitCredentials = async (): Promise<GitCredentials | null> => {
    try {
      const credentialService = new CredentialService();
      const storedCreds = credentialService.getGitCredentials();

      if (storedCreds && storedCreds.username && storedCreds.token) {
        return {
          username: storedCreds.username,
          password: storedCreds.token,
        };
      }
      return null;
    } catch (e) {
      console.error("Failed to load stored Git credentials:", e);
      return null;
    }
  };

  // Prompt for Git credentials as fallback
  const promptForGitCredentials = (): Promise<GitCredentials> => {
    return new Promise((resolve, reject) => {
      const username = prompt("GitHub username:");
      if (!username) {
        reject(new Error("GitHub username is required"));
        return;
      }

      const password = prompt("Personal Access Token:");
      if (!password) {
        reject(new Error("Personal Access Token is required"));
        return;
      }

      resolve({ username, password });
    });
  };

  // Unified job checking function
  const checkForJob = async (
    commitId: string,
    branchName: string,
    scenario: DeploymentScenario,
  ): Promise<JobCheckResult> => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !region) {
      return {
        job: null,
        error: "Missing AWS configuration",
      };
    }

    const isTestBranch =
      scenario === "test-branch" && branchName !== selectedBranch?.branch_name;

    // For test branches, create the branch in Amplify if it doesn't exist
    if (isTestBranch) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const amplifyService = new AmplifyService();

      try {
        const branches = await amplifyService.listBranches(
          region,
          selectedApp.app_id,
        );
        const branchExists = branches.some((b) => b.branchName === branchName);

        if (!branchExists) {
          await amplifyService.createBranch(
            region,
            selectedApp.app_id,
            branchName,
            `Test branch created on ${new Date().toLocaleString()}`,
          );

          try {
            await amplifyService.startJob(
              region,
              selectedApp.app_id,
              branchName,
              "RELEASE",
            );
          } catch (startJobError) {
            console.warn("Failed to manually start job:", startJobError);
          }

          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (branchError) {
        console.error("Error verifying/connecting branch:", branchError);
      }
    }

    // Retry logic with 3 attempts and increasing delays
    const maxRetries = 3;
    const retryDelays = [5000, 10000, 15000];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const currentDelay = retryDelays[attempt - 1];
        await new Promise((resolve) => setTimeout(resolve, currentDelay));

        const amplifyService = new AmplifyService();
        const jobs = await amplifyService.listJobs(
          region,
          selectedApp.app_id,
          branchName,
        );

        const job =
          jobs.find((j) => j.commitId === commitId) ||
          jobs.find((j) => j.commitId === "HEAD") ||
          (isTestBranch ? jobs[0] : null);

        if (job) {
          const jobDetails = await amplifyService.getJob(
            region,
            selectedApp.app_id,
            branchName,
            job.jobId,
          );

          return {
            job: jobDetails,
            error: null,
          };
        } else {
          if (attempt === maxRetries) {
            return {
              job: null,
              error: "No Amplify job found for this commit",
            };
          }
        }
      } catch (e) {
        if (attempt === maxRetries) {
          return {
            job: null,
            error: String(e),
          };
        }
      }
    }

    return {
      job: null,
      error: "Failed to check for job after retries",
    };
  };

  // Unified job polling function
  const startJobPolling = (
    jobId: string,
    branchName: string,
    onUpdate: (job: AmplifyJobDetails) => void,
  ): (() => void) => {
    const pollInterval = window.setInterval(async () => {
      const selectedApp = appState.amplifyResources.selectedApp;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !region) {
        return;
      }

      try {
        const amplifyService = new AmplifyService();
        const jobDetails = await amplifyService.getJob(
          region,
          selectedApp.app_id,
          branchName,
          jobId,
        );

        onUpdate(jobDetails);

        // Stop polling if job is in terminal state
        if (["SUCCEED", "FAILED", "CANCELLED"].includes(jobDetails.status)) {
          clearInterval(pollInterval);
        }
      } catch (e) {
        console.error("Failed to update job status:", e);
      }
    }, 10000);

    // Return cleanup function
    return () => {
      clearInterval(pollInterval);
    };
  };

  // Unified retry handler function
  const handleJobRetry = async (
    jobId: string,
    branchName: string,
    onUpdate: (job: AmplifyJobDetails) => void,
    onError: (error: string) => void,
  ): Promise<void> => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !region) {
      onError("Missing AWS configuration");
      return;
    }

    try {
      const amplifyService = new AmplifyService();

      // Start a RETRY job in AWS Amplify
      const newJob = await amplifyService.startJob(
        region,
        selectedApp.app_id,
        branchName,
        "RETRY",
        jobId,
      );

      onUpdate(newJob);

      // Start polling the new job
      startJobPolling(newJob.jobId, branchName, onUpdate);
    } catch (e) {
      console.error("Failed to retry job:", e);
      onError(`Failed to retry job: ${String(e)}`);
    }
  };

  // Format date for display
  const formatLocalDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  // Get AWS Console URL for job monitoring
  const getJobConsoleUrl = (branchOverride?: string) => {
    const region = appState.awsConfig.selectedRegion;
    const appId = appState.amplifyResources.selectedApp?.app_id;
    const branch =
      branchOverride ||
      targetBranch() ||
      appState.amplifyResources.selectedBranch?.branch_name;

    if (!region || !appId || !branch) return null;

    return `https://${region}.console.aws.amazon.com/amplify/apps/${appId}/branches/${branch}/deployments`;
  };

  // Handle push operation
  const handlePush = async () => {
    const currentBranch = appState.amplifyResources.selectedBranch?.branch_name;

    if (!currentBranch) {
      setPushError("No branch selected");
      setPushStatus("failed");
      return;
    }

    setPushStatus("running");
    setPushError(null);
    setCommitHash(null);

    // Determine scenario based on deployment mode
    const scenario: DeploymentScenario =
      deploymentMode() === "test" ? "test-branch" : "current-branch";

    // Determine target branch
    let targetBranchName = currentBranch;
    if (scenario === "test-branch") {
      const credsDetails = new CredentialService().getCredentials();
      const username = credsDetails?.git?.username || "user";
      const timestamp = Math.floor(Date.now() / 1000);
      targetBranchName = `test-${username}-${timestamp}`;
    }

    setTargetBranch(targetBranchName);

    try {
      // Call shared deployment handler
      const result = await handleDeploy(scenario, targetBranchName);

      if (!result.success) {
        setPushError(result.error);
        setPushStatus("failed");
        return;
      }

      // Handle no changes case
      if (result.noChanges) {
        setCommitHash(null);
        setPushStatus("success");

        // For current-branch scenario, check last job status
        if (scenario === "current-branch") {
          // Use targetBranchName which is guaranteed to be set
          const branchToCheck = targetBranchName || currentBranch;

          if (branchToCheck) {
            await checkLastJobStatus(branchToCheck, (job) => {
              setLastFailedJob(job);
            });
          }
        }
        return;
      }

      // Handle successful deployment with changes
      setCommitHash(result.commitHash);
      setPushStatus("success");

      // Check for Amplify job using shared function
      if (result.commitHash) {
        setCheckingForJob(true);
        setDeploymentJob({
          job: null,
          scenario: scenario,
          checkError: null,
        });

        const jobResult = await checkForJob(
          result.commitHash,
          targetBranchName,
          scenario,
        );

        setCheckingForJob(false);

        if (jobResult.error) {
          setDeploymentJob({
            job: null,
            scenario: scenario,
            checkError: jobResult.error,
          });
        } else if (jobResult.job) {
          setDeploymentJob({
            job: jobResult.job,
            scenario: scenario,
            checkError: null,
          });

          // Start polling using shared function
          startJobPolling(jobResult.job.jobId, targetBranchName, (job) => {
            setDeploymentJob({
              job: job,
              scenario: scenario,
              checkError: null,
            });
          });
        }
      }
    } catch (e) {
      const errorMessage = String(e);
      setPushError(errorMessage);
      setPushStatus("failed");
    }
  };

  // Check the last job status to see if we should offer a retry
  // This is used by step 2 (current branch mode)
  const checkLastJobStatus = async (
    branchName: string,
    onJobFound: (job: AmplifyJobDetails) => void,
  ) => {
    await checkLastJobStatusInternal(
      branchName,
      onJobFound,
      (job) =>
        setDeploymentJob({ job, scenario: "current-branch", checkError: null }),
      (job) =>
        setDeploymentJob({ job, scenario: "current-branch", checkError: null }),
    );
  };

  // Check the last job status for step 4
  const checkLastJobStatusForStep4 = async (
    branchName: string,
    onJobFound: (job: AmplifyJobDetails) => void,
  ) => {
    await checkLastJobStatusInternal(
      branchName,
      onJobFound,
      (job) => setStep4Job({ job, checkError: null }),
      (job) => setStep4Job({ job, checkError: null }),
    );
  };

  // Internal implementation of job status checking
  const checkLastJobStatusInternal = async (
    branchName: string,
    onJobFound: (job: AmplifyJobDetails) => void,
    setJobState: (job: AmplifyJobDetails) => void,
    updateJobState: (job: AmplifyJobDetails) => void,
  ) => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const region = appState.awsConfig.selectedRegion;

    // Check for undefined, null, or empty string
    if (!selectedApp || !region || !branchName || branchName.trim() === "") {
      console.error("Missing or invalid required parameters:", {
        selectedApp: !!selectedApp,
        region: !!region,
        branchName: branchName,
        branchNameValid: branchName && branchName.trim() !== "",
      });
      return;
    }

    try {
      const amplifyService = new AmplifyService();
      const jobs = await amplifyService.listJobs(
        region,
        selectedApp.app_id,
        branchName,
      );

      if (jobs.length > 0) {
        const latestJobId = jobs[0].jobId;
        const lastJob = await amplifyService.getJob(
          region,
          selectedApp.app_id,
          branchName,
          latestJobId,
        );

        // Set job state using the provided callback
        setJobState(lastJob);

        // If job is running, start polling for updates
        if (lastJob.status === "RUNNING") {
          startJobPolling(lastJob.jobId, branchName, updateJobState);
        }

        // Call callback if job is FAILED or SUCCEED
        if (lastJob.status === "FAILED" || lastJob.status === "SUCCEED") {
          onJobFound(lastJob);
        }
      }
    } catch (e) {
      console.error("Failed to check last job status:", e);
    }
  };

  // Retry the last failed job
  const handleRetryJob = async () => {
    const lastJob = lastFailedJob();
    if (!lastJob) return;

    const selectedBranch = appState.amplifyResources.selectedBranch;
    if (!selectedBranch) return;

    setRetryingJob(true);
    setCheckingForJob(true); // Show "Starting..." message

    // Clear the job to show "Starting..." message
    setDeploymentJob({
      job: null,
      scenario: "current-branch",
      checkError: null,
    });

    try {
      const selectedApp = appState.amplifyResources.selectedApp;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !region) {
        setDeploymentJob({
          job: null,
          scenario: "current-branch",
          checkError: "Missing AWS configuration",
        });
        return;
      }

      const amplifyService = new AmplifyService();

      // Start a RETRY job in AWS Amplify
      const newJob = await amplifyService.startJob(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
        "RETRY",
        lastJob.jobId,
      );

      // Don't update the job immediately - let checkForJob handle it
      // This allows the "Starting..." message to show while waiting for the job

      // Wait a bit before checking for the job
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check for the job using the shared function
      const jobResult = await checkForJob(
        newJob.commitId || "HEAD",
        selectedBranch.branch_name,
        "current-branch",
      );

      setCheckingForJob(false);

      if (jobResult.error) {
        setDeploymentJob({
          job: null,
          scenario: "current-branch",
          checkError: jobResult.error,
        });
      } else if (jobResult.job) {
        setDeploymentJob({
          job: jobResult.job,
          scenario: "current-branch",
          checkError: null,
        });

        // Start polling the job
        startJobPolling(
          jobResult.job.jobId,
          selectedBranch.branch_name,
          (job) => {
            setDeploymentJob({
              job: job,
              scenario: "current-branch",
              checkError: null,
            });
          },
        );
      }

      setLastFailedJob(null);
    } catch (e) {
      console.error("Failed to retry job:", e);
      setCheckingForJob(false);
      setDeploymentJob({
        job: null,
        scenario: "current-branch",
        checkError: `Failed to retry job: ${String(e)}`,
      });
    } finally {
      setRetryingJob(false);
    }
  };

  // Retry the last failed job for current branch (step 4)
  const handleRetryJobForCurrent = async () => {
    const lastJob = step4LastFailedJob();
    if (!lastJob) {
      return;
    }

    const selectedBranch = appState.amplifyResources.selectedBranch;

    if (!selectedBranch) {
      return;
    }

    setRetryingJob(true);
    setManagementStatus("Starting deployment job...");

    // Clear the job to show "Starting..." message
    setStep4Job({
      job: null,
      checkError: null,
    });

    try {
      const selectedApp = appState.amplifyResources.selectedApp;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !region) {
        setManagementStatus("Error: Missing AWS configuration");
        return;
      }

      const amplifyService = new AmplifyService();

      // Start a RETRY job in AWS Amplify
      const newJob = await amplifyService.startJob(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
        "RETRY",
        lastJob.jobId,
      );

      // Don't update the job immediately - let checkForJob handle it
      // This allows the "Starting..." message to show while waiting for the job

      // Wait a bit before checking for the job
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check for the job using the shared function
      const jobResult = await checkForJob(
        newJob.commitId || "HEAD",
        selectedBranch.branch_name,
        "current-branch",
      );

      if (jobResult.error) {
        setStep4Job({
          job: null,
          checkError: jobResult.error,
        });
        setManagementStatus(`Error: ${jobResult.error}`);
      } else if (jobResult.job) {
        setStep4Job({
          job: jobResult.job,
          checkError: null,
        });

        // Start polling the job
        startJobPolling(
          jobResult.job.jobId,
          selectedBranch.branch_name,
          (job) => {
            setStep4Job({
              job: job,
              checkError: null,
            });
          },
        );

        setManagementStatus("Successfully started deployment job");
      }

      // Clear step4LastFailedJob after retry (like step 2 does)
      setStep4LastFailedJob(null);
    } catch (e) {
      console.error("Failed to retry job for current branch:", e);
      setManagementStatus(`Error: Failed to retry job: ${String(e)}`);
    } finally {
      setRetryingJob(false);
    }
  };

  // Handle push to current branch (merge test branch)
  const handlePushToCurrent = async () => {
    const currentBranch = appState.amplifyResources.selectedBranch?.branch_name;
    const clonePath = appState.repository.clonePath;
    const testBranch = targetBranch();

    if (!currentBranch || !clonePath || !testBranch) {
      setManagementStatus("Error: Missing required information");
      return;
    }

    // Clear step 4 job state (but NOT step 2 state)
    setStep4Job({ job: null, checkError: null });
    setStep4LastFailedJob(null);

    setManagementLoading(true);
    setManagementStatus("Checking out current branch...");

    try {
      const container = await WebContainerService.getInstance();
      const gitService = new GitService(container);

      // Checkout current branch
      await gitService.checkout(clonePath, currentBranch);

      // Merge test branch
      setManagementStatus(`Merging ${testBranch} into ${currentBranch}...`);
      await gitService.merge(clonePath, testBranch);

      setManagementStatus("Deploying changes...");

      // Call shared deployment handler with current-branch scenario
      const result = await handleDeploy("current-branch", currentBranch);

      if (!result.success) {
        setManagementStatus(`Error: ${result.error}`);
        setManagementLoading(false);
        return;
      }

      // Handle no changes case
      if (result.noChanges) {
        setManagementStatus(
          "No new changes to push. The test branch changes are already in the current branch.",
        );
        setManagementLoading(false);

        // Check last job status using step 4 specific function
        await checkLastJobStatusForStep4(currentBranch, (job) => {
          setStep4LastFailedJob(job);
        });
        return;
      }

      // Handle successful deployment with changes
      setManagementStatus("Successfully pushed to current branch");

      // Check for Amplify job using shared function
      if (result.commitHash) {
        const jobResult = await checkForJob(
          result.commitHash,
          currentBranch,
          "current-branch",
        );

        if (jobResult.error) {
          setStep4Job({
            job: null,
            checkError: jobResult.error,
          });
        } else if (jobResult.job) {
          setStep4Job({
            job: jobResult.job,
            checkError: null,
          });

          // Start polling using shared function
          startJobPolling(jobResult.job.jobId, currentBranch, (job) => {
            setStep4Job({
              job: job,
              checkError: null,
            });
          });
        }
      }
    } catch (e) {
      console.error("Error pushing to current branch:", e);
      setManagementStatus(`Error: ${String(e)}`);
    } finally {
      setManagementLoading(false);
    }
  };

  // Handle delete test branch
  const handleDeleteTestBranch = async () => {
    const branchName = targetBranch();
    const region = appState.awsConfig.selectedRegion;
    const appId = appState.amplifyResources.selectedApp?.app_id;
    const clonePath = appState.repository.clonePath;
    const currentBranch = appState.amplifyResources.selectedBranch?.branch_name;

    if (!branchName || !region || !appId || !clonePath || !currentBranch) {
      setCleanupStatus("Error: Missing information to delete branch");
      return;
    }

    const creds = await getStoredGitCredentials();
    if (!creds) {
      setCleanupStatus("Error: Git credentials not found");
      return;
    }

    setCleanupLoading(true);
    setCleanupStatus("Deleting test branch...");

    try {
      const container = await WebContainerService.getInstance();
      const amplifyService = new AmplifyService();
      const gitService = new GitService(container);

      setCleanupStatus("Deleting branch in AWS Amplify...");
      await amplifyService.deleteBranch(region, appId, branchName);

      setCleanupStatus("Deleting branch from remote repository...");
      await gitService.deleteRemoteBranch(
        clonePath,
        creds,
        branchName,
        (msg) => {
          setCleanupStatus(msg);
        },
      );

      setCleanupStatus("Switching back to original branch...");
      await gitService.checkout(clonePath, currentBranch);

      setCleanupStatus("Deleting local branch...");
      await gitService.deleteBranch(clonePath, branchName);

      setCleanupStatus("Test branch deleted successfully");
    } catch (e) {
      console.error("Error deleting test branch:", e);
      setCleanupStatus(`Error: Failed to delete branch: ${String(e)}`);
    } finally {
      setCleanupLoading(false);
    }
  };

  // Check if all steps are complete to enable Finish button
  const canFinish = () => {
    if (deploymentMode() === "current") {
      // Current branch: need push to complete (success or failed, but not running)
      const job = deploymentJob().job;
      const jobComplete =
        !job || ["SUCCEED", "FAILED", "CANCELLED"].includes(job.status);

      return (
        (pushStatus() === "success" || pushStatus() === "failed") &&
        pushStatus() !== "running" &&
        jobComplete
      );
    } else {
      // Test branch: need job to complete (any terminal state)
      const jobComplete =
        deploymentJob().job &&
        ["SUCCEED", "FAILED", "CANCELLED"].includes(
          deploymentJob().job!.status,
        );

      if (!jobComplete) return false;

      // If no post-test selection yet, can't finish
      if (!postTestSelection()) return false;

      // If selected "manual", can finish immediately
      if (postTestSelection() === "manual") return true;

      // If selected "push", need push to current to complete (success or failed)
      if (postTestSelection() === "push") {
        const pushComplete =
          managementStatus()?.includes(
            "Successfully pushed to current branch",
          ) ||
          managementStatus()?.includes("Error") ||
          managementStatus()?.includes("No new changes");

        // Also check if push to current job is complete (if exists)
        const pushJob = step4Job().job;
        const pushJobComplete =
          !pushJob ||
          ["SUCCEED", "FAILED", "CANCELLED"].includes(pushJob.status);

        // Can finish if push completed OR if job completed (even if push status not set)
        return (!!pushComplete || pushJobComplete) && !managementLoading();
      }

      return false;
    }
  };

  const handleBack = () => {
    if (pushStatus() === "running" || pushStatus() === "success") {
      return;
    }
    if (props.onBack) props.onBack();
  };

  const handleFinish = () => {
    // Check if test branch exists and hasn't been deleted
    const isTestMode = deploymentMode() === "test";
    const testBranchExists =
      isTestMode &&
      targetBranch() &&
      !cleanupStatus()?.includes("deleted successfully");

    if (testBranchExists) {
      // Show confirmation dialog for test branch cleanup
      setShowCleanupDialog(true);
    } else {
      // Complete the wizard
      completeWizard();
    }
  };

  const completeWizard = () => {
    // Manually reset state instead of using clearDownstreamState
    // This gives us more control over the wizard steps

    // Clear App Selection state
    setAppState("amplifyResources", {
      apps: [],
      selectedApp: null,
      branches: [],
      selectedBranch: null,
      lambdaFunctions: [],
    });

    // Clear Clone & Update state
    setAppState("repository", {
      clonePath: null,
      packageManager: null,
      backendType: null,
      changes: [],
      buildStatus: "pending",
      sandboxDeployed: false,
      gen2SandboxEnabled: false,
      gen2SandboxStatus: "pending",
      gen2BuildVerificationStatus: "pending",
      isOperationRunning: false,
      envVarChanges: [],
      buildConfigChange: null,
      buildConfigMessage: null,
      buildConfigError: null,
      upgradeMessage: null,
      upgradeError: null,
      upgradeChanges: [],
      gen2EnvVarMessage: null,
      gen2EnvVarError: null,
      cloneError: null,
      updateError: null,
      originalBuildSpec: null,
      operationStatus: {
        cloneComplete: false,
        prepareComplete: false,
        updateComplete: false,
        upgradeComplete: false,
        buildConfigComplete: false,
        buildComplete: false,
        envVarComplete: false,
        gen2EnvVarComplete: false,
      },
    });

    // Clear Push step state
    setAppState("pushStep", {
      status: "pending",
      deploymentMode: "test",
      error: null,
      commitHash: null,
      targetBranch: null,
      deploymentJob: {
        job: null,
        scenario: null,
        checkError: null,
      },
      lastFailedJob: null,
      retryingJob: false,
      innerStep: 0,
      postTestSelection: null,
      basedOnAppId: null,
      basedOnBranchName: null,
      basedOnClonePath: null,
    });

    // Reset wizard steps - mark all as incomplete and disabled except credentials
    setAppState("wizard", "steps", 0, "isComplete", true); // Keep credentials complete
    setAppState("wizard", "steps", 0, "isEnabled", true); // Keep credentials enabled

    setAppState("wizard", "steps", 1, "isComplete", false);
    setAppState("wizard", "steps", 1, "isEnabled", false);
    setAppState("wizard", "steps", 2, "isComplete", false);
    setAppState("wizard", "steps", 2, "isEnabled", false);
    setAppState("wizard", "steps", 3, "isComplete", false);
    setAppState("wizard", "steps", 3, "isEnabled", false);

    // Navigate back to first step (credentials)
    setAppState("wizard", "currentStep", 0);

    // Don't call props.onComplete() because it would mark the current step as complete
    // We've already handled the navigation and state reset above
  };

  const handleCleanupDialogConfirm = async (shouldDelete: boolean) => {
    setShowCleanupDialog(false);

    if (shouldDelete) {
      // Delete the test branch
      await handleDeleteTestBranch();
      // Wait a bit for cleanup to complete
      setTimeout(() => {
        completeWizard();
      }, 1000);
    } else {
      // Keep the branch and complete
      completeWizard();
    }
  };

  const handleCleanupClose = () => {
    setShowCleanupDialog(false);
  };

  // Convert deployment mode selection status
  const getDeploymentModeStatus = (): OperationStatus => {
    if (deploymentMode()) return "success";
    return "pending";
  };
  const getPushOperationStatus = (): OperationStatus => {
    if (pushStatus() === "pending" || pushStatus() === "confirming")
      return "pending";
    if (pushStatus() === "running") return "running";

    // If push succeeded, check job status
    if (pushStatus() === "success") {
      const job = deploymentJob().job;
      if (job) {
        if (job.status === "RUNNING") {
          return "running";
        }
        if (job.status === "FAILED") {
          return "failed";
        }
      }
      return "success";
    }

    return "failed";
  };

  // Get status label for push step
  const getPushStatusLabel = () => {
    if (pushStatus() === "success") {
      const job = deploymentJob().job;
      if (job) {
        if (job.status === "RUNNING") {
          return "Deploying...";
        }
        if (job.status === "FAILED") {
          return "✗ Deployment Failed";
        }
        if (job.status === "SUCCEED") {
          return "✓ Deployed";
        }
      }
      return "✓ Pushed";
    }
    return undefined;
  };

  // Convert merge status to operation status
  const getMergeOperationStatus = (): OperationStatus => {
    if (!postTestSelection()) return "pending";
    return "success";
  };

  // Convert push to current status to operation status
  const getPushToCurrentOperationStatus = (): OperationStatus => {
    const job = step4Job().job;

    // If we have a job, check its status
    if (job) {
      if (job.status === "RUNNING") return "running";
      if (job.status === "SUCCEED") return "success";
      if (job.status === "FAILED") return "failed";
    }

    // If retrying a job, show as running
    if (retryingJob()) return "running";

    // Check management status
    if (managementStatus()?.includes("No new changes")) return "success";
    if (managementStatus()?.includes("Successfully pushed to current branch"))
      return "success";
    if (managementStatus()?.includes("Successfully started deployment job"))
      return "running";
    if (managementStatus()?.includes("Error")) return "failed";
    if (managementLoading()) return "running";

    return "pending";
  };

  // Get status label for push to current step
  const getPushToCurrentStatusLabel = () => {
    const job = step4Job().job;

    // If we have a job, show its status
    if (job) {
      if (job.status === "RUNNING") return "Deploying...";
      if (job.status === "SUCCEED") return "✓ Deployed";
      if (job.status === "FAILED") return "✗ Failed";
    }

    // Fallback to management status
    if (managementStatus()?.includes("No new changes")) {
      return "✓ No Changes";
    }
    if (managementStatus()?.includes("Successfully pushed to current branch")) {
      return "✓ Pushed";
    }
    if (retryingJob()) {
      return "Starting...";
    }

    return undefined;
  };

  // Convert cleanup status to operation status
  const getCleanupOperationStatus = (): OperationStatus => {
    if (cleanupStatus()?.includes("deleted successfully")) return "success";
    if (cleanupStatus()?.includes("Error")) return "failed";
    if (cleanupLoading()) return "running";
    return "pending";
  };

  return (
    <WizardStep
      title="Deploy Changes"
      description="Review and push your local runtime changes to AWS Amplify."
      onNext={handleFinish}
      onBack={handleBack}
      nextDisabled={!canFinish()}
      backDisabled={pushStatus() === "running" || pushStatus() === "success"}
      isLoading={pushStatus() === "running" || managementLoading()}
      nextLabel="Finish"
      // showNext={canFinish()}
    >
      <div class="space-y-6">
        {/* Summary Section */}
        <div class="bg-white dark:bg-[#2a2a2a] border border-[#eee] dark:border-[#444] rounded-xl px-6 py-4 shadow-sm">
          <h3 class="text-base font-semibold mb-3 text-[#333] dark:text-[#eee]">
            Deployment Summary
          </h3>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-[#666] dark:text-[#aaa]">App:</span>
              <span class="text-[#333] dark:text-[#eee] font-medium">
                {appState.amplifyResources.selectedApp?.name}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[#666] dark:text-[#aaa]">Branch:</span>
              <span class="text-[#333] dark:text-[#eee] font-medium">
                {appState.amplifyResources.selectedBranch?.branch_name}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[#666] dark:text-[#aaa]">Target Runtime:</span>
              <span class="px-2 py-0.5 bg-[#e0f2f1] text-[#00796b] dark:bg-[#1a2e2c] dark:text-[#4db6ac] rounded text-xs font-semibold font-mono">
                {appState.runtimeInfo.targetRuntime}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[#666] dark:text-[#aaa]">Backend:</span>
              <span class="px-2 py-0.5 bg-[#e3f2fd] text-[#1976d2] dark:bg-[#1a2a3a] dark:text-[#64b5f6] rounded text-xs font-semibold">
                {appState.repository.backendType === "Gen2" ? "Gen 2" : "Gen 1"}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          {/* Step 1: Deployment Mode Selection */}
          <OperationCard
            stepNumber={1}
            title="Deployment Mode"
            description="Choose how to deploy your changes"
            successLabel="✓ Selected"
            status={getDeploymentModeStatus()}
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <button
                class={`p-4 rounded-lg border-2 text-left transition-all ${
                  deploymentMode() === "test"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
                }`}
                onClick={() => setDeploymentMode("test")}
                disabled={pushStatus() !== "pending"}
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-lg">🧪</span>
                  <span class="font-semibold text-sm">
                    Deploy to Test Branch
                  </span>
                  <span class="ml-auto px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-xs font-medium">
                    Recommended
                  </span>
                </div>
                <p class="m-0 text-xs text-[#666] dark:text-[#aaa]">
                  Create a temporary branch for safe testing before merging
                </p>
              </button>
              <button
                class={`p-4 rounded-lg border-2 text-left transition-all ${
                  deploymentMode() === "current"
                    ? "border-red-500 bg-red-50 dark:bg-red-900/30"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-red-300"
                }`}
                onClick={() => setDeploymentMode("current")}
                disabled={pushStatus() !== "pending"}
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-lg">⚠️</span>
                  <span class="font-semibold text-sm text-red-700 dark:text-red-400">
                    Deploy to Current Branch
                  </span>
                </div>
                <p class="m-0 text-xs text-red-600 dark:text-red-400">
                  Push directly to{" "}
                  {appState.amplifyResources.selectedBranch?.branch_name} (no
                  testing)
                </p>
              </button>
            </div>
          </OperationCard>

          {/* Step 2: Push Changes */}
          <Show when={deploymentMode()}>
            <OperationCard
              stepNumber={2}
              title="Deploy Changes"
              description={`Push and deploy changes to ${deploymentMode() === "test" ? "test branch" : appState.amplifyResources.selectedBranch?.branch_name}`}
              status={getPushOperationStatus()}
              onAction={handlePush}
              actionLabel="Push Changes"
              runningLabel="Deploying..."
              successLabel={getPushStatusLabel()}
              failedLabel="✗ Failed"
              error={pushError()}
            >
              <Show when={pushStatus() === "success"}>
                <Show when={!commitHash()}>
                  {/* No changes case - show this message until a retry job is actually created */}
                  <Show when={!deploymentJob().job || lastFailedJob()}>
                    <OperationFeedback
                      status="success"
                      noChanges={true}
                      noChangesMessage={
                        <div class="text-sm space-y-3">
                          <p class="m-0 text-[#666] dark:text-[#aaa]">
                            No changes to commit. All runtime configurations are
                            already up to date.
                          </p>

                          <Show when={!lastFailedJob()}>
                            <p class="m-0 p-3 bg-[#e7f3ff] dark:bg-[#1a2a3a] border border-[#b3d9ff] dark:border-[#396cd8] rounded-md text-[#0066cc] dark:text-[#7dd3fc] text-sm">
                              Since no code changes were made, your Lambda
                              functions should already be using the correct
                              runtime versions.
                            </p>
                          </Show>
                        </div>
                      }
                    />
                  </Show>

                  {/* Show loading indicator while retrying (when job is cleared) */}
                  <Show
                    when={
                      retryingJob() && !deploymentJob().job && !lastFailedJob()
                    }
                  >
                    <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                      <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                      <span class="text-sm text-blue-700 dark:text-blue-300">
                        Starting Amplify deployment job...
                      </span>
                    </div>
                  </Show>

                  {/* Show current job status (without retry options for RUNNING/CANCELLED) */}
                  <Show when={deploymentJob().job && !lastFailedJob()}>
                    <DeploymentJobCard
                      job={deploymentJob().job}
                      consoleUrl={getJobConsoleUrl()}
                      onFormatDateTime={formatLocalDateTime}
                      title="Current Deployment Job"
                    />
                  </Show>

                  {/* Show last job with retry options (for FAILED/SUCCEED) */}
                  <Show when={lastFailedJob()}>
                    {/* Show loading indicator while retrying (replaces the card) */}
                    <Show when={retryingJob() && !deploymentJob().job}>
                      <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                        <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                        <span class="text-sm text-blue-700 dark:text-blue-300">
                          Starting Amplify deployment job...
                        </span>
                      </div>
                    </Show>

                    {/* Show the job card only when NOT retrying */}
                    <Show when={!retryingJob() || deploymentJob().job}>
                      <DeploymentJobCard
                        job={lastFailedJob()}
                        consoleUrl={getJobConsoleUrl()}
                        onFormatDateTime={formatLocalDateTime}
                        title="Last Deployment Job"
                        showRetryOptions={true}
                        onRetry={handleRetryJob}
                        retrying={retryingJob()}
                      />
                    </Show>
                  </Show>
                </Show>

                <Show when={commitHash()}>
                  {/* Changes committed case */}
                  <OperationFeedback status="success">
                    <div class="space-y-3">
                      <div class="flex items-center gap-2 text-sm">
                        <span class="text-[#666] dark:text-[#aaa]">
                          Commit:
                        </span>
                        <code class="font-mono text-xs bg-[#e0e0e0] dark:bg-[#444] px-2 py-1 rounded">
                          {commitHash()}
                        </code>
                      </div>
                      <Show when={targetBranch()}>
                        <div class="flex items-center gap-2 text-sm">
                          <span class="text-[#666] dark:text-[#aaa]">
                            Branch:
                          </span>
                          <code class="font-mono text-xs bg-[#e0e0e0] dark:bg-[#444] px-2 py-1 rounded">
                            {targetBranch()}
                          </code>
                        </div>
                      </Show>

                      {/* Show loading indicator while checking for job */}
                      <Show when={checkingForJob()}>
                        <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                          <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                          <span class="text-sm text-blue-700 dark:text-blue-300">
                            Starting Amplify deployment job...
                          </span>
                        </div>
                      </Show>

                      {/* Show loading indicator while retrying (when coming from no-changes scenario) */}
                      <Show
                        when={
                          retryingJob() &&
                          !deploymentJob().job &&
                          !checkingForJob()
                        }
                      >
                        <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                          <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                          <span class="text-sm text-blue-700 dark:text-blue-300">
                            Starting Amplify deployment job...
                          </span>
                        </div>
                      </Show>

                      {/* Amplify Job Status - show for both test and current branch */}
                      <DeploymentJobCard
                        job={deploymentJob().job}
                        consoleUrl={getJobConsoleUrl()}
                        onFormatDateTime={formatLocalDateTime}
                      />
                    </div>
                  </OperationFeedback>
                </Show>
                {/* Job check error */}
                <Show when={deploymentJob().checkError}>
                  <div class="mt-3 p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs text-orange-700 dark:text-orange-300">
                    {deploymentJob().checkError}
                  </div>
                </Show>
              </Show>
            </OperationCard>
          </Show>

          {/* Step 3: Merge Decision (only for test branch after job completes) */}
          <Show
            when={
              deploymentMode() === "test" &&
              pushStatus() === "success" &&
              deploymentJob().job &&
              ["SUCCEED", "FAILED", "CANCELLED"].includes(
                deploymentJob().job!.status,
              )
            }
          >
            <OperationCard
              stepNumber={3}
              title="Deployment Decision"
              description={`Choose how to deploy the changes to your ${appState.amplifyResources.selectedBranch?.branch_name} branch`}
              status={getMergeOperationStatus()}
              successLabel="✓ Selected"
            >
              <div class="space-y-3 mt-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    class={`p-4 rounded-lg border-2 text-left transition-all ${
                      postTestSelection() === "push"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      // Clear step 4 job state when selecting "Push to Current"
                      setStep4Job({
                        job: null,
                        checkError: null,
                      });
                      setStep4LastFailedJob(null);
                      setManagementStatus(null);
                      setPostTestSelection("push");
                    }}
                    disabled={
                      managementLoading() ||
                      managementStatus()?.includes("Successfully")
                    }
                  >
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-lg">🚀</span>
                      <span class="font-semibold text-sm">Push to Current</span>
                    </div>
                    <p class="m-0 text-xs text-[#666] dark:text-[#aaa]">
                      Merge and push to{" "}
                      {appState.amplifyResources.selectedBranch?.branch_name}
                    </p>
                  </button>
                  <button
                    class={`p-4 rounded-lg border-2 text-left transition-all ${
                      postTestSelection() === "manual"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
                    }`}
                    onClick={() => setPostTestSelection("manual")}
                    disabled={
                      managementLoading() ||
                      managementStatus()?.includes("Successfully")
                    }
                  >
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-lg">📝</span>
                      <span class="font-semibold text-sm">Manual Merge</span>
                    </div>
                    <p class="m-0 text-xs text-[#666] dark:text-[#aaa]">
                      Handle merge through Git provider
                    </p>
                  </button>
                </div>
              </div>
            </OperationCard>
          </Show>

          {/* Step 4: Push to Current Branch */}
          <Show when={postTestSelection() === "push"}>
            <OperationCard
              stepNumber={4}
              title={`Deploy Changes`}
              description={`Push and deploy changes to ${appState.amplifyResources.selectedBranch?.branch_name} branch`}
              status={getPushToCurrentOperationStatus()}
              onAction={handlePushToCurrent}
              actionLabel="Push to Current"
              runningLabel="Deploying..."
              successLabel={getPushToCurrentStatusLabel()}
              failedLabel="✗ Failed"
              error={
                managementStatus()?.includes("Error") && !step4Job().job
                  ? managementStatus()
                  : null
              }
            >
              <Show
                when={
                  managementStatus() && !managementStatus()?.includes("Error")
                }
              >
                {/* Show "no changes" message - show until a retry job is actually created */}
                <Show
                  when={
                    managementStatus()?.includes("No new changes") &&
                    (!step4Job().job || step4LastFailedJob())
                  }
                >
                  <OperationFeedback
                    status="success"
                    noChanges={true}
                    noChangesMessage={
                      <div class="text-sm space-y-3">
                        <p class="m-0 text-[#666] dark:text-[#aaa]">
                          No new changes to push. The test branch changes are
                          already in the current branch.
                        </p>

                        <Show when={!step4LastFailedJob()}>
                          <p class="m-0 p-3 bg-[#e7f3ff] dark:bg-[#1a2a3a] border border-[#b3d9ff] dark:border-[#396cd8] rounded-md text-[#0066cc] dark:text-[#7dd3fc] text-sm">
                            The test branch has already been merged into the
                            current branch. No additional push is needed.
                          </p>
                        </Show>
                      </div>
                    }
                  />
                </Show>

                {/* Show loading indicator while retrying (when job is cleared) */}
                <Show
                  when={
                    managementStatus()?.includes("No new changes") &&
                    retryingJob() &&
                    !step4Job().job &&
                    !step4LastFailedJob()
                  }
                >
                  <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                    <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                    <span class="text-sm text-blue-700 dark:text-blue-300">
                      Starting Amplify deployment job...
                    </span>
                  </div>
                </Show>

                {/* Show current job status (without retry options) */}
                <Show when={step4Job().job && !step4LastFailedJob()}>
                  <DeploymentJobCard
                    job={step4Job().job}
                    consoleUrl={getJobConsoleUrl(
                      appState.amplifyResources.selectedBranch?.branch_name,
                    )}
                    onFormatDateTime={formatLocalDateTime}
                    title="Current Deployment Job"
                  />
                </Show>

                {/* Show last job with retry options */}
                <Show when={step4LastFailedJob()}>
                  {/* Show loading indicator while retrying (replaces the card) */}
                  <Show when={retryingJob() && !step4Job().job}>
                    <div class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center gap-3">
                      <span class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                      <span class="text-sm text-blue-700 dark:text-blue-300">
                        Starting Amplify deployment job...
                      </span>
                    </div>
                  </Show>

                  {/* Show the job card only when NOT retrying */}
                  <Show when={!retryingJob() || step4Job().job}>
                    <DeploymentJobCard
                      job={step4LastFailedJob()}
                      consoleUrl={getJobConsoleUrl(
                        appState.amplifyResources.selectedBranch?.branch_name,
                      )}
                      onFormatDateTime={formatLocalDateTime}
                      title="Last Deployment Job"
                      showRetryOptions={true}
                      onRetry={handleRetryJobForCurrent}
                      retrying={retryingJob()}
                    />
                  </Show>
                </Show>

                {/* Show normal feedback only when actually pushed changes (not retry) */}
                <Show
                  when={
                    !managementStatus()?.includes("No new changes") &&
                    managementStatus()?.includes(
                      "Successfully pushed to current branch",
                    )
                  }
                >
                  <OperationFeedback
                    status="success"
                    message={managementStatus()}
                  />
                </Show>
              </Show>

              {/* Always show Amplify Job Status when job exists (and not in no-changes scenario) */}
              <Show
                when={
                  step4Job().job &&
                  managementStatus()?.includes(
                    "Successfully pushed to current branch",
                  ) &&
                  (!retryingJob() || step4Job().job)
                }
              >
                <DeploymentJobCard
                  job={step4Job().job}
                  consoleUrl={getJobConsoleUrl(
                    appState.amplifyResources.selectedBranch?.branch_name,
                  )}
                  onFormatDateTime={formatLocalDateTime}
                  showRetryOptions={
                    step4Job().job?.status === "FAILED" ||
                    step4Job().job?.status === "SUCCEED"
                  }
                  onRetry={handleRetryJobForCurrent}
                  retrying={retryingJob()}
                />
              </Show>
            </OperationCard>
          </Show>

          {/* Step 5: Branch Cleanup (only for test branch, after merge decision) */}
          <Show when={deploymentMode() === "test" && postTestSelection()}>
            <OperationCard
              stepNumber={postTestSelection() === "push" ? 5 : 4}
              title="Branch Cleanup (Optional)"
              description="Delete the test branch from remote repository and AWS Amplify"
              status={getCleanupOperationStatus()}
              onAction={
                cleanupStatus()?.includes("deleted successfully")
                  ? undefined
                  : handleDeleteTestBranch
              }
              actionLabel="Delete Test Branch"
              runningLabel="Deleting..."
              successLabel="✓ Deleted"
              failedLabel="✗ Failed"
            >
              <div class="text-sm space-y-2">
                {/* <Show when={targetBranch()}>
                  <p class="m-0 text-[#666] dark:text-[#aaa]">
                    Test branch{" "}
                    <code class="px-2 py-0.5 bg-[#e0e0e0] dark:bg-[#444] rounded font-mono text-xs">
                      {targetBranch()}
                    </code>{" "}
                    can be deleted from:
                  </p>
                </Show>
                <ul class="m-0 pl-5 space-y-1 text-[#666] dark:text-[#aaa] text-xs">
                  <li>Local repository</li>
                  <li>Remote repository</li>
                  <li>AWS Amplify</li>
                </ul> */}
                <Show when={cleanupStatus()?.includes("deleted successfully")}>
                  <div class="mt-3 p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded">
                    ✓ Test branch deleted successfully
                  </div>
                </Show>
                <Show when={cleanupLoading()}>
                  <div class="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <pre class="m-0 font-mono text-xs text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                      {cleanupStatus()}
                    </pre>
                  </div>
                </Show>
                <Show when={cleanupStatus()?.includes("Error")}>
                  <div class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                    <pre class="m-0 font-mono text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                      {cleanupStatus()}
                    </pre>
                  </div>
                </Show>
              </div>
            </OperationCard>
          </Show>
        </div>
      </div>

      {/* Test Branch Cleanup Confirmation Modal */}
      <Show when={showCleanupDialog()}>
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white dark:bg-[#2a2a2a] rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 class="text-lg font-semibold mb-4 text-[#333] dark:text-[#eee]">
              Test Branch Cleanup
            </h3>
            <p class="text-sm text-[#666] dark:text-[#aaa] mb-4">
              You have a test branch{" "}
              <code class="px-2 py-0.5 bg-[#e0e0e0] dark:bg-[#444] rounded font-mono text-xs">
                {targetBranch()}
              </code>{" "}
              that hasn't been deleted yet.
            </p>
            <p class="text-sm text-[#666] dark:text-[#aaa] mb-6">
              Would you like to delete it now? The branch will be removed from
              remote repository and AWS Amplify.
            </p>
            <div class="flex gap-3 justify-end">
              <button
                class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                onClick={() => handleCleanupDialogConfirm(false)}
              >
                Keep Branch
              </button>
              <button
                class="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                onClick={() => handleCleanupDialogConfirm(true)}
              >
                Delete Branch
              </button>
            </div>
          </div>
        </div>
      </Show>
    </WizardStep>
  );
}

export default PushStep;
