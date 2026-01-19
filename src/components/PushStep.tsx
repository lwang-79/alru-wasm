import {
  createSignal,
  Show,
  For,
  onCleanup,
  createEffect,
  onMount,
} from "solid-js";
import type { AmplifyJobDetails } from "../types";
import {
  appState,
  setAppState,
  checkAndResetPushStepIfNeeded,
  updatePushStepContext,
} from "../store/appStore";
import { CleanupDialog } from "./CleanupDialog";
import { WebContainerService } from "../services/container/webContainerService";
import { GitService, type GitCredentials } from "../services/git/gitService";
import { AmplifyService } from "../services/aws/amplifyService";
import { CredentialService } from "../services/aws/credentialService";
import "./shared.css";
import "./PushStep.css";

interface PushStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

export function PushStep(props: PushStepProps) {
  // Use store state instead of local signals for persistence
  const pushStatus = () => appState.pushStep.status;
  const setPushStatus = (status: typeof appState.pushStep.status) =>
    setAppState("pushStep", "status", status);

  const pushError = () => appState.pushStep.error;
  const setPushError = (error: string | null) =>
    setAppState("pushStep", "error", error);

  const commitHash = () => appState.pushStep.commitHash;
  const setCommitHash = (hash: string | null) =>
    setAppState("pushStep", "commitHash", hash);

  const amplifyJob = () => appState.pushStep.amplifyJob;
  const setAmplifyJob = (job: AmplifyJobDetails | null) =>
    setAppState("pushStep", "amplifyJob", job);

  const jobCheckError = () => appState.pushStep.jobCheckError;
  const setJobCheckError = (error: string | null) =>
    setAppState("pushStep", "jobCheckError", error);

  // Add state to track when we're checking for jobs with retries
  const [checkingForJob, setCheckingForJob] = createSignal(false);

  const lastFailedJob = () => appState.pushStep.lastFailedJob;
  const setLastFailedJob = (job: AmplifyJobDetails | null) =>
    setAppState("pushStep", "lastFailedJob", job);

  const retryingJob = () => appState.pushStep.retryingJob;
  const setRetryingJob = (retrying: boolean) =>
    setAppState("pushStep", "retryingJob", retrying);

  // Local signals for dialogs and temporary state (these don't need persistence)
  const [showCleanupDialog, setShowCleanupDialog] = createSignal(false);
  let jobCheckInterval: number | null = null;

  // Git credentials (will prompt user if needed)
  const [gitCredentials, setGitCredentials] =
    createSignal<GitCredentials | null>(null);

  // Environment variable revert functionality (local state)
  const [showRevertDialog, setShowRevertDialog] = createSignal(false);
  const [revertInProgress, setRevertInProgress] = createSignal(false);

  // Build spec revert functionality (local state)
  const [showBuildSpecRevertDialog, setShowBuildSpecRevertDialog] =
    createSignal(false);
  const [revertBuildSpecInProgress, setRevertBuildSpecInProgress] =
    createSignal(false);

  // Check if state should be reset on mount and when navigating to this step
  onMount(() => {
    checkAndResetPushStepIfNeeded();
    updatePushStepContext();
  });

  // Get environment variable changes from app state
  const getEnvVarChanges = () => appState.repository.envVarChanges;

  // Show confirmation dialog
  const handleInitiatePush = () => {
    setPushStatus("confirming");
  };

  // Cancel push
  const handleCancelPush = () => {
    setPushStatus("pending");
  };

  // Get Git credentials - try stored credentials first, then prompt if needed
  const getStoredGitCredentials = async (): Promise<GitCredentials | null> => {
    try {
      const credentialService = new CredentialService();
      const storedCreds = credentialService.getGitCredentials();

      if (storedCreds && storedCreds.username && storedCreds.token) {
        console.log(
          "[getStoredGitCredentials] Found credentials for:",
          storedCreds.username,
        );
        // Map 'token' from storage to 'password' expected by GitService
        return {
          username: storedCreds.username,
          password: storedCreds.token, // token from storage -> password for git
        };
      }
      console.log(
        "[getStoredGitCredentials] No valid credentials found in storage",
      );
      return null;
    } catch (e) {
      console.error("Failed to load stored Git credentials:", e);
      return null;
    }
  };

  // Prompt for Git credentials as fallback
  const promptForGitCredentials = (): Promise<GitCredentials> => {
    return new Promise((resolve, reject) => {
      const username = prompt(
        "GitHub Authentication Required\n\n" +
          "No credentials found. Please configure credentials in Step 1.\n\n" +
          "Enter your GitHub username:",
      );
      if (!username) {
        reject(
          new Error(
            "GitHub username is required. Please go back to Step 1 to configure credentials.",
          ),
        );
        return;
      }

      const password = prompt(
        "GitHub Authentication Required\n\n" +
          "No credentials found. Please configure credentials in Step 1.\n\n" +
          "Enter your Personal Access Token (PAT):\n\n" +
          "Create one at: https://github.com/settings/tokens\n" +
          "Required scope: 'repo' (for private repos) or 'public_repo' (for public repos)",
      );
      if (!password) {
        reject(
          new Error(
            "Personal Access Token is required. Please go back to Step 1 to configure credentials.",
          ),
        );
        return;
      }

      resolve({ username, password });
    });
  };

  // Confirm and execute push
  const handleConfirmPush = async () => {
    const clonePath = appState.repository.clonePath;

    if (!clonePath) {
      setPushError("No repository path found");
      setPushStatus("failed");
      return;
    }

    setPushStatus("running");
    setPushError(null);
    setCommitHash(null);

    try {
      // Get WebContainer instance
      const container = await WebContainerService.getInstance();
      const gitService = new GitService(container);

      // Try to get stored Git credentials first
      let creds = gitCredentials();
      console.log("[Push] Initial gitCredentials state:", creds);

      if (!creds) {
        // Try loading from credential service
        console.log(
          "[Push] Attempting to load credentials from CredentialService...",
        );
        creds = await getStoredGitCredentials();
        console.log(
          "[Push] Loaded credentials:",
          creds
            ? `username: ${creds.username}, password: ${creds.password ? "[SET]" : "[MISSING]"}`
            : "null",
        );

        if (creds) {
          console.log("[Push] Using stored Git credentials from Step 1");
          setGitCredentials(creds);
        }
      }

      // If still no credentials, prompt the user
      if (!creds) {
        try {
          console.log("[Push] No stored credentials found, prompting user");
          creds = await promptForGitCredentials();
          console.log(
            "[Push] User provided credentials:",
            creds
              ? `username: ${creds.username}, password: ${creds.password ? "[SET]" : "[MISSING]"}`
              : "null",
          );
          setGitCredentials(creds);
        } catch (e) {
          setPushError(String(e));
          setPushStatus("failed");
          return;
        }
      }

      // Final validation before proceeding
      if (!creds || !creds.username || !creds.password) {
        console.error("[Push] Invalid credentials after all attempts:", creds);
        setPushError(
          "Invalid Git credentials. Please ensure both username and password/token are provided. " +
            "Go back to Step 1 to configure your GitHub credentials.",
        );
        setPushStatus("failed");
        return;
      }

      console.log(
        "[Push] Final credentials check passed. Username:",
        creds.username,
      );

      // Create commit message based on changes
      const targetRuntime = appState.runtimeInfo.targetRuntime;
      const backendType = appState.repository.backendType;
      const commitMessage = `chore: Update Lambda runtime to ${targetRuntime}

- Updated ${backendType} backend runtime configurations
- Upgraded Amplify packages to latest versions
${appState.repository.changes.length > 0 ? `- Modified ${appState.repository.changes.length} file(s)` : ""}

This update ensures Lambda functions use supported Node.js runtimes.`;

      // Check if there are any changes to commit
      console.log("[Push] Step 1: Checking for changed files...");
      let changedFiles;
      try {
        changedFiles = await gitService.getChangedFiles(clonePath);
        console.log("[Push] Changed files count:", changedFiles.length);
        console.log("[Push] Changed files:", changedFiles);
      } catch (getChangedFilesError) {
        console.error(
          "[Push] ERROR getting changed files:",
          getChangedFilesError,
        );
        throw getChangedFilesError;
      }

      if (changedFiles.length === 0) {
        // No changes to commit
        console.log("[Push] No changes to commit, skipping");
        setCommitHash(null);
        setPushStatus("success");
        setJobCheckError(
          "No changes were committed, so no deployment job was triggered",
        );

        // Check if the last job failed - if so, we should retry it
        checkLastJobStatus();
        return;
      }

      // Commit and push changes with streaming progress
      console.log("[Push] Step 2: Starting commitAndPush...");
      console.log("[Push] Repository path:", clonePath);
      console.log("[Push] Credentials:", {
        username: creds.username,
        passwordLength: creds.password?.length,
      });

      let hash;
      try {
        hash = await gitService.commitAndPush(
          clonePath,
          commitMessage,
          creds,
          (message: string) => {
            // Progress callback for streaming updates
            console.log(`[Git Progress] ${message}`);
          },
        );
        console.log("[Push] Step 3: commitAndPush SUCCESS, hash:", hash);
      } catch (commitPushError) {
        console.error("[Push] ❌ ERROR in commitAndPush:");
        console.error("[Push] Error object:", commitPushError);
        console.error("[Push] Error type:", typeof commitPushError);
        if (commitPushError instanceof Error) {
          console.error("[Push] Error message:", commitPushError.message);
          console.error("[Push] Error stack:", commitPushError.stack);
        }
        throw commitPushError;
      }

      setCommitHash(hash);
      setPushStatus("success");

      // Check for Amplify job
      if (hash) {
        checkForAmplifyJob(hash);
      }
    } catch (e) {
      const errorMessage = String(e);

      // Check if it's an authentication error
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("Invalid username or password") ||
        errorMessage.includes("authentication failed")
      ) {
        // Clear invalid credentials so user can re-enter
        setGitCredentials(null);
        setPushError(
          "Authentication failed. Please check your GitHub username and Personal Access Token (PAT). " +
            "Make sure your PAT has 'repo' permissions.",
        );
      } else {
        setPushError(errorMessage);
      }

      setPushStatus("failed");
    }
  };

  // Check the last job status to see if we should offer a retry
  const checkLastJobStatus = async () => {
    console.log("[checkLastJobStatus] Starting to check last job status");
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    console.log(
      "[checkLastJobStatus] App:",
      selectedApp?.name,
      "Branch:",
      selectedBranch?.branch_name,
    );

    if (!selectedApp || !selectedBranch || !region) {
      console.log("[checkLastJobStatus] Missing required info, aborting");
      return;
    }

    try {
      console.log("[checkLastJobStatus] Fetching jobs from Amplify...");
      const amplifyService = new AmplifyService();

      // Get the latest job for this branch
      const jobs = await amplifyService.listJobs(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
      );

      if (jobs.length > 0) {
        // Get the most recent job details
        const latestJobId = jobs[0].jobId;
        const lastJob = await amplifyService.getJob(
          region,
          selectedApp.app_id,
          selectedBranch.branch_name,
          latestJobId,
        );

        console.log("[checkLastJobStatus] Last job result:", lastJob);
        console.log("[checkLastJobStatus] Last job status:", lastJob.status);

        // Set lastFailedJob for both FAILED and SUCCEED status
        // FAILED: deployment failed, need to retry
        // SUCCEED: functions might have been updated outside Amplify, need to redeploy
        if (lastJob.status === "FAILED" || lastJob.status === "SUCCEED") {
          console.log("[checkLastJobStatus] Setting lastFailedJob:", lastJob);
          setLastFailedJob(lastJob);
        } else {
          console.log(
            "[checkLastJobStatus] Last job status is not FAILED or SUCCEED, it's:",
            lastJob.status,
          );
        }
      } else {
        console.log("[checkLastJobStatus] No jobs found");
      }
    } catch (e) {
      console.error("[checkLastJobStatus] Failed to check last job status:", e);
    }
  };

  // Retry the last failed job
  const handleRetryJob = async () => {
    const lastJob = lastFailedJob();
    if (!lastJob) return;

    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !selectedBranch || !region) {
      return;
    }

    setRetryingJob(true);

    try {
      const amplifyService = new AmplifyService();

      // Start a RETRY job
      const newJob = await amplifyService.startJob(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
        "RETRY",
        lastJob.jobId,
      );

      setAmplifyJob(newJob);
      setJobCheckError(null);
      setLastFailedJob(null);

      // Start polling for job status updates
      startJobStatusPolling(newJob.jobId);
    } catch (e) {
      console.error("Failed to retry job:", e);
      setJobCheckError(`Failed to retry job: ${String(e)}`);
    } finally {
      setRetryingJob(false);
    }
  };

  // Check for Amplify job after push with retry logic
  const checkForAmplifyJob = async (commitId: string) => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !selectedBranch || !region) {
      return;
    }

    setCheckingForJob(true);
    setJobCheckError(null);

    const maxRetries = 3;
    const retryDelays = [5000, 10000, 15000]; // 5s, 10s, 15s for attempts 1, 2, 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait before each attempt (including the first one)
        const currentDelay = retryDelays[attempt - 1];
        console.log(
          `[checkForAmplifyJob] Waiting ${currentDelay}ms before attempt ${attempt}/${maxRetries}...`,
        );

        // Update UI to show waiting status
        setJobCheckError(
          `Waiting ${currentDelay / 1000}s before checking for deployment job... (attempt ${attempt}/${maxRetries})`,
        );

        await new Promise((resolve) => setTimeout(resolve, currentDelay));

        console.log(
          `[checkForAmplifyJob] Attempt ${attempt}/${maxRetries}: Looking for job with commit ${commitId}...`,
        );

        // Update UI to show we're now checking
        setJobCheckError(
          `Looking for deployment job... (attempt ${attempt}/${maxRetries})`,
        );

        const amplifyService = new AmplifyService();
        const jobs = await amplifyService.listJobs(
          region,
          selectedApp.app_id,
          selectedBranch.branch_name,
          commitId,
        );

        if (jobs.length > 0) {
          // Found a job, get its details
          const job = jobs[0];
          console.log(
            `[checkForAmplifyJob] Found job on attempt ${attempt}:`,
            job.jobId,
          );

          const jobDetails = await amplifyService.getJob(
            region,
            selectedApp.app_id,
            selectedBranch.branch_name,
            job.jobId,
          );

          setAmplifyJob(jobDetails);
          setJobCheckError(null);
          setCheckingForJob(false);

          // Start polling for job status updates every 10 seconds
          startJobStatusPolling(job.jobId);
          return; // Job found, exit retry loop
        } else {
          console.log(
            `[checkForAmplifyJob] No job found on attempt ${attempt}/${maxRetries}`,
          );

          // If this is the last attempt, show final error message
          if (attempt === maxRetries) {
            console.log("[checkForAmplifyJob] No job found after all retries");
            setJobCheckError(
              "No Amplify job found for this commit after multiple attempts. The job may take longer to appear.",
            );
          }
        }
      } catch (e) {
        console.error(`[checkForAmplifyJob] Attempt ${attempt} failed:`, e);

        // If this is the last attempt, show error
        if (attempt === maxRetries) {
          console.error("[checkForAmplifyJob] All retry attempts failed:", e);
          setJobCheckError(String(e));
        }
      }
    }

    setCheckingForJob(false);
  };

  // Poll job status every 10 seconds
  const startJobStatusPolling = (jobId: string) => {
    // Clear any existing interval
    if (jobCheckInterval !== null) {
      clearInterval(jobCheckInterval);
    }

    jobCheckInterval = window.setInterval(async () => {
      const selectedApp = appState.amplifyResources.selectedApp;
      const selectedBranch = appState.amplifyResources.selectedBranch;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !selectedBranch || !region) {
        return;
      }

      try {
        const amplifyService = new AmplifyService();
        const jobDetails = await amplifyService.getJob(
          region,
          selectedApp.app_id,
          selectedBranch.branch_name,
          jobId,
        );

        setAmplifyJob(jobDetails);

        // Stop polling if job is in a terminal state
        if (["SUCCEED", "FAILED", "CANCELLED"].includes(jobDetails.status)) {
          if (jobCheckInterval !== null) {
            clearInterval(jobCheckInterval);
            jobCheckInterval = null;
          }
        }
      } catch (e) {
        console.error("Failed to update job status:", e);
      }
    }, 10000); // 10 seconds
  };

  // Cleanup interval on component unmount
  onCleanup(() => {
    if (jobCheckInterval !== null) {
      clearInterval(jobCheckInterval);
    }
  });

  // Debug: Log when lastFailedJob changes
  createEffect(() => {
    const job = lastFailedJob();
    console.log("[createEffect] lastFailedJob changed:", job);
  });

  // Revert environment variables (excluding _LIVE_UPDATES and _CUSTOM_IMAGE)
  const handleRevertEnvVars = async () => {
    const changes = getEnvVarChanges();
    const revertableChanges = changes.filter(
      (change) =>
        change.key !== "_LIVE_UPDATES" && change.key !== "_CUSTOM_IMAGE",
    );

    if (revertableChanges.length === 0) {
      return;
    }

    setRevertInProgress(true);

    try {
      const selectedApp = appState.amplifyResources.selectedApp;
      const selectedBranch = appState.amplifyResources.selectedBranch;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !selectedBranch || !region) {
        throw new Error(
          "Missing required information for environment variable revert",
        );
      }

      const amplifyService = new AmplifyService();

      // Group changes by level (app vs branch)
      const appChanges = revertableChanges.filter((c) => c.level === "app");
      const branchChanges = revertableChanges.filter(
        (c) => c.level === "branch",
      );

      // Revert app-level changes
      if (appChanges.length > 0) {
        // Step 1: Get CURRENT environment variables from AWS (not from stale app state)
        const app = await amplifyService.getApp(region, selectedApp.app_id);
        const currentAppEnvVars = { ...app.environmentVariables };

        // Step 2: Replace only the revertable variables with their old values
        // Keep everything else unchanged (including _LIVE_UPDATES and _CUSTOM_IMAGE)
        for (const change of appChanges) {
          currentAppEnvVars[change.key] = change.old_value;
        }

        // Step 3: Update AWS with the modified environment variables
        await amplifyService.updateAppEnvironmentVariables(
          region,
          selectedApp.app_id,
          currentAppEnvVars,
        );
      }

      // Revert branch-level changes
      if (branchChanges.length > 0) {
        // Step 1: Get CURRENT environment variables from AWS (not from stale app state)
        const branch = await amplifyService.getBranch(
          region,
          selectedApp.app_id,
          selectedBranch.branch_name,
        );
        const currentBranchEnvVars = { ...branch.environmentVariables };

        // Step 2: Replace only the revertable variables with their old values
        // Keep everything else unchanged (including _LIVE_UPDATES and _CUSTOM_IMAGE)
        for (const change of branchChanges) {
          currentBranchEnvVars[change.key] = change.old_value;
        }

        // Step 3: Update AWS with the modified environment variables
        await amplifyService.updateBranchEnvironmentVariables(
          region,
          selectedApp.app_id,
          selectedBranch.branch_name,
          currentBranchEnvVars,
        );
      }

      // Clear only the reverted changes from state, keep non-revertible ones
      const remainingChanges = getEnvVarChanges().filter(
        (change) =>
          change.key === "_LIVE_UPDATES" || change.key === "_CUSTOM_IMAGE",
      );
      setAppState("repository", "envVarChanges", remainingChanges);
      setShowRevertDialog(false);
    } catch (e) {
      console.error("Failed to revert environment variables:", e);
      // Could add error state here if needed
    } finally {
      setRevertInProgress(false);
    }
  };

  const handleCancelRevert = () => {
    setShowRevertDialog(false);
  };

  // Revert build spec to original
  const handleRevertBuildSpec = async () => {
    const originalBuildSpec = appState.repository.originalBuildSpec;

    if (!originalBuildSpec) {
      console.error("No original build spec found");
      return;
    }

    setRevertBuildSpecInProgress(true);

    try {
      const selectedApp = appState.amplifyResources.selectedApp;
      const region = appState.awsConfig.selectedRegion;

      if (!selectedApp || !region) {
        throw new Error("Missing required information for build spec revert");
      }

      const amplifyService = new AmplifyService();

      // Revert the build spec by updating the app with the original build spec
      await amplifyService.revertBuildSpec(
        region,
        selectedApp.app_id,
        originalBuildSpec,
      );

      // Clear build config change and original build spec from state
      setAppState("repository", "buildConfigChange", null);
      setAppState("repository", "originalBuildSpec", null);
      setShowBuildSpecRevertDialog(false);
    } catch (e) {
      console.error("Failed to revert build spec:", e);
      // Could add error state here if needed
    } finally {
      setRevertBuildSpecInProgress(false);
    }
  };

  const handleCancelBuildSpecRevert = () => {
    setShowBuildSpecRevertDialog(false);
  };

  // Helper function to format dates with unambiguous month names
  const formatLocalDateTime = (dateString: string) => {
    const date = new Date(dateString);

    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short", // This gives us "Jan", "Feb", "Mar", etc.
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const handleBack = () => {
    if (props.onBack) {
      props.onBack();
    }
  };

  const handleFinish = () => {
    // Show cleanup dialog if repository exists
    if (appState.repository.clonePath) {
      setShowCleanupDialog(true);
    } else if (props.onComplete) {
      props.onComplete();
    }
  };

  const handleCleanupClose = () => {
    setShowCleanupDialog(false);
    // Don't call props.onComplete() after cleanup since cleanup resets the state
    // The CleanupDialog already handles navigation to the appropriate step
  };

  return (
    <div class="step-container wide push-step">
      <h2>Push Changes</h2>
      <p class="step-description">
        Review and push your changes to trigger the Amplify deployment.
      </p>

      {/* Summary Section */}
      <div class="summary-balanced">
        <h3>Changes Summary</h3>
        <div class="summary-row-balanced">
          <div class="summary-pair-balanced half-width">
            <span class="summary-pair-label-balanced">App:</span>
            <span class="summary-pair-value-balanced">
              {appState.amplifyResources.selectedApp?.name}
            </span>
          </div>
          <div class="summary-pair-balanced half-width">
            <span class="summary-pair-label-balanced">Branch:</span>
            <span class="summary-pair-value-balanced">
              {appState.amplifyResources.selectedBranch?.branch_name}
            </span>
          </div>
        </div>
        <div class="summary-row-balanced">
          <div class="summary-pair-balanced half-width">
            <span class="summary-pair-label-balanced">Target Runtime:</span>
            <span class="badge-balanced runtime">
              {appState.runtimeInfo.targetRuntime}
            </span>
          </div>
          <div class="summary-pair-balanced half-width">
            <span class="summary-pair-label-balanced">Backend Type:</span>
            <span class="badge-balanced type">
              {appState.repository.backendType === "Gen2" ? "Gen 2" : "Gen 1"}
            </span>
          </div>
        </div>
        <div class="summary-row-balanced">
          <div class="summary-pair-balanced full-width">
            <span class="summary-pair-label-balanced">Files Modified:</span>
            <span class="summary-pair-value-balanced">
              {appState.repository.changes.length > 0
                ? `${appState.repository.changes.length} file(s)`
                : "No manual changes (updated via package upgrade)"}
            </span>
          </div>
        </div>
      </div>

      {/* Push Action Section */}
      <div class="push-action-section">
        <Show when={pushStatus() === "pending"}>
          <div class="push-ready">
            <div class="ready-icon">✓</div>
            <h3>Ready to Push</h3>
            <p>
              Your changes are ready to be committed and pushed to the remote
              repository. This will trigger an Amplify deployment with the
              updated runtime configuration.
            </p>
            <button class="push-button" onClick={handleInitiatePush}>
              Push Changes
            </button>
          </div>
        </Show>

        <Show when={pushStatus() === "confirming"}>
          <div class="confirmation-dialog">
            <div class="confirmation-icon">⚠️</div>
            <h3>Confirm Push</h3>
            <p>
              Are you sure you want to push these changes? This will commit and
              push to the{" "}
              <strong>
                {appState.amplifyResources.selectedBranch?.branch_name}
              </strong>{" "}
              branch and trigger an Amplify deployment.
            </p>
            <div class="confirmation-actions">
              <button class="cancel-button" onClick={handleCancelPush}>
                Cancel
              </button>
              <button class="confirm-button" onClick={handleConfirmPush}>
                Confirm & Push
              </button>
            </div>
          </div>
        </Show>

        <Show when={pushStatus() === "running"}>
          <div class="push-progress">
            <span class="spinner"></span>
            <h3>Pushing Changes...</h3>
            <p>Committing and pushing to remote repository</p>
          </div>
        </Show>

        <Show when={pushStatus() === "success"}>
          <div
            class={`push-result ${commitHash() ? "push-success" : "push-warning"}`}
          >
            <Show when={commitHash()}>
              <div class="success-icon">✓</div>
              <h3>Successfully Pushed!</h3>
            </Show>
            <Show when={!commitHash()}>
              <div class="warning-icon">⚠️</div>
              <h3>Push Skipped</h3>
            </Show>
            <Show when={commitHash()}>
              <div class="commit-info">
                <span class="commit-label">Commit:</span>
                <code class="commit-hash">{commitHash()}</code>
              </div>
            </Show>

            {/* Amplify Job Status */}
            <Show when={amplifyJob()}>
              <div class="job-status-section">
                <h4>Amplify Deployment Job</h4>
                <div class="job-info">
                  <div class="job-detail">
                    <span class="job-label">Job ID:</span>
                    <code class="job-value">{amplifyJob()?.jobId}</code>
                  </div>
                  <div class="job-detail">
                    <span class="job-label">Status:</span>
                    <div class="job-status-container">
                      <span
                        class={`job-status-badge ${amplifyJob()?.status.toLowerCase()}`}
                      >
                        {amplifyJob()?.status}
                      </span>
                      <Show when={amplifyJob()?.status === "RUNNING"}>
                        <span class="spinner-small job-status-spinner"></span>
                      </Show>
                    </div>
                  </div>
                  <Show when={amplifyJob()?.startTime}>
                    <div class="job-detail">
                      <span class="job-label">Started:</span>
                      <span class="job-value">
                        {formatLocalDateTime(
                          amplifyJob()!.startTime!.toISOString(),
                        )}
                      </span>
                    </div>
                  </Show>
                  <Show when={amplifyJob()?.endTime}>
                    <div class="job-detail">
                      <span class="job-label">Ended:</span>
                      <span class="job-value">
                        {formatLocalDateTime(
                          amplifyJob()!.endTime!.toISOString(),
                        )}
                      </span>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            <Show when={jobCheckError() && !commitHash()}>
              <div class="job-check-info">
                <p class="info-message">
                  <Show when={checkingForJob()}>
                    <span class="spinner-small"></span>
                  </Show>
                  {jobCheckError()}
                </p>
              </div>
            </Show>

            <Show when={jobCheckError() && commitHash()}>
              <div class="job-check-error">
                <p class="error-hint">
                  <Show when={checkingForJob()}>
                    <span class="spinner-small"></span>
                  </Show>
                  {jobCheckError()}
                </p>
              </div>
            </Show>

            {/* Environment Variable Changes */}
            <Show when={getEnvVarChanges().length > 0}>
              <div class="env-var-changes-section">
                <h4>Environment Variable Changes</h4>
                <div class="env-var-changes-optimized">
                  <For each={getEnvVarChanges()}>
                    {(change) => (
                      <div class="env-var-change-optimized">
                        <div class="env-var-change-line">
                          <span class="env-var-scope">
                            {change.level.toUpperCase()}:
                          </span>
                          <code class="env-var-name">{change.key}</code>
                          <Show when={change.old_value && change.new_value}>
                            <span class="env-var-action">updated</span>
                            <span class="env-var-from-to">
                              <span class="env-var-old">
                                {change.old_value}
                              </span>
                              <span class="env-var-separator">→</span>
                              <span class="env-var-new">
                                {change.new_value}
                              </span>
                            </span>
                          </Show>
                          <Show when={change.old_value && !change.new_value}>
                            <span class="env-var-action removed">removed</span>
                            <span class="env-var-old-only">
                              was: {change.old_value}
                            </span>
                          </Show>
                          <Show when={!change.old_value && change.new_value}>
                            <span class="env-var-action added">added</span>
                            <span class="env-var-new-only">
                              {change.new_value}
                            </span>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
                <Show
                  when={
                    getEnvVarChanges().filter(
                      (c) =>
                        c.key !== "_LIVE_UPDATES" && c.key !== "_CUSTOM_IMAGE",
                    ).length > 0
                  }
                >
                  <button
                    class="revert-env-vars-button"
                    onClick={() => setShowRevertDialog(true)}
                  >
                    Revert Environment Variables
                  </button>
                  <p class="revert-note">
                    Note: _LIVE_UPDATES and _CUSTOM_IMAGE changes cannot be
                    reverted
                  </p>
                </Show>
              </div>
            </Show>

            {/* Build Config Changes */}
            <Show
              when={
                appState.repository.buildConfigChange &&
                appState.repository.buildConfigChange.location === "Cloud"
              }
            >
              <div class="build-config-change-section">
                <h4>Build Configuration Changes</h4>
                <div class="build-config-change-item">
                  <div class="build-config-change-header">
                    <span class="build-config-label">Location:</span>
                    <span class="build-config-value">
                      Cloud (AWS Amplify buildSpec)
                    </span>
                  </div>
                  <div class="build-config-change-values">
                    <div class="build-config-old">
                      <span class="build-config-label">Old Command:</span>
                      <code class="build-config-command">
                        {appState.repository.buildConfigChange?.old_command}
                      </code>
                    </div>
                    <span class="build-config-arrow">→</span>
                    <div class="build-config-new">
                      <span class="build-config-label">New Command:</span>
                      <code class="build-config-command">
                        {appState.repository.buildConfigChange?.new_command}
                      </code>
                    </div>
                  </div>
                </div>
                <button
                  class="revert-build-spec-button"
                  onClick={() => setShowBuildSpecRevertDialog(true)}
                >
                  Revert Build Configuration
                </button>
                <p class="revert-note">
                  This will restore the original buildSpec in AWS Amplify
                </p>
              </div>
            </Show>

            <Show when={commitHash()}>
              <div class="success-message">
                <p>
                  <strong>Next Steps:</strong>
                </p>
                <ul>
                  <li>
                    Monitor the deployment in the{" "}
                    <a
                      href={`https://${appState.awsConfig.selectedRegion}.console.aws.amazon.com/amplify/apps/${appState.amplifyResources.selectedApp?.app_id}/branches/${appState.amplifyResources.selectedBranch?.branch_name}/deployments`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      AWS Amplify Console
                    </a>
                  </li>
                  <li>
                    Verify Lambda functions are using the new runtime after
                    deployment completes
                  </li>
                </ul>
              </div>
            </Show>

            <Show when={!commitHash()}>
              <div class="success-message">
                {/* Show "What happened" only if no job is being tracked */}
                <Show when={!amplifyJob()}>
                  <p>
                    <strong>What happened:</strong>
                  </p>
                  <ul>
                    <li>All runtime configurations were already up to date</li>
                    <li>Environment variables were updated as needed</li>
                    <li>
                      No file changes were required, so no commit was created
                    </li>
                  </ul>
                  <Show when={lastFailedJob()}>
                    <Show when={lastFailedJob()?.status === "FAILED"}>
                      <div class="failed-job-notice">
                        <p class="failed-job-text">
                          <strong>Note:</strong> The last deployment job (ID:{" "}
                          {lastFailedJob()?.jobId}) failed. This might be why
                          your Lambda functions haven't been updated yet.
                        </p>
                        <div class="failed-job-actions">
                          <button
                            class="retry-job-button"
                            onClick={handleRetryJob}
                            disabled={retryingJob()}
                          >
                            {retryingJob()
                              ? "Retrying Job..."
                              : "Retry Failed Deployment"}
                          </button>
                          <a
                            href={`https://${appState.awsConfig.selectedRegion}.console.aws.amazon.com/amplify/apps/${appState.amplifyResources.selectedApp?.app_id}/branches/${appState.amplifyResources.selectedBranch?.branch_name}/deployments`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="console-link-button"
                          >
                            View in AWS Console
                          </a>
                        </div>
                      </div>
                    </Show>
                    <Show when={lastFailedJob()?.status === "SUCCEED"}>
                      <div class="failed-job-notice">
                        <p class="failed-job-text">
                          <strong>Note:</strong> The last deployment job (ID:{" "}
                          {lastFailedJob()?.jobId}) succeeded, but your Lambda
                          functions might have been updated outside of Amplify
                          after that deployment. You can trigger a new
                          deployment to ensure the runtime configurations are
                          applied.
                        </p>
                        <button
                          class="retry-job-button"
                          onClick={handleRetryJob}
                          disabled={retryingJob()}
                        >
                          {retryingJob()
                            ? "Starting Deployment..."
                            : "Trigger New Deployment"}
                        </button>
                      </div>
                    </Show>
                  </Show>
                  <Show when={!lastFailedJob()}>
                    <p class="no-deployment-note">
                      Since no code changes were made, your Lambda functions
                      should already be using the correct runtime versions.
                    </p>
                  </Show>
                </Show>

                {/* Show "Next Steps" if a job is being tracked (after retry) */}
                <Show when={amplifyJob()}>
                  <p>
                    <strong>Next Steps:</strong>
                  </p>
                  <ul>
                    <li>
                      Monitor the deployment in the{" "}
                      <a
                        href={`https://${appState.awsConfig.selectedRegion}.console.aws.amazon.com/amplify/apps/${appState.amplifyResources.selectedApp?.app_id}/branches/${appState.amplifyResources.selectedBranch?.branch_name}/deployments`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        AWS Amplify Console
                      </a>
                    </li>
                    <li>
                      Verify Lambda functions are using the new runtime after
                      deployment completes
                    </li>
                  </ul>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={pushStatus() === "failed"}>
          <div class="push-error">
            <div class="error-icon">✗</div>
            <h3>Push Failed</h3>
            <div class="error-details">
              <pre class="error-message">{pushError()}</pre>
            </div>
            <p class="error-hint">
              Common issues: authentication problems, network errors, or
              conflicts with remote branch. Ensure you have push access to the
              repository.
            </p>
            <button class="retry-button" onClick={handleInitiatePush}>
              Retry Push
            </button>
          </div>
        </Show>
      </div>

      {/* Actions */}
      <div class="actions">
        <button
          onClick={handleBack}
          class="secondary-button"
          disabled={pushStatus() === "running"}
        >
          Back
        </button>
        <Show when={pushStatus() === "success"}>
          <button onClick={handleFinish} class="primary-button">
            Finish
          </button>
        </Show>
      </div>

      {/* Revert Confirmation Dialog */}
      <Show when={showRevertDialog()}>
        <div class="revert-dialog-overlay">
          <div class="revert-dialog">
            <h3>Revert Environment Variables</h3>
            <p>
              Are you sure you want to revert the environment variable changes?
              This will restore the original values.
            </p>
            <div class="revert-changes-list">
              <For
                each={getEnvVarChanges().filter(
                  (c) => c.key !== "_LIVE_UPDATES" && c.key !== "_CUSTOM_IMAGE",
                )}
              >
                {(change) => (
                  <div class="revert-change-item">
                    <span class="revert-level-badge">{change.level}</span>
                    <code class="revert-key">{change.key}</code>
                    <span class="revert-arrow">←</span>
                    <span class="revert-value">{change.old_value}</span>
                  </div>
                )}
              </For>
            </div>
            <div class="revert-dialog-actions">
              <button
                class="cancel-revert-button"
                onClick={handleCancelRevert}
                disabled={revertInProgress()}
              >
                Cancel
              </button>
              <button
                class="confirm-revert-button"
                onClick={handleRevertEnvVars}
                disabled={revertInProgress()}
              >
                {revertInProgress() ? "Reverting..." : "Confirm Revert"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Build Spec Revert Confirmation Dialog */}
      <Show when={showBuildSpecRevertDialog()}>
        <div class="revert-dialog-overlay">
          <div class="revert-dialog">
            <h3>Revert Build Configuration</h3>
            <p>
              Are you sure you want to revert the build configuration changes?
              This will restore the original buildSpec in AWS Amplify.
            </p>
            <div class="revert-changes-list">
              <Show when={appState.repository.buildConfigChange}>
                <div class="revert-change-item">
                  <span class="revert-level-badge">cloud</span>
                  <code class="revert-key">Build Command</code>
                  <span class="revert-arrow">←</span>
                  <span class="revert-value">
                    {appState.repository.buildConfigChange?.old_command}
                  </span>
                </div>
              </Show>
            </div>
            <div class="revert-dialog-actions">
              <button
                class="cancel-revert-button"
                onClick={handleCancelBuildSpecRevert}
                disabled={revertBuildSpecInProgress()}
              >
                Cancel
              </button>
              <button
                class="confirm-revert-button"
                onClick={handleRevertBuildSpec}
                disabled={revertBuildSpecInProgress()}
              >
                {revertBuildSpecInProgress()
                  ? "Reverting..."
                  : "Confirm Revert"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Cleanup Dialog */}
      <CleanupDialog
        show={showCleanupDialog()}
        onClose={handleCleanupClose}
        resetToStep={2}
      />
    </div>
  );
}

export default PushStep;
