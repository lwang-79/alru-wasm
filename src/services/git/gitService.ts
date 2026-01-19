import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { WebContainer } from "@webcontainer/api";
import { createFsAdapter } from "./fsAdapter";

/**
 * Git credentials for authentication
 */
export interface GitCredentials {
  username: string;
  password: string; // Personal Access Token
}

/**
 * Git Service
 * Handles Git operations using isomorphic-git
 * Ports logic from git_ops.rs
 */
export class GitService {
  private fs: any;

  constructor(private container: WebContainer) {
    // Create an fs adapter that isomorphic-git can use
    this.fs = createFsAdapter(container);
  }

  /**
   * Clone a repository
   * Ported from git_ops.rs:clone_repository
   *
   * @param url Repository URL (SSH or HTTPS)
   * @param branchName Branch to clone
   * @param credentials Git credentials (PAT)
   * @param onProgress Progress callback
   * @returns Path to cloned repository
   */
  async cloneRepository(
    url: string,
    branchName: string,
    credentials: GitCredentials,
    onProgress?: (message: string) => void,
  ): Promise<string> {
    // Convert SSH URLs to HTTPS
    const httpsUrl = this.convertSshToHttps(url);

    // Create unique directory for this clone
    // Clone to current working directory to avoid absolute path issues
    const repoPath = `repo-${Date.now()}`;
    await this.container.fs.mkdir(repoPath);

    onProgress?.(`Cloning ${httpsUrl} (branch: ${branchName})...`);

    // Validate credentials before using them
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error(
        "Invalid Git credentials. Username and password/token are required for cloning.",
      );
    }

