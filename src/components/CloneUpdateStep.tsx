import { createSignal, Show, onMount, createEffect } from "solid-js";
import type { PackageManager, BackendType, FileChange } from "../types";
import { appState, setAppState } from "../store/appStore";
import { WebContainerService } from "../services/container/webContainerService";
import { FileService } from "../services/container/fileService";
import { DetectionService } from "../services/container/detectionService";
import { ProcessService } from "../services/container/processService";
import { GitService, type GitCredentials } from "../services/git/gitService";
import { Gen2Updater } from "../services/runtime/gen2Updater";
import { AmplifyGen1Service } from "../services/amplify/gen1Service";
import { RuntimeService } from "../services/runtime/runtimeService";
import { AmplifyService } from "../services/aws/amplifyService";
import { CredentialService } from "../services/aws/credentialService";
import { OperationCard } from "./common/OperationCard";
import type { OperationStatus } from "./common/OperationCard";
import { StatusMessage } from "./common/StatusMessage";
import { OperationFeedback } from "./common/OperationFeedback";
import { WizardStep } from "./common/WizardStep";
import "./shared-tailwind.css";

interface CloneUpdateStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

// Services singleton instances
let fileService: FileService | null = null;
let detectionService: DetectionService | null = null;
let processService: ProcessService | null = null;
let gitService: GitService | null = null;
let gen2Updater: Gen2Updater | null = null;
let gen1Service: AmplifyGen1Service | null = null;
let runtimeService: RuntimeService | null = null;
let amplifyService: AmplifyService | null = null;
let credentialService: CredentialService | null = null;

// Initialize services
async function initializeServices() {
  if (!fileService) {
    // Get WebContainer instance (singleton, already booted)
    const container = await WebContainerService.getInstance();

    fileService = new FileService(container);
    detectionService = new DetectionService(fileService);
    processService = new ProcessService(container);
    gitService = new GitService(container);
    gen2Updater = new Gen2Updater(fileService);
    gen1Service = new AmplifyGen1Service(fileService);
    runtimeService = new RuntimeService();
    credentialService = new CredentialService();

    // AmplifyService gets credentials from CredentialService internally
    amplifyService = new AmplifyService();
  }

  return {
    fileService: fileService!,
    detectionService: detectionService!,
    processService: processService!,
    gitService: gitService!,
    gen2Updater: gen2Updater!,
    gen1Service: gen1Service!,
    runtimeService: runtimeService!,
    amplifyService: amplifyService!,
    credentialService: credentialService!,
  };
}

