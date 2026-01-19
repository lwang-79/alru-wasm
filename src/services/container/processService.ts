import { WebContainer } from "@webcontainer/api";
import { CredentialService } from "../aws/credentialService";
import type { PackageManager } from "./detectionService";

/**
 * Process result
 */
export interface ProcessResult {
  exitCode: number;
  output: string;
}

/**
 * Process Service
 * Handles process spawning and execution within WebContainer
 * Supports streaming output to UI
 */
export class ProcessService {
  private credentialService = new CredentialService();

  constructor(private container: WebContainer) {}

  /**
   * Run a command with streaming output
   *
   * @param command Command to run (e.g., 'npm', 'node')
   * @param args Command arguments
   * @param cwd Working directory
   * @param onOutput Callback for stdout
   * @param onError Callback for stderr
   * @returns Process result
   */
  async runCommandWithStreaming(
    command: string,
    args: string[],
    cwd: string,
    onOutput?: (line: string) => void,
    onError?: (line: string) => void,
  ): Promise<ProcessResult> {
    const process = await this.container.spawn(command, args, {
      cwd,
      env: {
        // Don't set NODE_ENV - let the process use its default
        ...this.getAwsEnvVars(),
      },
    });

    let fullOutput = "";

    // Stream stdout
    const decoder = new TextDecoder();
    const reader = process.output.getReader();

    // Read output in background
    const readOutput = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // WebContainer output can be string or Uint8Array
          const text =
            typeof value === "string"
              ? value
              : decoder.decode(value, { stream: true });

          fullOutput += text;

          // Call output callback
          if (onOutput) {
            onOutput(text);
          }
        }
      } catch (error) {
        console.error("Error reading process output:", error);
      }
    };

    // Start reading output
    const outputPromise = readOutput();

    // Wait for process to complete
    const exitCode = await process.exit;

    // Wait for output to finish
    await outputPromise;

    return {
      exitCode,
      output: fullOutput,
    };
  }

  /**
   * Install dependencies using package manager
   * Supports npm, yarn, pnpm, bun
   *
   * @param packageManager Package manager to use
   * @param projectPath Project root path
   * @param onOutput Streaming output callback
   */
  async installDependencies(
    packageManager: PackageManager,
    projectPath: string,
    onOutput?: (line: string) => void,
  ): Promise<void> {
    onOutput?.(`Installing dependencies with ${packageManager}...\n`);

    const args = packageManager === "yarn" ? ["install"] : ["install"];
    const command = packageManager;

    const result = await this.runCommandWithStreaming(
      command,
      args,
      projectPath,
      onOutput,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `${packageManager} install failed with exit code ${result.exitCode}`,
      );
    }

    onOutput?.(`\n✓ Dependencies installed successfully\n`);
  }

  /**
   * Run build command
   * Typically runs "npm run build" or equivalent
   *
   * @param packageManager Package manager to use
   * @param projectPath Project root path
   * @param onOutput Streaming output callback
   */
  async runBuild(
    packageManager: PackageManager,
    projectPath: string,
    onOutput?: (line: string) => void,
  ): Promise<void> {
    onOutput?.(`\nRunning build with ${packageManager}...\n`);

    let command: string;
    let args: string[];

    if (packageManager === "yarn") {
      command = "yarn";
      args = ["build"];
    } else if (packageManager === "bun") {
      command = "bun";
      args = ["run", "build"];
    } else {
      command = packageManager;
      args = ["run", "build"];
    }

    const result = await this.runCommandWithStreaming(
      command,
      args,
      projectPath,
      onOutput,
    );

    if (result.exitCode !== 0) {
      throw new Error(`Build failed with exit code ${result.exitCode}`);
    }

    onOutput?.(`\n✓ Build completed successfully\n`);
  }

  /**
   * Run Amplify build (Gen1 only)
   * This is deferred to post-MVP Gen1 support
   *
   * @param projectPath Project root path
   * @param environmentName Environment name
   * @param onOutput Streaming output callback
   */
  async runAmplifyBuild(
    projectPath: string,
    environmentName: string,
    onOutput?: (line: string) => void,
  ): Promise<void> {
    onOutput?.(
      `\nRunning Amplify build for environment ${environmentName}...\n`,
    );

    const result = await this.runCommandWithStreaming(
      "npx",
      ["amplify", "build"],
      projectPath,
      onOutput,
    );

    if (result.exitCode !== 0) {
      throw new Error(`Amplify build failed with exit code ${result.exitCode}`);
    }

    onOutput?.(`\n✓ Amplify build completed successfully\n`);
  }

  /**
   * Run a generic npm script
   *
   * @param packageManager Package manager to use
   * @param scriptName Script name from package.json
   * @param projectPath Project root path
   * @param onOutput Streaming output callback
   */
  async runScript(
    packageManager: PackageManager,
    scriptName: string,
    projectPath: string,
    onOutput?: (line: string) => void,
  ): Promise<void> {
    onOutput?.(`\nRunning script "${scriptName}"...\n`);

    let command: string;
    let args: string[];

    if (packageManager === "yarn") {
      command = "yarn";
      args = [scriptName];
    } else {
      command = packageManager;
      args = ["run", scriptName];
    }

    const result = await this.runCommandWithStreaming(
      command,
      args,
      projectPath,
      onOutput,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Script "${scriptName}" failed with exit code ${result.exitCode}`,
      );
    }

    onOutput?.(`\n✓ Script completed successfully\n`);
  }

  /**
   * Check if a package is installed globally
   *
   * @param packageName Package name
   * @returns true if installed
   */
  async isGlobalPackageInstalled(packageName: string): Promise<boolean> {
    try {
      const result = await this.runCommandWithStreaming(
        "npm",
        ["list", "-g", packageName, "--depth=0"],
        "/",
      );

      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Install a global package
   *
   * @param packageName Package name
   * @param onOutput Streaming output callback
   */
  async installGlobalPackage(
    packageName: string,
    onOutput?: (line: string) => void,
  ): Promise<void> {
    onOutput?.(`\nInstalling global package: ${packageName}...\n`);

    const result = await this.runCommandWithStreaming(
      "npm",
      ["install", "-g", packageName],
      "/",
      onOutput,
    );

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to install ${packageName} (exit code: ${result.exitCode})`,
      );
    }

    onOutput?.(`\n✓ ${packageName} installed successfully\n`);
  }

  /**
   * Get AWS environment variables for process execution
   * Used to pass credentials to Amplify CLI commands
   *
   * @returns Environment variables object
   */
  private getAwsEnvVars(): Record<string, string> {
    const creds = this.credentialService.getCredentials();

    if (!creds) {
      return {};
    }

    const envVars: Record<string, string> = {
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
      AWS_REGION: creds.region,
      AWS_DEFAULT_REGION: creds.region,
      // Amplify CLI environment variables
      AMPLIFY_CLI_DISABLE_PROMPTS: "true",
      CI: "true", // Treat as CI environment to disable interactive prompts
    };

    // Only set AWS_SESSION_TOKEN if it exists (not all credentials have it)
    if (creds.sessionToken) {
      envVars.AWS_SESSION_TOKEN = creds.sessionToken;
    }

    return envVars;
  }

  /**
   * Check if a script exists in package.json
   *
   * @param projectPath Project root path
   * @param scriptName Script name
   * @returns true if script exists
   */
  async hasScript(projectPath: string, scriptName: string): Promise<boolean> {
    try {
      const packageJsonPath = `${projectPath}/package.json`;
      const content = await this.container.fs.readFile(packageJsonPath);
      const pkg = JSON.parse(new TextDecoder().decode(content));

      return pkg.scripts?.[scriptName] !== undefined;
    } catch {
      return false;
    }
  }
}
