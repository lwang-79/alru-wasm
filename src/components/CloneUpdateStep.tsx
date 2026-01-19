import { createSignal, Show, For, onMount, createEffect } from "solid-js";
import type {
  PackageManager,
  BackendType,
  BuildStatus,
  FileChange,
} from "../types";
import { appState, setAppState } from "../store/appStore";
import { WebContainerService } from "../services/container/webContainerService";
import { FileService } from "../services/container/fileService";
import { DetectionService } from "../services/container/detectionService";
import { ProcessService } from "../services/container/processService";
import { GitService, type GitCredentials } from "../services/git/gitService";
import { Gen2Updater } from "../services/runtime/gen2Updater";
import { RuntimeService } from "../services/runtime/runtimeService";
import { AmplifyService } from "../services/aws/amplifyService";
import { CredentialService } from "../services/aws/credentialService";
import "./shared.css";
import "./CloneUpdateStep.css";

interface CloneUpdateStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

type OperationStatus = "pending" | "running" | "success" | "failed";

// Services singleton instances
let fileService: FileService | null = null;
let detectionService: DetectionService | null = null;
let processService: ProcessService | null = null;
let gitService: GitService | null = null;
let gen2Updater: Gen2Updater | null = null;
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

  // Build verification status - use store state for persistence
  const buildStatus = () => appState.repository.gen2BuildVerificationStatus;
  const setBuildStatus = (status: BuildStatus) =>
    setAppState("repository", "gen2BuildVerificationStatus", status);

  const [envVarStatus, setEnvVarStatus] =
    createSignal<OperationStatus>("pending");
  const [buildConfigStatus, setBuildConfigStatus] =
    createSignal<OperationStatus>("pending");
  const [gen2EnvVarStatus, setGen2EnvVarStatus] =
    createSignal<OperationStatus>("pending");

  // Error messages
  const [cloneError, setCloneError] = createSignal<string | null>(null);
  const [prepareError, setPrepareError] = createSignal<string | null>(null);
  const [prepareOutput, setPrepareOutput] = createSignal<string>("");
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = createSignal<string | null>(null);
  const [buildError, setBuildError] = createSignal<string | null>(null);
  const [envVarError, setEnvVarError] = createSignal<string | null>(null);
  const [envVarMessage, setEnvVarMessage] = createSignal<string | null>(null);
  const [buildConfigError, setBuildConfigError] = createSignal<string | null>(
    null,
  );
  const [buildConfigMessage, setBuildConfigMessage] = createSignal<
    string | null
  >(null);
  const [gen2EnvVarError, setGen2EnvVarError] = createSignal<string | null>(
    null,
  );
  const [gen2EnvVarMessage, setGen2EnvVarMessage] = createSignal<string | null>(
    null,
  );

  // Build output
  const [buildOutput, setBuildOutput] = createSignal<string>("");

  // Copy path feedback
  const [pathCopied, setPathCopied] = createSignal(false);

  // Gen2 sandbox option - use store state for persistence
  const gen2SandboxEnabled = () => appState.repository.gen2SandboxEnabled;
  const setGen2SandboxEnabled = (enabled: boolean) =>
    setAppState("repository", "gen2SandboxEnabled", enabled);

  // Gen2 sandbox status - use store state for persistence
  const sandboxStatus = () => appState.repository.gen2SandboxStatus;
  const setSandboxStatus = (status: BuildStatus) =>
    setAppState("repository", "gen2SandboxStatus", status);

  const [sandboxError, setSandboxError] = createSignal<string | null>(null);
  const [sandboxOutput, setSandboxOutput] = createSignal<string>("");

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
      sandboxStatus() === "running" ||
      buildStatus() === "running" ||
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
    if (opStatus.buildComplete) {
      setBuildStatus("success");
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

  // Auto-scroll prepare output
  createEffect(() => {
    const output = prepareOutput();
    if (output) {
      const pre = document.getElementById("prepare-output-pre");
      if (pre) {
        pre.scrollTop = pre.scrollHeight;
      }
    }
  });

  // Auto-scroll sandbox output
  createEffect(() => {
    const output = sandboxOutput();
    if (output) {
      const pre = document.getElementById("sandbox-output-pre");
      if (pre) {
        pre.scrollTop = pre.scrollHeight;
      }
    }
  });

  // Auto-scroll build output
  createEffect(() => {
    const output = buildOutput();
    if (output) {
      const pre = document.getElementById("build-output-pre");
      if (pre) {
        pre.scrollTop = pre.scrollHeight;
      }
    }
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
      setCloneError("No app or branch selected");
      return;
    }

    setCloneStatus("running");
    setCloneError(null);
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
          setCloneError(String(e));
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
        setCloneError(
          `Clone succeeded but configuration detection failed: ${String(e)}`,
        );
        setCloneStatus("failed");
      }
    } catch (e) {
      const formattedError = formatCloneError(
        String(e),
        selectedApp.repository,
      );
      setCloneError(formattedError);
      setCloneStatus("failed");
    }
  };

  // Prepare project: install dependencies and upgrade packages
  const handlePrepare = async () => {
    const clonePath = appState.repository.clonePath;
    const packageManager = appState.repository.packageManager;
    const backendType = appState.repository.backendType;

    console.log("[Prepare] Starting with clonePath:", clonePath);
    console.log("[Prepare] Package manager:", packageManager);
    console.log("[Prepare] Backend type:", backendType);

    if (!clonePath || !packageManager) {
      setPrepareError("Missing required information for preparation");
      return;
    }

    setPrepareStatus("running");
    setPrepareError(null);
    setPrepareOutput("");
    setAppState("repository", "operationStatus", "prepareComplete", false);
    setAppState("repository", "operationStatus", "upgradeComplete", false);

    try {
      const services = await initializeServices();

      const onOutput = (line: string) => {
        setPrepareOutput((prev) => prev + line);
      };

      if (backendType === "Gen1") {
        // Gen1: Not fully supported yet, but install dependencies
        onOutput("Installing dependencies...\n");
        await services.processService.installDependencies(
          packageManager,
          clonePath,
          onOutput,
        );

        // TODO: Gen1 Amplify setup (amplify pull, env checkout) - defer to later
        setPrepareError(
          "Gen1 support is not fully implemented yet. Dependencies installed, but Amplify environment setup is pending.",
        );
        setPrepareStatus("success");
      } else {
        // Gen2: Install/upgrade Amplify packages to latest versions
        onOutput(
          "Installing/upgrading @aws-amplify/backend packages to latest...\n",
        );

        // Determine the correct install command based on package manager
        let installCmd: string;
        let installArgs: string[];

        if (packageManager === "npm") {
          installCmd = "npm";
          installArgs = [
            "install",
            "@aws-amplify/backend@latest",
            "@aws-amplify/backend-cli@latest",
            "--save-dev",
          ];
        } else if (packageManager === "yarn") {
          installCmd = "yarn";
          installArgs = [
            "add",
            "@aws-amplify/backend@latest",
            "@aws-amplify/backend-cli@latest",
            "--dev",
          ];
        } else if (packageManager === "pnpm") {
          installCmd = "pnpm";
          installArgs = [
            "add",
            "@aws-amplify/backend@latest",
            "@aws-amplify/backend-cli@latest",
            "-D",
          ];
        } else if (packageManager === "bun") {
          installCmd = "bun";
          installArgs = [
            "add",
            "@aws-amplify/backend@latest",
            "@aws-amplify/backend-cli@latest",
            "--dev",
          ];
        } else {
          // Default to npm
          installCmd = "npm";
          installArgs = [
            "install",
            "@aws-amplify/backend@latest",
            "@aws-amplify/backend-cli@latest",
            "--save-dev",
          ];
        }

        // Install/upgrade the Amplify packages
        const amplifyResult =
          await services.processService.runCommandWithStreaming(
            installCmd,
            installArgs,
            clonePath,
            onOutput,
            onOutput,
          );

        if (amplifyResult.exitCode !== 0) {
          throw new Error(
            `Failed to install Amplify packages: exit code ${amplifyResult.exitCode}`,
          );
        }

        setUpgradeMessage(
          "Amplify backend packages installed/upgraded to latest",
        );
        onOutput("\n✓ Amplify packages installed to latest version\n\n");

        // Install all other dependencies
        onOutput("Installing remaining dependencies...\n");
        await services.processService.installDependencies(
          packageManager,
          clonePath,
          onOutput,
        );
      }

      setPrepareStatus("success");
      setAppState("repository", "operationStatus", "prepareComplete", true);
      setAppState("repository", "operationStatus", "upgradeComplete", true);
    } catch (e) {
      console.error("[Prepare Error]", e);
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e, null, 2);
      setPrepareError(errorMessage);
      setPrepareStatus("failed");
    }
  };

  // Update backend runtime
  const handleUpdate = async () => {
    const clonePath = appState.repository.clonePath;
    const backendType = appState.repository.backendType;
    const targetRuntime = appState.runtimeInfo.targetRuntime;

    if (!clonePath || !backendType || !targetRuntime) {
      setUpdateError("Missing required information for update");
      return;
    }

    setUpdateStatus("running");
    setUpdateError(null);
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
        // Gen1: Not fully supported yet
        setUpdateError("Gen1 runtime updates not yet implemented");
        setUpdateStatus("failed");
      }
    } catch (e) {
      setUpdateError(String(e));
      setUpdateStatus("failed");
    }
  };

  // Update Gen2 build configuration
  const handleBuildConfigUpdate = async () => {
    const clonePath = appState.repository.clonePath;
    const selectedApp = appState.amplifyResources.selectedApp;

    if (!clonePath || !selectedApp) {
      setBuildConfigError(
        "Missing required information for build config update",
      );
      return;
    }

    setBuildConfigStatus("running");
    setBuildConfigError(null);
    setBuildConfigMessage(null);
    setAppState("repository", "operationStatus", "buildConfigComplete", false);

    try {
      const services = await initializeServices();

      // Read amplify.yml from repository
      const amplifyYmlPath = `${clonePath}/amplify.yml`;
      let amplifyYmlContent: string;

      try {
        amplifyYmlContent = await services.fileService.readFile(amplifyYmlPath);
      } catch {
        // If amplify.yml doesn't exist, try to get from cloud
        const app = await services.amplifyService!.getApp(selectedApp.app_id);

        if (app.buildSpec) {
          // Update cloud buildSpec
          const oldCommand =
            app.buildSpec.match(/- npx ampx generate outputs/)?.[0] || "";
          const newCommand =
            "- npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID";

          if (oldCommand && !app.buildSpec.includes("pipeline-deploy")) {
            const newBuildSpec = app.buildSpec.replace(oldCommand, newCommand);

            // Update in cloud
            await services.amplifyService!.updateApp(selectedApp.app_id, {
              buildSpec: newBuildSpec,
            });

            setAppState("repository", "buildConfigChange", {
              location: "Cloud",
              old_command: oldCommand,
              new_command: newCommand,
            });
            setAppState("repository", "originalBuildSpec", app.buildSpec);

            setBuildConfigMessage("Build configuration updated in AWS Cloud");
            setBuildConfigStatus("success");
            setAppState(
              "repository",
              "operationStatus",
              "buildConfigComplete",
              true,
            );
            return;
          } else {
            setBuildConfigMessage("Build configuration already up to date");
            setBuildConfigStatus("success");
            setAppState(
              "repository",
              "operationStatus",
              "buildConfigComplete",
              true,
            );
            return;
          }
        }

        setBuildConfigError(
          "Could not find amplify.yml in repository or cloud buildSpec",
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
          location: amplifyYmlPath,
          old_command: "- npx ampx generate outputs",
          new_command:
            "- npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID",
        });

        setBuildConfigMessage("Build configuration updated in amplify.yml");
        setBuildConfigStatus("success");
        setAppState(
          "repository",
          "operationStatus",
          "buildConfigComplete",
          true,
        );
      } else {
        setBuildConfigMessage("Build configuration already up to date");
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
      setBuildConfigError(`Build configuration update failed: ${String(e)}`);
      setBuildConfigStatus("failed");
    }
  };

  // Deploy Gen2 sandbox
  const handleSandboxDeploy = async () => {
    const clonePath = appState.repository.clonePath;

    if (!clonePath) {
      setSandboxError("Missing required information for sandbox deployment");
      return;
    }

    setSandboxStatus("running");
    setSandboxError(null);
    setSandboxOutput("");

    try {
      const services = await initializeServices();

      const onOutput = (line: string) => {
        console.log("[Sandbox Output]", line);
        setSandboxOutput((prev) => prev + line);
      };

      const onError = (line: string) => {
        console.error("[Sandbox Error]", line);
        setSandboxOutput((prev) => prev + `[ERROR] ${line}`);
      };

      // Check Node version in WebContainer
      onOutput("=== WebContainer Environment ===\n");
      await services.processService.runCommandWithStreaming(
        "node",
        ["--version"],
        clonePath,
        (line) => onOutput(`Node version: ${line}`),
        onError,
      );
      await services.processService.runCommandWithStreaming(
        "npm",
        ["--version"],
        clonePath,
        (line) => onOutput(`npm version: ${line}`),
        onError,
      );

      // Get absolute path
      onOutput("\nAbsolute paths:\n");
      await services.processService.runCommandWithStreaming(
        "pwd",
        [],
        clonePath,
        (line) => onOutput(`  Working directory (pwd): ${line}`),
        onError,
      );

      // Get realpath if available
      try {
        await services.processService.runCommandWithStreaming(
          "realpath",
          ["."],
          clonePath,
          (line) => onOutput(`  Real path (realpath): ${line}`),
          onError,
        );
      } catch (e) {
        onOutput(`  realpath not available\n`);
      }

      onOutput("\n");

      // Debug: Check repository state
      onOutput("=== Verifying repository setup ===\n");
      onOutput(`Repository path: ${clonePath}\n\n`);

      // Check if directory exists and list contents
      onOutput("Checking repository contents...\n");
      const lsResult = await services.processService.runCommandWithStreaming(
        "ls",
        ["-la"],
        clonePath,
        onOutput,
        onError,
      );
      onOutput("\n");

      // Check if node_modules exists
      onOutput("Checking node_modules...\n");
      const nodeModulesResult =
        await services.processService.runCommandWithStreaming(
          "ls",
          ["-ld", "node_modules"],
          clonePath,
          onOutput,
          onError,
        );
      onOutput("\n");

      // Check package.json
      onOutput("Checking package.json...\n");
      const pkgResult = await services.processService.runCommandWithStreaming(
        "cat",
        ["package.json"],
        clonePath,
        (line) => {
          // Only show first 20 lines of package.json
          const lines = line.split("\n");
          onOutput(lines.slice(0, 20).join("\n") + "\n...\n");
        },
        onError,
      );
      onOutput("\n");

      // Check for ampx in node_modules
      onOutput("Checking for @aws-amplify/backend-cli...\n");
      const ampxCheckResult =
        await services.processService.runCommandWithStreaming(
          "ls",
          ["-la", "node_modules/.bin/"],
          clonePath,
          onOutput,
          onError,
        );
      onOutput("\n");

      // Check npm/npx version
      onOutput("Checking npm/npx versions...\n");
      await services.processService.runCommandWithStreaming(
        "npm",
        ["--version"],
        clonePath,
        (line) => onOutput(`npm version: ${line}`),
        onError,
      );
      await services.processService.runCommandWithStreaming(
        "npx",
        ["--version"],
        clonePath,
        (line) => onOutput(`npx version: ${line}`),
        onError,
      );
      onOutput("\n");

      // Clear npx cache to ensure we get fresh packages
      onOutput("Clearing npx cache...\n");
      try {
        await services.processService.runCommandWithStreaming(
          "npx",
          ["clear-npx-cache"],
          clonePath,
          (line) => onOutput(`  ${line}`),
          (err) => onOutput(`  ${err}`),
        );
        onOutput("  ✓ npx cache cleared\n");
      } catch (e) {
        onOutput(`  Note: Could not clear npx cache: ${e}\n`);
      }
      onOutput("\n");

      // Try to check if ampx is available and what version
      onOutput("Checking ampx availability:\n");
      try {
        await services.processService.runCommandWithStreaming(
          "npx",
          ["ampx", "--version"],
          clonePath,
          (line) => onOutput(`  ampx version: ${line}`),
          (err) => onOutput(`  Error: ${err}`),
        );
        onOutput("  ✓ ampx is accessible\n");
      } catch (e) {
        onOutput(`  ✗ ampx command not available: ${e}\n`);
      }
      onOutput("\n");

      // Check for Lambda functions in amplify directory
      onOutput("Checking amplify backend structure:\n");

      // Check if amplify directory exists
      try {
        await services.processService.runCommandWithStreaming(
          "ls",
          ["-la", "amplify"],
          clonePath,
          (line) => onOutput(`  ${line}`),
          onError,
        );
      } catch (e) {
        onOutput(`  amplify directory: ${e}\n`);
      }

      // Check specifically for the say-hello function
      onOutput("\nChecking say-hello function:\n");
      try {
        await services.processService.runCommandWithStreaming(
          "ls",
          ["-la", "amplify/functions/say-hello/"],
          clonePath,
          (line) => onOutput(`  ${line}`),
          onError,
        );
      } catch (e) {
        onOutput(`  say-hello function: ${e}\n`);
      }

      // Check if handler.ts exists
      onOutput("\nChecking handler.ts:\n");
      try {
        await services.processService.runCommandWithStreaming(
          "test",
          ["-f", "amplify/functions/say-hello/handler.ts"],
          clonePath,
          () => onOutput(`  ✓ handler.ts exists\n`),
          () => onOutput(`  ✗ handler.ts NOT FOUND\n`),
        );

        // Show the actual file content (first 20 lines)
        await services.processService.runCommandWithStreaming(
          "head",
          ["-n", "20", "amplify/functions/say-hello/handler.ts"],
          clonePath,
          (line) => onOutput(`  ${line}`),
          onError,
        );
      } catch (e) {
        onOutput(`  Error checking handler.ts: ${e}\n`);
      }

      // Check with absolute path
      onOutput("\nVerifying absolute path to handler.ts:\n");
      await services.processService.runCommandWithStreaming(
        "sh",
        ["-c", "ls -la $(pwd)/amplify/functions/say-hello/handler.ts 2>&1"],
        clonePath,
        (line) => onOutput(`  ${line}`),
        onError,
      );

      onOutput("\n");

      onOutput("=== Starting sandbox deployment ===\n");
      onOutput("Running: npx ampx sandbox\n");
      onOutput(
        "Note: This may take several minutes to deploy AWS resources...\n\n",
      );

      // Track output lines for completion detection
      const outputLines: string[] = [];
      let lastOutputTime = Date.now();
      const startTime = Date.now();
      const maxTimeout = 10 * 60 * 1000; // 10 minutes
      const completionTimeout = 5 * 1000; // 5 seconds of no output after completion pattern

      // Spawn the sandbox process (interactive, needs monitoring)
      const container = await WebContainerService.getInstance();
      const creds = services.credentialService.getCredentials();

      // Use shell to cd into directory first, then run ampx
      // This ensures the process working directory is set correctly for CDK
      const process = await container.spawn(
        "sh",
        ["-c", `cd '${clonePath}' && npx ampx sandbox --debug`],
        {
          env: {
            // Don't set NODE_ENV - let ampx use its default environment
            AWS_ACCESS_KEY_ID: creds?.accessKeyId || "",
            AWS_SECRET_ACCESS_KEY: creds?.secretAccessKey || "",
            AWS_REGION: creds?.region || "",
            AWS_DEFAULT_REGION: creds?.region || "",
            AMPLIFY_CLI_DISABLE_PROMPTS: "true",
            CI: "true",
          },
        },
      );

      // Monitor output for completion patterns
      let deploymentComplete = false;
      const decoder = new TextDecoder();
      const reader = process.output.getReader();

      const monitorOutput = async () => {
        try {
          while (!deploymentComplete) {
            const { done, value } = await reader.read();
            if (done) break;

            const text =
              typeof value === "string"
                ? value
                : decoder.decode(value, { stream: true });

            onOutput(text);
            outputLines.push(text);
            lastOutputTime = Date.now();

            // Keep last 50 lines for pattern matching
            if (outputLines.length > 50) {
              outputLines.shift();
            }

            // Check for completion pattern
            const recentOutput = outputLines.join("");
            const hasWatching = recentOutput.includes(
              "Watching for file changes",
            );
            const hasFileWritten = recentOutput.includes("File written:");

            if (hasWatching && hasFileWritten) {
              // Wait for additional output to stabilize
              await new Promise((resolve) =>
                setTimeout(resolve, completionTimeout),
              );

              const timeSinceOutput = Date.now() - lastOutputTime;
              if (timeSinceOutput >= completionTimeout) {
                deploymentComplete = true;
                onOutput("\n✓ Sandbox deployment completed successfully!\n");
                onOutput("Terminating sandbox watch process...\n");

                // Kill the process
                try {
                  process.kill();
                } catch (e) {
                  console.log("[Sandbox] Process already terminated");
                }
                break;
              }
            }

            // Check for max timeout
            if (Date.now() - startTime >= maxTimeout) {
              onOutput(
                "\n⚠ Deployment is taking longer than expected (10 minutes).\n",
              );
              onOutput(
                "Please monitor the AWS CloudFormation console for deployment status.\n",
              );

              try {
                process.kill();
              } catch (e) {
                console.log("[Sandbox] Process already terminated");
              }
              throw new Error("Sandbox deployment timeout after 10 minutes");
            }
          }
        } catch (error) {
          console.error("[Sandbox] Error monitoring output:", error);
          if (!deploymentComplete) {
            throw error;
          }
        }
      };

      // Start monitoring
      await monitorOutput();

      // Wait for process to exit
      const exitCode = await process.exit;

      // If process was killed by us after successful deployment, that's okay
      if (!deploymentComplete && exitCode !== 0) {
        throw new Error(`Sandbox deployment failed with exit code ${exitCode}`);
      }

      setSandboxStatus("success");
      setAppState("repository", "sandboxDeployed", true);
    } catch (e) {
      console.error("[Sandbox Deploy Error]", e);
      setSandboxError(String(e));
      setSandboxStatus("failed");
    }
  };

  // Run build verification
  const handleBuild = async () => {
    const clonePath = appState.repository.clonePath;
    const packageManager = appState.repository.packageManager;
    const backendType = appState.repository.backendType;

    if (!clonePath || !packageManager || !backendType) {
      setBuildError("Missing required information for build");
      return;
    }

    setBuildStatus("running");
    setBuildError(null);
    setBuildOutput("");
    setAppState("repository", "operationStatus", "buildComplete", false);

    try {
      const services = await initializeServices();

      const onOutput = (line: string) => {
        console.log("[Build Output]", line);
        setBuildOutput((prev) => prev + line);
      };

      console.log(
        "[Build] Starting build with",
        packageManager,
        "in",
        clonePath,
      );

      // Run build
      await services.processService.runBuild(
        packageManager,
        clonePath,
        onOutput,
      );

      console.log("[Build] Build completed successfully");
      setAppState("repository", "buildStatus", "success");
      setBuildStatus("success");
      setAppState("repository", "operationStatus", "buildComplete", true);
    } catch (e) {
      console.error("[Build Error]", e);
      setBuildError(String(e));
      setAppState("repository", "buildStatus", "failed");
      setBuildStatus("failed");
    }
  };

  // Update environment variable for Gen1 apps
  const handleEnvVarUpdate = async () => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;

    if (!selectedApp || !selectedBranch) {
      setEnvVarError(
        "Missing required information for environment variable update",
      );
      return;
    }

    setEnvVarStatus("running");
    setEnvVarError(null);
    setEnvVarMessage(null);
    setAppState("repository", "operationStatus", "envVarComplete", false);

    try {
      // Gen1 env var updates not yet implemented
      setEnvVarError("Gen1 environment variable updates not yet implemented");
      setEnvVarStatus("failed");
    } catch (e) {
      setEnvVarError(String(e));
      setEnvVarStatus("failed");
    }
  };

  // Update environment variable for Gen2 apps
  const handleGen2EnvVarUpdate = async () => {
    const selectedApp = appState.amplifyResources.selectedApp;
    const selectedBranch = appState.amplifyResources.selectedBranch;
    const region = appState.awsConfig.selectedRegion;

    if (!selectedApp || !selectedBranch || !region) {
      setGen2EnvVarError(
        "Missing required information for environment variable update",
      );
      return;
    }

    setGen2EnvVarStatus("running");
    setGen2EnvVarError(null);
    setGen2EnvVarMessage(null);
    setAppState(
      "repository",
      "operationStatus",
      "gen2EnvVarComplete" as any,
      false,
    );

    try {
      const services = await initializeServices();

      // Remove legacy _CUSTOM_IMAGE environment variable
      const result = await services.amplifyService!.removeCustomImageIfLegacy(
        region,
        selectedApp.app_id,
        selectedBranch.branch_name,
      );

      if (result.updated) {
        setGen2EnvVarMessage(
          `Environment variable updates:\n${result.changes.join("\n")}`,
        );
      } else {
        setGen2EnvVarMessage(
          "No legacy _CUSTOM_IMAGE variable found (already using default image)",
        );
      }

      setGen2EnvVarStatus("success");
      setAppState(
        "repository",
        "operationStatus",
        "gen2EnvVarComplete" as any,
        true,
      );
    } catch (e) {
      setGen2EnvVarError(String(e));
      setGen2EnvVarStatus("failed");
    }
  };

  // For Gen2, user can continue without build test
  const canContinue = () => {
    if (isAnyOperationRunning()) {
      return false;
    }

    const backendType = appState.repository.backendType;
    // Gen1 requires build to pass and env var update
    if (backendType === "Gen1") {
      return buildStatus() === "success" && envVarStatus() === "success";
    }
    // Gen2 requires prepare, update, build config, and env var update (build is optional)
    return (
      prepareStatus() === "success" &&
      updateStatus() === "success" &&
      buildConfigStatus() === "success" &&
      gen2EnvVarStatus() === "success"
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

  const getChangeTypeDisplay = (changeType: string) => {
    const map: Record<string, string> = {
      runtime_update: "Runtime Update",
      dependency_update: "Dependency Update",
      env_update: "Environment Variable Update",
      code_comment_update: "Code Comment Update",
    };
    return map[changeType] || changeType;
  };

  // Copy path to clipboard
  const copyPathToClipboard = async () => {
    const path = appState.repository.clonePath;
    if (path) {
      try {
        await navigator.clipboard.writeText(path);
        setPathCopied(true);
        setTimeout(() => setPathCopied(false), 2000);
      } catch (e) {
        console.error("Failed to copy path:", e);
      }
    }
  };

  return (
    <div class="step-container wide clone-update-step">
      <h2>Clone & Update</h2>
      <p class="step-description">
        Clone the repository, detect project configuration, and update runtime
        settings.
      </p>

      {/* Selected App/Branch Summary */}
      <div class="info-bar-balanced">
        <div class="info-bar-left-balanced">
          <div class="info-item-balanced">
            <span class="info-label-balanced">App:</span>
            <span class="info-value-balanced">
              {appState.amplifyResources.selectedApp?.name}
            </span>
          </div>
          <div class="info-item-balanced">
            <span class="info-label-balanced">Branch:</span>
            <span class="info-value-balanced">
              {appState.amplifyResources.selectedBranch?.branch_name}
            </span>
          </div>
        </div>
        <div class="info-bar-right-balanced">
          <div class="info-item-balanced">
            <span class="info-label-balanced">Target Runtime:</span>
            <span class="badge-balanced runtime">
              {appState.runtimeInfo.targetRuntime}
            </span>
          </div>
        </div>
      </div>

      {/* Operations */}
      <div class="operations-container">
        {/* Step 1: Clone Repository & Detect Configuration */}
        <div class={`operation-card ${cloneStatus()}`}>
          <div class="operation-header">
            <div class="operation-number">1</div>
            <div class="operation-info">
              <h3>Clone Repository</h3>
              <p>Clone the repository and detect project configuration</p>
              <Show when={cloneStatus() === "pending"}>
                <Show
                  when={credentialService?.getGitCredentials()}
                  fallback={
                    <p style="font-size: 0.85em; margin-top: 0.5em; opacity: 0.8;">
                      ℹ️ Configure GitHub credentials in Step 1 for automatic
                      authentication
                    </p>
                  }
                >
                  <p style="font-size: 0.85em; margin-top: 0.5em; opacity: 0.8;">
                    ℹ️ Using GitHub credentials from Step 1
                  </p>
                </Show>
              </Show>
            </div>
            <div class="operation-status">
              <Show when={cloneStatus() === "pending"}>
                <button class="action-button" onClick={handleClone}>
                  Clone
                </button>
              </Show>
              <Show when={cloneStatus() === "running"}>
                <span class="status-indicator running">
                  <span class="spinner-small"></span>
                  Cloning...
                </span>
              </Show>
              <Show when={cloneStatus() === "success"}>
                <span class="status-indicator success">✓ Cloned</span>
              </Show>
              <Show when={cloneStatus() === "failed"}>
                <span class="status-indicator failed">✗ Failed</span>
              </Show>
            </div>
          </div>
          <Show when={cloneError()}>
            <div class="operation-error permission-error">
              <pre class="error-message-text">{cloneError()}</pre>
            </div>
          </Show>
          <Show when={cloneStatus() === "failed"}>
            <div class="operation-retry-row">
              <button class="retry-link" onClick={handleClone}>
                Retry Clone
              </button>
            </div>
          </Show>
          <Show
            when={cloneStatus() === "success" && appState.repository.clonePath}
          >
            <div class="result-balanced">
              <h4>Repository Details</h4>
              <div class="result-row-balanced">
                <div class="result-item-balanced half-width">
                  <span class="result-item-label-balanced">
                    Package Manager:
                  </span>
                  <span class="badge-balanced type">
                    {getPackageManagerDisplay(
                      appState.repository.packageManager,
                    )}
                  </span>
                </div>
                <div class="result-item-balanced half-width">
                  <span class="result-item-label-balanced">Backend Type:</span>
                  <span class="badge-balanced type">
                    {getBackendTypeDisplay(appState.repository.backendType)}
                  </span>
                </div>
              </div>
              <div class="result-row-balanced">
                <div class="result-item-balanced full-width">
                  <span class="result-item-label-balanced">Path:</span>
                  <code class="result-item-value-balanced">
                    {appState.repository.clonePath}
                  </code>
                  <button
                    class="copy-button"
                    onClick={copyPathToClipboard}
                    title={pathCopied() ? "Copied!" : "Copy path"}
                  >
                    <Show
                      when={pathCopied()}
                      fallback={
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                          ></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      }
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </Show>
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </div>

        {/* Step 2: Prepare Project */}
        <Show when={cloneStatus() === "success"}>
          <div class={`operation-card ${prepareStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">2</div>
              <div class="operation-info">
                <h3>Prepare Project</h3>
                <p>Install dependencies and upgrade Amplify packages</p>
              </div>
              <div class="operation-status">
                <Show when={prepareStatus() === "pending"}>
                  <button class="action-button" onClick={handlePrepare}>
                    Prepare
                  </button>
                </Show>
                <Show when={prepareStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Preparing...
                  </span>
                </Show>
                <Show when={prepareStatus() === "success"}>
                  <span class="status-indicator success">✓ Prepared</span>
                </Show>
                <Show when={prepareStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Failed</span>
                </Show>
              </div>
            </div>
            <Show when={prepareError()}>
              <div class="operation-error permission-error">
                <pre class="error-message-text">{prepareError()}</pre>
              </div>
            </Show>
            <Show when={prepareOutput()}>
              <div class="prepare-output-container">
                <div class="prepare-output-header">
                  <span>Preparation Output</span>
                  <Show when={prepareStatus() === "running"}>
                    <span class="live-indicator">● Live</span>
                  </Show>
                </div>
                <pre class="prepare-output-live" id="prepare-output-pre">
                  {prepareOutput()}
                </pre>
              </div>
            </Show>
            <Show when={prepareStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handlePrepare}>
                  Retry Prepare
                </button>
              </div>
            </Show>
            <Show when={prepareStatus() === "success" && upgradeMessage()}>
              <div class="operation-result">
                <p class="upgrade-message">{upgradeMessage()}</p>
              </div>
            </Show>
          </div>
        </Show>

        {/* Step 3: Update Runtime */}
        <Show when={prepareStatus() === "success"}>
          <div class={`operation-card ${updateStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">3</div>
              <div class="operation-info">
                <h3>Update Runtime</h3>
                <p>
                  Update Lambda runtime configurations to{" "}
                  {appState.runtimeInfo.targetRuntime}
                </p>
              </div>
              <div class="operation-status">
                <Show when={updateStatus() === "pending"}>
                  <button class="action-button" onClick={handleUpdate}>
                    Update
                  </button>
                </Show>
                <Show when={updateStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Updating...
                  </span>
                </Show>
                <Show when={updateStatus() === "success"}>
                  <span class="status-indicator success">✓ Updated</span>
                </Show>
                <Show when={updateStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Failed</span>
                </Show>
              </div>
            </div>
            <Show when={updateError()}>
              <div class="operation-error">{updateError()}</div>
            </Show>
            <Show when={updateStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handleUpdate}>
                  Retry Update
                </button>
              </div>
            </Show>
            <Show
              when={
                updateStatus() === "success" &&
                appState.repository.changes.length > 0
              }
            >
              <div class="operation-result">
                <h4>Changes Made:</h4>
                <div class="changes-list">
                  <For each={appState.repository.changes}>
                    {(change: FileChange) => (
                      <div class="change-item">
                        <span class="change-type">
                          {getChangeTypeDisplay(change.change_type)}
                        </span>
                        <code class="change-path">{change.path}</code>
                        <div class="change-details">
                          <span class="old-value">{change.old_value}</span>
                          <span class="arrow">→</span>
                          <span class="new-value">{change.new_value}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show
              when={
                updateStatus() === "success" &&
                appState.repository.changes.length === 0
              }
            >
              <div class="operation-result">
                <p class="no-changes">
                  No outdated runtimes are manually configured. Runtimes will be
                  updated by upgrading to latest amplify backend version.
                </p>
              </div>
            </Show>
          </div>
        </Show>

        {/* Step 4: Update Build Configuration (Gen2 only, required) */}
        <Show
          when={
            updateStatus() === "success" &&
            appState.repository.backendType === "Gen2"
          }
        >
          <div class={`operation-card ${buildConfigStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">4</div>
              <div class="operation-info">
                <h3>Update Build Configuration</h3>
                <p>Update Amplify build command to use pipeline-deploy</p>
              </div>
              <div class="operation-status">
                <Show when={buildConfigStatus() === "pending"}>
                  <button
                    class="action-button"
                    onClick={handleBuildConfigUpdate}
                  >
                    Update
                  </button>
                </Show>
                <Show when={buildConfigStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Updating...
                  </span>
                </Show>
                <Show when={buildConfigStatus() === "success"}>
                  <span class="status-indicator success">✓ Updated</span>
                </Show>
                <Show when={buildConfigStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Failed</span>
                </Show>
              </div>
            </div>
            <Show when={buildConfigError()}>
              <div class="operation-error">
                <pre class="error-message-text">{buildConfigError()}</pre>
              </div>
            </Show>
            <Show when={buildConfigStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handleBuildConfigUpdate}>
                  Retry Config
                </button>
              </div>
            </Show>
            <Show
              when={buildConfigStatus() === "success" && buildConfigMessage()}
            >
              <div class="operation-result">
                <p class="upgrade-message">{buildConfigMessage()}</p>
              </div>
            </Show>
            <Show when={appState.repository.buildConfigChange}>
              <div class="result-balanced">
                <h4>Build Configuration Updated</h4>
                <div class="result-row-balanced">
                  <div class="result-item-balanced half-width">
                    <span class="result-item-label-balanced">Location:</span>
                    <span class="result-item-value-balanced">
                      {appState.repository.buildConfigChange?.location ===
                      "Cloud"
                        ? "AWS Cloud Configuration"
                        : appState.repository.buildConfigChange?.location}
                    </span>
                  </div>
                </div>
                <div class="result-row-balanced">
                  <div class="result-item-balanced full-width">
                    <span class="result-item-label-balanced">Old Command:</span>
                    <span class="result-item-value-balanced old-value">
                      {appState.repository.buildConfigChange?.old_command}
                    </span>
                  </div>
                </div>
                <div class="result-row-balanced">
                  <div class="result-item-balanced full-width">
                    <span class="result-item-label-balanced">New Command:</span>
                    <span class="result-item-value-balanced new-value">
                      {appState.repository.buildConfigChange?.new_command}
                    </span>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Step 5: Update Environment Variables (Gen2 only, required) */}
        <Show
          when={
            appState.repository.backendType === "Gen2" &&
            buildConfigStatus() === "success"
          }
        >
          <div class={`operation-card ${gen2EnvVarStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">5</div>
              <div class="operation-info">
                <h3>Update Environment Variables</h3>
                <p>
                  Remove legacy _CUSTOM_IMAGE variable to use default Amplify
                  image
                </p>
              </div>
              <div class="operation-status">
                <Show when={gen2EnvVarStatus() === "pending"}>
                  <button
                    class="action-button"
                    onClick={handleGen2EnvVarUpdate}
                  >
                    Update
                  </button>
                </Show>
                <Show when={gen2EnvVarStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Updating...
                  </span>
                </Show>
                <Show when={gen2EnvVarStatus() === "success"}>
                  <span class="status-indicator success">✓ Updated</span>
                </Show>
                <Show when={gen2EnvVarStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Failed</span>
                </Show>
              </div>
            </div>
            <Show when={gen2EnvVarError()}>
              <div class="operation-error">
                <pre class="error-message-text">{gen2EnvVarError()}</pre>
              </div>
            </Show>
            <Show when={gen2EnvVarStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handleGen2EnvVarUpdate}>
                  Retry Env Vars
                </button>
              </div>
            </Show>
            <Show
              when={gen2EnvVarStatus() === "success" && gen2EnvVarMessage()}
            >
              <div class="operation-result">
                <h4>Environment Variable Changes</h4>
                <div class="env-var-simple-list">
                  {gen2EnvVarMessage()
                    ?.split("\n")
                    .filter((line) => line.trim())
                    .map((line) => (
                      <div class="env-var-simple-item">{line}</div>
                    ))}
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* Gen2: No sandbox test - CDK bundling doesn't work in WebContainer */}
        <Show
          when={
            appState.repository.backendType === "Gen2" &&
            gen2EnvVarStatus() === "success"
          }
        >
          <div class="optional-build-section">
            <p class="optional-hint">
              <strong>Note:</strong> Sandbox deployment and build testing are
              not available in the browser environment due to AWS CDK
              limitations. Your changes are ready to be pushed and will be built
              by AWS Amplify in the cloud.
            </p>
          </div>
        </Show>

        {/* Gen2 Sandbox Deployment (Step 6a - optional) */}
        <Show
          when={
            appState.repository.backendType === "Gen2" &&
            gen2SandboxEnabled() &&
            gen2EnvVarStatus() === "success"
          }
        >
          <div class={`operation-card ${sandboxStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">6a</div>
              <div class="operation-info">
                <h3>Deploy Sandbox</h3>
                <p>Deploy Gen2 sandbox environment for testing</p>
              </div>
              <div class="operation-status">
                <Show when={sandboxStatus() === "pending"}>
                  <button class="action-button" onClick={handleSandboxDeploy}>
                    Deploy
                  </button>
                </Show>
                <Show when={sandboxStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Deploying...
                  </span>
                </Show>
                <Show when={sandboxStatus() === "success"}>
                  <span class="status-indicator success">✓ Deployed</span>
                </Show>
                <Show when={sandboxStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Failed</span>
                </Show>
              </div>
            </div>
            <Show when={sandboxError()}>
              <div class="operation-error">
                <pre class="error-output">{sandboxError()}</pre>
              </div>
            </Show>
            <Show when={sandboxStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handleSandboxDeploy}>
                  Retry Deploy
                </button>
              </div>
            </Show>
            <Show when={sandboxOutput()}>
              <div class="sandbox-output-container">
                <div class="sandbox-output-header">
                  <span>Deployment Output</span>
                  <Show when={sandboxStatus() === "running"}>
                    <span class="live-indicator">● Live</span>
                  </Show>
                </div>
                <pre class="sandbox-output" id="sandbox-output-pre">
                  {sandboxOutput()}
                </pre>
              </div>
            </Show>
          </div>
        </Show>

        {/* Build Verification (Step 6b - optional for Gen2) */}
        <Show
          when={
            appState.repository.backendType === "Gen2" &&
            gen2SandboxEnabled() &&
            sandboxStatus() === "success"
          }
        >
          <div class={`operation-card ${buildStatus()}`}>
            <div class="operation-header">
              <div class="operation-number">6b</div>
              <div class="operation-info">
                <h3>Build Verification</h3>
                <p>Run frontend build</p>
              </div>
              <div class="operation-status">
                <Show when={buildStatus() === "pending"}>
                  <button class="action-button" onClick={handleBuild}>
                    Build
                  </button>
                </Show>
                <Show when={buildStatus() === "running"}>
                  <span class="status-indicator running">
                    <span class="spinner-small"></span>
                    Building...
                  </span>
                </Show>
                <Show when={buildStatus() === "success"}>
                  <span class="status-indicator success">✓ Build Passed</span>
                </Show>
                <Show when={buildStatus() === "failed"}>
                  <span class="status-indicator failed">✗ Build Failed</span>
                </Show>
              </div>
            </div>
            <Show when={buildError()}>
              <div class="operation-error">
                <pre class="error-output">{buildError()}</pre>
              </div>
            </Show>
            <Show when={buildStatus() === "failed"}>
              <div class="operation-retry-row">
                <button class="retry-link" onClick={handleBuild}>
                  Retry Build
                </button>
              </div>
            </Show>
            <Show when={buildOutput()}>
              <div class="build-output-container">
                <div class="build-output-header">
                  <span>Build Output</span>
                  <Show when={buildStatus() === "running"}>
                    <span class="live-indicator">● Live</span>
                  </Show>
                </div>
                <pre class="build-output-live" id="build-output-pre">
                  {buildOutput()}
                </pre>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Actions */}
      <div class="actions">
        <button
          onClick={handleBack}
          class="secondary-button"
          disabled={isAnyOperationRunning()}
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          class="primary-button"
          disabled={!canContinue()}
        >
          Continue to Push
        </button>
      </div>

      <Show when={!canContinue() && buildStatus() !== "running"}>
        <p class="info-message">
          <Show when={appState.repository.backendType === "Gen1"}>
            Gen1 support is not yet fully implemented.
          </Show>
          <Show when={appState.repository.backendType === "Gen2"}>
            Complete prepare, update runtime, build configuration, and
            environment variable steps to continue. Build test is optional for
            Gen2.
          </Show>
          <Show when={!appState.repository.backendType}>
            Complete all steps above to continue to the push step.
          </Show>
        </p>
      </Show>
    </div>
  );
}

export default CloneUpdateStep;