export function CloneUpdateStep(props: CloneUpdateStepProps) {
  // Operation states
  const [cloneStatus, setCloneStatus] =
    createSignal<OperationStatus>("pending");
  const [prepareStatus, setPrepareStatus] =
    createSignal<OperationStatus>("pending");
  const [updateStatus, setUpdateStatus] =
    createSignal<OperationStatus>("pending");
  const [envVarStatus, setEnvVarStatus] =
    createSignal<OperationStatus>("pending");
  const [buildConfigStatus, setBuildConfigStatus] =
    createSignal<OperationStatus>("pending");
  const [gen2EnvVarStatus, setGen2EnvVarStatus] =
    createSignal<OperationStatus>("pending");

  // Error messages


  // Git credentials - loaded from credential service
  const [gitCredentials, setGitCredentials] =
    createSignal<GitCredentials | null>(null);

  // Function to check if any operation is currently running
  const isAnyOperationRunning = () => {
    return (
      cloneStatus() === "running" ||
      prepareStatus() === "running" ||
      updateStatus() === "running" ||
      buildConfigStatus() === "running" ||
      gen2EnvVarStatus() === "running" ||
      envVarStatus() === "running"
    );
  };

  // Sync running state to store for global access
  createEffect(() => {
    const isRunning = isAnyOperationRunning();
    setAppState("repository", "isOperationRunning", isRunning);
  });

  // Function to handle navigation - delegate to parent
  const handleBack = () => {
    if (isAnyOperationRunning()) {
      return;
    }
    props.onBack?.();
  };

  // Restore operation states from store on mount
  onMount(() => {
    const opStatus = appState.repository.operationStatus;

    if (opStatus.cloneComplete) {
      setCloneStatus("success");
    }
    if (opStatus.prepareComplete) {
      setPrepareStatus("success");
    }
    if (opStatus.updateComplete) {
      setUpdateStatus("success");
    }
    if (opStatus.buildConfigComplete) {
      setBuildConfigStatus("success");
    }
    if (opStatus.envVarComplete) {
      setEnvVarStatus("success");
    }
    if ((opStatus as any).gen2EnvVarComplete) {
      setGen2EnvVarStatus("success");
    }

    // Force layout recalculation
    setTimeout(() => {
      const element = document.querySelector(".clone-update-step");
      if (element) {
        element.getBoundingClientRect();
      }
    }, 10);
  });

  // Check if error is a permission/authentication issue
  const isPermissionError = (error: string): boolean => {
    const permissionPatterns = [
      "Permission denied",
      "permission denied",
      "Authentication failed",
      "authentication failed",
      "could not read Username",
      "Could not read from remote repository",
      "fatal: repository",
      "not found",
      "access denied",
      "Access denied",
      "403",
      "401",
      "Invalid username or password",
      "Host key verification failed",
      "publickey",
    ];
    return permissionPatterns.some((pattern) => error.includes(pattern));
  };

  /**
   * Fetch the latest version of a package from the npm registry
   */
  const fetchLatestVersion = async (packageName: string): Promise<string> => {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
      const data = await response.json();
      return data.version;
    } catch (error) {
      console.warn(`Failed to fetch latest version for ${packageName}:`, error);
      return 'latest';
    }
  };

  // Format clone error with helpful guidance
  const formatCloneError = (error: string, repoUrl: string): string => {
    if (isPermissionError(error)) {
      const isHttps = repoUrl.startsWith("https://");
      const isSsh = repoUrl.startsWith("git@") || repoUrl.includes("ssh://");

      let guidance = `Git clone failed due to permission/authentication issue.\n\n`;
      guidance += `Repository: ${repoUrl}\n\n`;
      guidance += `For WebContainer-based cloning:\n\n`;

      if (isHttps || isSsh) {
        guidance += `• HTTPS authentication required (Personal Access Token)\n`;
        guidance += `• You will be prompted to enter GitHub username and PAT\n`;
        guidance += `• Create a PAT at: https://github.com/settings/tokens\n`;
        guidance += `• Required scopes: repo (for private repos) or public_repo (for public repos)\n`;
      }

      return guidance;
    }
    return error;
  };

  // Get Git credentials - try stored credentials first, then prompt if needed
  const getGitCredentials = async (): Promise<GitCredentials> => {
    // Initialize services to access credentialService
    const services = await initializeServices();

    // Try to get stored credentials first
    const storedCreds = services.credentialService.getGitCredentials();
    if (storedCreds) {
      return {
        username: storedCreds.username,
        password: storedCreds.token,
      };
    }

    // Fall back to prompting if no stored credentials
    return new Promise((resolve, reject) => {
      const username = prompt(
        "GitHub Authentication Required\n\n" +
        "No credentials found. Please configure credentials in Step 1.\n\n" +
        "Enter your GitHub username:",
      );
      if (!username) {
        reject(
          new Error(
            "GitHub username is required for cloning. Please go back to Step 1 to configure credentials.",
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
            "Personal Access Token is required for cloning. Please go back to Step 1 to configure credentials.",
          ),
        );
        return;
      }

      resolve({ username, password });
    });
  };

  // Clone repository and detect configuration
  const handleClone = async () => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;

    if (!selectedApp || !selectedBranch) {
      setAppState("repository", "cloneError", "No app or branch selected");
      return;
    }

    setCloneStatus("running");
    setAppState("repository", "cloneError", null);
    setAppState("repository", "operationStatus", "cloneComplete", false);

    try {
      // Initialize services
      const services = await initializeServices();

      // Get Git credentials (from stored credentials or prompt)
      let creds = gitCredentials();
      if (!creds) {
        try {
          creds = await getGitCredentials();
          setGitCredentials(creds);
        } catch (e) {
          setAppState("repository", "cloneError", String(e));
          setCloneStatus("failed");
          return;
        }
      }

      // Step 1: Clone repository
      const repoPath = await services.gitService.cloneRepository(
        selectedApp.repository,
        selectedBranch.branch_name,
        creds,
        (progress) => {
          console.log("[Clone Progress]", progress);
        },
      );

      console.log("[Clone] Repository cloned to:", repoPath);

      // Store the relative path (WebContainer works with relative paths)
      setAppState("repository", "clonePath", repoPath);

      // Step 2: Detect configuration
      try {
        // Detect package manager
        const packageManager =
          await services.detectionService.detectPackageManager(repoPath);
        setAppState("repository", "packageManager", packageManager);

        // Detect backend type
        const backendType =
          await services.detectionService.detectBackendType(repoPath);
        setAppState("repository", "backendType", backendType);

        setCloneStatus("success");
        setAppState("repository", "operationStatus", "cloneComplete", true);
      } catch (e) {
        setAppState(
          "repository",
          "cloneError",
          `Clone succeeded but configuration detection failed: ${String(e)}`,
        );
        setCloneStatus("failed");
      }
    } catch (e) {
      const formattedError = formatCloneError(
        String(e),
        selectedApp.repository,
      );
      setAppState("repository", "cloneError", formattedError);
      setCloneStatus("failed");
    }
  };

  // Prepare project: install dependencies and upgrade packages
  const handlePrepare = async () => {
    const clonePath = appState.repository.clonePath;
    const packageManager = appState.repository.packageManager;

    if (!clonePath || !packageManager) {
      setAppState(
        "repository",
        "upgradeError",
        "Missing required information for preparation",
      );
      return;
    }

    setPrepareStatus("running");
    setAppState("repository", "upgradeError", null);
    setAppState("repository", "upgradeMessage", null);
    setAppState("repository", "operationStatus", "prepareComplete", false);
    setAppState("repository", "operationStatus", "upgradeComplete", false);

    try {
      const services = await initializeServices();
      const container = await WebContainerService.getInstance();

      const packagesToUpgrade = [
        "@aws-amplify/backend",
        "@aws-amplify/backend-cli",
      ];
      const foundChanges: FileChange[] = [];

      // Step 1: Read current package.json
      const packageJsonPath = `${clonePath}/package.json`;
      const packageJsonContent = await container.fs.readFile(
        packageJsonPath,
        "utf-8"
      );
      const pkg = JSON.parse(packageJsonContent);

      // Step 2: Fetch latest versions and compare
      for (const pkgName of packagesToUpgrade) {
        // Get current version from package.json (prefer devDependencies then dependencies)
        const currentVersion =
          pkg.devDependencies?.[pkgName] || pkg.dependencies?.[pkgName];

        if (!currentVersion) continue;

        // Fetch latest version from npm registry directly
        const latestVersion = await fetchLatestVersion(pkgName);

        if (latestVersion !== 'latest') {
          // Clean up current version (remove ^, ~, etc. for exact comparison if needed, but usually we just want latest)
          // For simplicity, we compare latest with the string in package.json
          if (currentVersion !== latestVersion && !currentVersion.includes(latestVersion)) {
            foundChanges.push({
              path: "package.json",
              change_type: "Update",
              old_value: `${pkgName}: ${currentVersion}`,
              new_value: `${pkgName}: ${latestVersion}`,
            });

            // Update package.json object
            if (pkg.devDependencies?.[pkgName]) {
              pkg.devDependencies[pkgName] = latestVersion;
            } else if (pkg.dependencies?.[pkgName]) {
              pkg.dependencies[pkgName] = latestVersion;
            }
          }
        }
      }

      // Step 3: If changes found, write back package.json and run install to sync lock file
      if (foundChanges.length > 0) {
        await container.fs.writeFile(
          packageJsonPath,
          JSON.stringify(pkg, null, 2)
        );

        // Run install to sync lock file
        const installResult = await services.processService.runCommand(
          packageManager,
          ["install"],
          clonePath
        );

        if (installResult.exitCode !== 0) {
          throw new Error(
            `Failed to install updated packages and sync lock file: ${installResult.stderr || installResult.stdout}`
          );
        }

        setAppState("repository", "upgradeMessage", "Amplify backend packages upgraded to latest and lock file synced");
      } else {
        setAppState("repository", "upgradeMessage", "Amplify backend packages are already up to date");
      }

      setAppState("repository", "upgradeChanges", foundChanges);
      setPrepareStatus("success");
      setAppState("repository", "operationStatus", "prepareComplete", true);
      setAppState("repository", "operationStatus", "upgradeComplete", true);
    } catch (e) {
      console.error("[Prepare Error]", e);
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e, null, 2);
      setAppState("repository", "upgradeError", errorMessage);
      setPrepareStatus("failed");
    }
  };

  // Update backend runtime
  const handleUpdate = async () => {
    const clonePath = appState.repository.clonePath;
    const backendType = appState.repository.backendType;
    const targetRuntime = appState.runtimeInfo.targetRuntime;

    if (!clonePath || !backendType || !targetRuntime) {
      setAppState("repository", "updateError", "Missing required information for update");
      return;
    }

    setUpdateStatus("running");
    setAppState("repository", "updateError", null);
    setAppState("repository", "operationStatus", "updateComplete", false);

    try {
      const services = await initializeServices();

      if (backendType === "Gen2") {
        // Update Gen2 runtimes in resource.ts files
        const result = await services.gen2Updater.updateRuntimes(
          clonePath,
          targetRuntime,
        );

        // Convert to format expected by UI
        const changes: FileChange[] = result.changes.map((c) => ({
          path: c.filePath,
          change_type: c.changeType,
          old_value: c.oldValue,
          new_value: c.newValue,
        }));

        setAppState("repository", "changes", changes);
        setUpdateStatus("success");
        setAppState("repository", "operationStatus", "updateComplete", true);
      } else {
        // Gen1: Update CloudFormation templates
        const result = await services.gen1Service.updateGen1Backend(
          clonePath,
          targetRuntime,
        );

        const changes: FileChange[] = result.changes.map((c: any) => ({
          path: c.path,
          change_type: "runtime_update",
          old_value: c.old_value,
          new_value: c.new_value,
        }));

        setAppState("repository", "changes", changes);
        setUpdateStatus("success");
        setAppState("repository", "operationStatus", "updateComplete", true);
      }
    } catch (e) {
      setAppState("repository", "updateError", String(e));
      setUpdateStatus("failed");
    }
  };

  // Update Gen2 build configuration
  const handleBuildConfigUpdate = async () => {
    const clonePath = appState.repository.clonePath;
    const selectedApp = appState.amplifyResources.selectedApp;

    if (!clonePath || !selectedApp) {
      setAppState(
        "repository",
        "buildConfigError",
        "Missing required information for build config update",
      );
      return;
    }

    setBuildConfigStatus("running");
    setAppState("repository", "buildConfigError", null);
    setAppState("repository", "buildConfigMessage", null);
    setAppState("repository", "operationStatus", "buildConfigComplete", false);

    try {
      const services = await initializeServices();

      // Read amplify.yml from repository
      const amplifyYmlPath = `${clonePath}/amplify.yml`;
      let amplifyYmlContent: string;

      try {
        amplifyYmlContent = await services.fileService.readFile(amplifyYmlPath);
      } catch {
        // If amplify.yml doesn't exist in repository, skip cloud update (not implemented in WASM version)
        setAppState(
          "repository",
          "buildConfigError",
          "amplify.yml not found in repository. Cloud buildSpec updates are not supported in the web version.",
        );
        setBuildConfigStatus("failed");
        return;
      }

      // Update local amplify.yml
      if (
        amplifyYmlContent.includes("npx ampx generate outputs") &&
        !amplifyYmlContent.includes("pipeline-deploy")
      ) {
        const updatedContent = amplifyYmlContent.replace(
          /- npx ampx generate outputs[^\n]*/g,
          "- npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID",
        );

        await services.fileService.writeFile(amplifyYmlPath, updatedContent);

        setAppState("repository", "buildConfigChange", {
          location: "File" as const,
          old_command: "- npx ampx generate outputs",
          new_command:
            "- npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID",
        });

        setAppState(
          "repository",
          "buildConfigMessage",
          "Build configuration updated in amplify.yml",
        );
        setBuildConfigStatus("success");
        setAppState(
          "repository",
          "operationStatus",
          "buildConfigComplete",
          true,
        );
      } else {
        setAppState(
          "repository",
          "buildConfigMessage",
          "Build configuration already up to date",
        );
        setBuildConfigStatus("success");
        setAppState(
          "repository",
          "operationStatus",
          "buildConfigComplete",
          true,
        );
      }
    } catch (e) {
      console.error("Build config update failed:", e);
      setAppState(
        "repository",
        "buildConfigError",
        `Build configuration update failed: ${String(e)}`,
      );
      setBuildConfigStatus("failed");
    }
  };

  // Update environment variable for Gen2 apps
  // Update environment variables for Gen1 (checks _LIVE_UPDATES, AMPLIFY_BACKEND_PULL_ONLY, _CUSTOM_IMAGE)
  const handleGen1EnvVarUpdate = async () => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !selectedBranch || !region) {
      setAppState(
        "repository",
        "gen2EnvVarError",
        "Missing required information for environment variable update",
      );
      return;
    }

    setGen2EnvVarStatus("running");
    setAppState("repository", "gen2EnvVarError", null);
    setAppState("repository", "gen2EnvVarMessage", null);
    setAppState(
      "repository",
      "operationStatus",
      "gen2EnvVarComplete",
      false,
    );

    try {
      const services = await initializeServices();

      // Check all Gen1 env vars: _LIVE_UPDATES, AMPLIFY_BACKEND_PULL_ONLY, _CUSTOM_IMAGE
      const result = await services.amplifyService!.removeCustomImageIfLegacy(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
      );

      if (result.updated) {
        setAppState("repository", "gen2EnvVarMessage", result.changes.join("\n"));
      } else {
        setAppState(
          "repository",
          "gen2EnvVarMessage",
          "Environment variables already properly configured",
        );
      }

      setGen2EnvVarStatus("success");
      setAppState(
        "repository",
        "operationStatus",
        "gen2EnvVarComplete",
        true,
      );
    } catch (e) {
      setAppState("repository", "gen2EnvVarError", String(e));
      setGen2EnvVarStatus("failed");
    }
  };

  // Update environment variables for Gen2 (only checks _CUSTOM_IMAGE)
  const handleGen2EnvVarUpdate = async () => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !selectedBranch || !region) {
      setAppState(
        "repository",
        "gen2EnvVarError",
        "Missing required information for environment variable update",
      );
      return;
    }

    setGen2EnvVarStatus("running");
    setAppState("repository", "gen2EnvVarError", null);
    setAppState("repository", "gen2EnvVarMessage", null);
    setAppState(
      "repository",
      "operationStatus",
      "gen2EnvVarComplete",
      false,
    );

    try {
      const services = await initializeServices();

      // Only check _CUSTOM_IMAGE for Gen2
      const result = await services.amplifyService!.removeCustomImageOnly(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
      );

      if (result.updated) {
        setAppState("repository", "gen2EnvVarMessage", result.changes.join("\n"));
      } else {
        setAppState(
          "repository",
          "gen2EnvVarMessage",
          "Environment variables already properly configured",
        );
      }

      setGen2EnvVarStatus("success");
      setAppState(
        "repository",
        "operationStatus",
        "gen2EnvVarComplete",
        true,
      );
    } catch (e) {
      setAppState("repository", "gen2EnvVarError", String(e));
      setGen2EnvVarStatus("failed");
    }
  };

  // For Gen2, user can continue without build test
  const canContinue = () => {
    if (isAnyOperationRunning()) {
      return false;
    }

    const backendType = appState.repository.backendType;
    // Gen1: clone + update + env vars
    if (backendType === "Gen1") {
      return (
        cloneStatus() === "success" &&
        updateStatus() === "success" &&
        gen2EnvVarStatus() === "success"
      );
    }
    // Gen2: clone + update + env vars + build config + prepare
    return (
      cloneStatus() === "success" &&
      updateStatus() === "success" &&
      gen2EnvVarStatus() === "success" &&
      buildConfigStatus() === "success" &&
      prepareStatus() === "success"
    );
  };

  const handleContinue = () => {
    if (isAnyOperationRunning()) {
      return;
    }
    if (canContinue() && props.onComplete) {
      props.onComplete();
    }
  };

  const getPackageManagerDisplay = (pm: PackageManager | null) => {
    if (!pm) return "Unknown";
    const map: Record<string, string> = {
      Npm: "npm",
      Yarn: "yarn",
      Pnpm: "pnpm",
      Bun: "bun",
    };
    return map[pm] || pm;
  };

  const getBackendTypeDisplay = (bt: BackendType | null) => {
    if (!bt) return "Unknown";
    return bt === "Gen2" ? "Gen 2" : "Gen 1";
  };



  return (
    <WizardStep
      title="Clone & Update"
      description="Clone the repository, detect project configuration, and update runtime settings."
      onNext={handleContinue}
      onBack={handleBack}
      nextDisabled={!canContinue()}
      backDisabled={isAnyOperationRunning()}
      isLoading={isAnyOperationRunning()}
    >
      <div class="space-y-6">
        {/* Selected App/Branch Summary */}
        <div class="bg-white dark:bg-[#2a2a2a] rounded-xl px-6 py-4 border border-[#eee] dark:border-[#444] shadow-sm mb-4 flex flex-wrap gap-8 items-center justify-between">
          <div class="flex flex-wrap gap-8">
            <div class="flex flex-col">
              <span class="text-[0.7rem] font-bold text-[#999] dark:text-[#666] uppercase tracking-wider">
                App:
              </span>
              <span class="text-[0.95rem] font-semibold text-[#333] dark:text-[#eee]">
                {appState.amplifyResources.selectedApp?.name}
              </span>
            </div>
            <div class="flex flex-col">
              <span class="text-[0.7rem] font-bold text-[#999] dark:text-[#666] uppercase tracking-wider">
                Branch:
              </span>
              <span class="text-[0.95rem] font-semibold text-[#333] dark:text-[#eee]">
                {appState.amplifyResources.selectedBranch?.branch_name}
              </span>
            </div>
          </div>
          <div class="flex flex-col items-end">
            <span class="text-[0.7rem] font-bold text-[#999] dark:text-[#666] uppercase tracking-wider">
              Target Runtime:
            </span>
            <span class="px-3 py-0.5 bg-[#e3f2fd] dark:bg-[#1a3a5c] text-[#1976d2] dark:text-[#64b5f6] rounded-full text-[0.8rem] font-bold border border-[#bbdefb] dark:border-[#1a3a5c]">
              {appState.runtimeInfo.targetRuntime}
            </span>
          </div>
        </div>

        {/* Operations */}
        <div class="flex flex-col gap-4">
          {/* Step 1: Clone Repository & Detect Configuration */}
          <OperationCard
            stepNumber={1}
            title="Clone Repository"
            description="Clone the repository and detect project configuration"
            status={cloneStatus()}
            onAction={handleClone}
            actionLabel="Clone"
            runningLabel="Cloning..."
            successLabel="✓ Cloned"
            failedLabel="✗ Failed"
            error={appState.repository.cloneError}
          >
            <OperationFeedback
              status={cloneStatus()}
              title="Repository Details"
              noChanges={true}
              noChangesMessage={
                <div class="flex flex-wrap gap-x-8 gap-y-4 m-0 text-[0.85rem] leading-relaxed break-words font-medium">
                  <div class="flex items-center gap-2">
                    <span>
                      Package Manager:
                    </span>
                    <span class="px-2 py-0.5 bg-[#f5f5f5] dark:bg-[#333] text-[#333] dark:text-[#eee] rounded text-[0.75rem] font-bold border border-[#ddd] dark:border-[#555]">
                      {getPackageManagerDisplay(
                        appState.repository.packageManager,
                      )}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[0.85rem] text-[#666] dark:text-[#aaa]">
                      Backend Type:
                    </span>
                    <span class="px-2 py-0.5 bg-[#f5f5f5] dark:bg-[#333] text-[#333] dark:text-[#eee] rounded text-[0.75rem] font-bold border border-[#ddd] dark:border-[#555]">
                      {getBackendTypeDisplay(appState.repository.backendType)}
                    </span>
                  </div>
                </div>
              }
            />
          </OperationCard>

          {/* Step 2: Update Runtime (both Gen1 and Gen2, shown after clone) */}
          <Show when={cloneStatus() === "success"}>
            <OperationCard
              stepNumber={2}
              title="Update Runtime"
              description={`Update Lambda runtime configurations to ${appState.runtimeInfo.targetRuntime}`}
              status={updateStatus()}
              onAction={handleUpdate}
              actionLabel="Update"
              runningLabel="Updating..."
              successLabel="✓ Updated"
              failedLabel="✗ Failed"
              error={appState.repository.updateError}
            >
              <OperationFeedback
                status={updateStatus()}
                changes={appState.repository.changes}
                noChangesMessage="No outdated runtimes are manually configured. Runtimes will be updated with the latest amplify backend version."
              />
            </OperationCard>
          </Show>

          {/* Step 3: Update Environment Variables (both Gen1 and Gen2, shown after update) */}
          <Show when={updateStatus() === "success"}>
            <OperationCard
              stepNumber={3}
              title="Update Environment Variables"
              description={
                <Show
                  when={appState.repository.backendType === "Gen1"}
                  fallback="Check and update legacy _CUSTOM_IMAGE variable"
                >
                  Check and update environment variables (_CUSTOM_IMAGE,
                  _LIVE_UPDATES, AMPLIFY_BACKEND_PULL_ONLY)
                </Show>
              }
              status={gen2EnvVarStatus()}
              onAction={
                appState.repository.backendType === "Gen1"
                  ? handleGen1EnvVarUpdate
                  : handleGen2EnvVarUpdate
              }
              actionLabel="Update"
              runningLabel="Updating..."
              successLabel="✓ Updated"
              failedLabel="✗ Failed"
              error={appState.repository.gen2EnvVarError}
            >
              <OperationFeedback
                status={gen2EnvVarStatus()}
                message={appState.repository.gen2EnvVarMessage?.split("\n").filter(line => line.trim()) || null}
                noChanges={!!appState.repository.gen2EnvVarMessage?.includes("configured")}
              />
            </OperationCard>
          </Show>

          {/* Step 4: Update Build Configuration (Gen2 only, after env vars) */}
          <Show
            when={
              appState.repository.backendType === "Gen2" &&
              gen2EnvVarStatus() === "success"
            }
          >
            <OperationCard
              stepNumber={4}
              title="Update Build Configuration"
              description="Update Amplify build command to use pipeline-deploy"
              status={buildConfigStatus()}
              onAction={handleBuildConfigUpdate}
              actionLabel="Update"
              runningLabel="Updating..."
              successLabel="✓ Updated"
              failedLabel="✗ Failed"
              error={appState.repository.buildConfigError}
            >
              <OperationFeedback
                status={buildConfigStatus()}
                noChanges={!!appState.repository.buildConfigMessage?.includes("already up to date")}
                noChangesMessage={appState.repository.buildConfigMessage}
                message={
                  appState.repository.buildConfigChange ? (
                    <div class="flex flex-col gap-3">
                      <div class="flex items-center gap-2 text-[0.7rem] text-[#999] dark:text-[#666] uppercase tracking-widest font-bold">
                        Location:{" "}
                        <span class="text-[#333] dark:text-[#eee] normal-case">
                          {appState.repository.buildConfigChange?.location ===
                            "Cloud"
                            ? "AWS Cloud (amplify.yml)"
                            : appState.repository.buildConfigChange?.location}
                        </span>
                      </div>
                      <div class="flex flex-col gap-1.5 p-3 bg-[#fafafa] dark:bg-[#333] rounded border border-[#f0f0f0] dark:border-[#444]">
                        <div class="flex flex-col gap-1">
                          <span class="text-[0.65rem] font-bold text-[#c62828] dark:text-[#ef5350] uppercase tracking-wider">
                            Old Command
                          </span>
                          <code class="text-[0.75rem] text-[#666] dark:text-[#aaa] font-mono break-all line-through opacity-70">
                            {appState.repository.buildConfigChange?.old_command}
                          </code>
                        </div>
                        <div class="pt-1.5 border-t border-[#f5f5f5] dark:border-[#444] flex flex-col gap-1">
                          <span class="text-[0.65rem] font-bold text-[#2e7d32] dark:text-[#81c784] uppercase tracking-wider">
                            New Command
                          </span>
                          <code class="text-[0.8rem] text-green-700 dark:text-green-400 font-mono break-all font-bold">
                            {appState.repository.buildConfigChange?.new_command}
                          </code>
                        </div>
                      </div>
                    </div>
                  ) : (
                    appState.repository.buildConfigMessage
                  )
                }
              />
            </OperationCard>
          </Show>

          {/* Step 5: Package Upgrade/Prepare (Gen2 only, after build config) */}
          <Show
            when={
              appState.repository.backendType === "Gen2" &&
              buildConfigStatus() === "success"
            }
          >
            <OperationCard
              stepNumber={5}
              title="Upgrade Amplify backend packages"
              description="Generate updated package.json and lock file"
              status={prepareStatus()}
              onAction={handlePrepare}
              actionLabel="Upgrade"
              runningLabel="Upgrading..."
              successLabel="✓ Upgraded"
              failedLabel="✗ Failed"
              error={appState.repository.upgradeError}
            >
              <OperationFeedback
                status={prepareStatus()}
                changes={appState.repository.upgradeChanges}
                message={appState.repository.upgradeMessage}
                noChanges={appState.repository.upgradeChanges.length === 0}
              />
            </OperationCard>
          </Show>
        </div>
      </div>
    </WizardStep>
  );
}

export default CloneUpdateStep;