    try {
      // Shallow clone for performance
      console.log("[GitService] Starting clone with URL:", httpsUrl);
      console.log("[GitService] Using credentials for:", credentials.username);

      await git.clone({
        fs: this.fs,
        http,
        dir: repoPath,
        url: httpsUrl,
        ref: branchName,
        singleBranch: true,
        depth: 1,
        corsProxy: "https://cors.isomorphic-git.org",
        onProgress: (progress) => {
          const message = `${progress.phase}: ${progress.loaded}${progress.total ? `/${progress.total}` : ""}`;
          onProgress?.(message);
          console.log("[GitService]", message);
        },
        onAuth: () => {
          console.log("[GitService] Authenticating...");
          return {
            username: credentials.username,
            password: credentials.password,
          };
        },
      });

      onProgress?.("Clone completed successfully");
      return repoPath;
    } catch (error) {
      // Log full error for debugging
      console.error("[GitService] Clone failed with error:", error);

      // Clean up on failure
      try {
        await this.container.fs.rm(repoPath, { recursive: true });
      } catch {}

      // Re-throw with more context
      throw error;
    }
  }

  /**
   * Get list of changed files (git status)
   *
   * @param repoPath Repository path
   * @returns Array of changed file paths
   */
  async getChangedFiles(repoPath: string): Promise<string[]> {
    console.log("[GitService.getChangedFiles] Getting status for:", repoPath);

    let status;
    try {
      status = await git.statusMatrix({
        fs: this.fs,
        dir: repoPath,
      });
      console.log(
        "[GitService.getChangedFiles] Status matrix rows:",
        status.length,
      );
    } catch (statusError) {
      console.error(
        "[GitService.getChangedFiles] ERROR getting status matrix:",
        statusError,
      );
      throw statusError;
    }

    const changedFiles: string[] = [];

    for (const [filepath, headStatus, workdirStatus, stageStatus] of status) {
      // File is modified, added, or deleted
      if (
        workdirStatus !== headStatus ||
        stageStatus !== headStatus ||
        headStatus === 0
      ) {
        console.log(
          `[GitService.getChangedFiles] Changed: ${filepath} (head:${headStatus}, work:${workdirStatus}, stage:${stageStatus})`,
        );
        changedFiles.push(filepath);
      }
    }

    console.log(
      "[GitService.getChangedFiles] Total changed files:",
      changedFiles.length,
    );
    return changedFiles;
  }

  /**
   * Stage all changes
   *
   * @param repoPath Repository path
   */
  async stageAllChanges(repoPath: string): Promise<void> {
    const status = await git.statusMatrix({
      fs: this.fs,
      dir: repoPath,
    });

    for (const [filepath, , workdirStatus] of status) {
      if (workdirStatus !== 0) {
        // File exists in working directory (modified or added)
        await git.add({
          fs: this.fs,
          dir: repoPath,
          filepath,
        });
      } else {
        // File deleted
        await git.remove({
          fs: this.fs,
          dir: repoPath,
          filepath,
        });
      }
    }
  }

  /**
   * Commit changes
   * Ported from git_ops.rs:commit_and_push
   *
   * @param repoPath Repository path
   * @param commitMessage Commit message
   * @returns Commit SHA
   */
  async commit(repoPath: string, commitMessage: string): Promise<string> {
    // Get git config for author info
    const name = await this.getGitConfigValue(repoPath, "user.name");
    const email = await this.getGitConfigValue(repoPath, "user.email");

    console.log(`[GitService] Committing with author: ${name} <${email}>`);

    // Add co-authored-by tag
    const fullMessage = `${commitMessage}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

    // Ensure author object has all required fields with proper types
    const author = {
      name: String(name),
      email: String(email),
      timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
      timezoneOffset: new Date().getTimezoneOffset(), // Timezone offset in minutes
    };

    console.log(`[GitService] Author object:`, author);

    const commitSha = await git.commit({
      fs: this.fs,
      dir: repoPath,
      message: fullMessage,
      author,
    });

    console.log(`[GitService] Commit created: ${commitSha}`);
    return commitSha;
  }

  /**
   * Push changes to remote
   *
   * @param repoPath Repository path
   * @param credentials Git credentials
   * @param onProgress Progress callback
   */
  async push(
    repoPath: string,
    credentials: GitCredentials,
    onProgress?: (message: string) => void,
  ): Promise<void> {
    onProgress?.("Pushing changes...");

    // Validate credentials before using them
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error(
        "Invalid Git credentials. Username and password/token are required.",
      );
    }

    try {
      await git.push({
        fs: this.fs,
        http,
        dir: repoPath,
        remote: "origin",
        onAuth: () => ({
          username: credentials.username,
          password: credentials.password,
        }),
        onProgress: (progress) => {
          onProgress?.(`Pushing: ${progress.phase}`);
        },
        corsProxy: "https://cors.isomorphic-git.org",
      });

      onProgress?.("Push completed successfully");
    } catch (error) {
      throw new Error(
        `Failed to push: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Commit and push changes (combined operation)
   * Ported from git_ops.rs:commit_and_push
   *
   * @param repoPath Repository path
   * @param commitMessage Commit message
   * @param credentials Git credentials
   * @param onProgress Progress callback
   * @returns Commit SHA
   */
  async commitAndPush(
    repoPath: string,
    commitMessage: string,
    credentials: GitCredentials,
    onProgress?: (message: string) => void,
  ): Promise<string> {
    console.log("[GitService.commitAndPush] Starting...");
    console.log("[GitService.commitAndPush] repoPath:", repoPath);
    console.log("[GitService.commitAndPush] credentials:", {
      username: credentials.username,
      passwordLength: credentials.password?.length,
    });

    // Stage all changes
    try {
      onProgress?.("Staging changes...");
      console.log("[GitService.commitAndPush] Step 1: Staging changes...");
      await this.stageAllChanges(repoPath);
      console.log("[GitService.commitAndPush] Step 1: Staging complete");
    } catch (stageError) {
      console.error(
        "[GitService.commitAndPush] ERROR in stageAllChanges:",
        stageError,
      );
      throw stageError;
    }

    // Commit
    let commitSha;
    try {
      onProgress?.("Creating commit...");
      console.log("[GitService.commitAndPush] Step 2: Creating commit...");
      commitSha = await this.commit(repoPath, commitMessage);
      console.log(
        "[GitService.commitAndPush] Step 2: Commit created:",
        commitSha,
      );
      onProgress?.(`Commit created: ${commitSha.substring(0, 7)}`);
    } catch (commitError) {
      console.error("[GitService.commitAndPush] ERROR in commit:", commitError);
      throw commitError;
    }

    // Push
    try {
      console.log("[GitService.commitAndPush] Step 3: Pushing...");
      await this.push(repoPath, credentials, onProgress);
      console.log("[GitService.commitAndPush] Step 3: Push complete");
    } catch (pushError) {
      console.error("[GitService.commitAndPush] ERROR in push:", pushError);
      throw pushError;
    }

    console.log(
      "[GitService.commitAndPush] All steps complete, returning:",
      commitSha,
    );
    return commitSha;
  }

  /**
   * Get current commit SHA
   *
   * @param repoPath Repository path
   * @returns Current commit SHA
   */
  async getCurrentCommit(repoPath: string): Promise<string> {
    const commits = await git.log({
      fs: this.fs,
      dir: repoPath,
      depth: 1,
    });

    if (commits.length === 0) {
      throw new Error("No commits found");
    }

    return commits[0].oid;
  }

  /**
   * Get current branch name
   *
   * @param repoPath Repository path
   * @returns Branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    const branch = await git.currentBranch({
      fs: this.fs,
      dir: repoPath,
      fullname: false,
    });

    if (!branch) {
      throw new Error("No current branch");
    }

    return branch;
  }

  /**
   * Convert SSH URL to HTTPS
   * git@github.com:user/repo.git → https://github.com/user/repo.git
   *
   * @param url Git URL
   * @returns HTTPS URL
   */
  private convertSshToHttps(url: string): string {
    if (url.startsWith("git@")) {
      // git@github.com:user/repo.git → https://github.com/user/repo.git
      return url.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "");
    }

    // Already HTTPS or other format
    return url;
  }

  /**
   * Get git config value
   *
   * @param repoPath Repository path
   * @param key Config key (e.g., 'user.name')
   * @returns Config value or default
   */
  private async getGitConfigValue(
    repoPath: string,
    key: string,
  ): Promise<string> {
    try {
      const value = await git.getConfig({
        fs: this.fs,
        dir: repoPath,
        path: key,
      });

      // Ensure we always return a string, never undefined
      if (value !== undefined && value !== null && typeof value === "string") {
        return value;
      }

      return this.getDefaultConfigValue(key);
    } catch (error) {
      console.log(
        `[GitService] Could not read git config for ${key}, using default`,
      );
      return this.getDefaultConfigValue(key);
    }
  }

  /**
   * Get default config value for a key
   *
   * @param key Config key
   * @returns Default value
   */
  private getDefaultConfigValue(key: string): string {
    if (key === "user.name") {
      return "ALRU User";
    }
    if (key === "user.email") {
      return "alru@example.com";
    }
    return "";
  }

  /**
   * Clean up repository directory
   *
   * @param repoPath Repository path
   */
  async cleanup(repoPath: string): Promise<void> {
    try {
      await this.container.fs.rm(repoPath, { recursive: true });
    } catch (error) {
      console.warn(`Failed to clean up ${repoPath}:`, error);
    }
  }
}
