/**
 * GitHub API Service
 * Handles GitHub API interactions
 * Ports logic from git_api.rs
 */

/**
 * Repository info extracted from URL
 */
export interface RepoInfo {
  owner: string;
  repo: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
}

/**
 * Branch protection info
 */
export interface BranchProtection {
  enabled: boolean;
  requiresPullRequest: boolean;
  requiredReviewers: number;
}

/**
 * Git API Service
 * Handles Git provider API interactions (GitHub, GitLab, etc.)
 */
export class GitApiService {
  /**
   * Parse repository info from URL
   *
   * @param url Repository URL
   * @returns Repository info
   */
  parseRepoUrl(url: string): RepoInfo {
    // Try GitHub patterns
    let match = url.match(
      /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/
    );
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        provider: 'github',
      };
    }

    // Try GitLab patterns
    match = url.match(/gitlab\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        provider: 'gitlab',
      };
    }

    // Try Bitbucket patterns
    match = url.match(
      /bitbucket\.org[:/]([^/]+)\/([^/]+?)(\.git)?$/
    );
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
        provider: 'bitbucket',
      };
    }

    // Unknown provider
    return {
      owner: '',
      repo: '',
      provider: 'unknown',
    };
  }

  /**
   * Check if branch is protected (GitHub)
   * Ported from git_api.rs:check_branch_protection
   *
   * @param repoUrl Repository URL
   * @param branchName Branch name
   * @param token GitHub Personal Access Token
   * @returns Branch protection info
   */
  async checkBranchProtection(
    repoUrl: string,
    branchName: string,
    token: string
  ): Promise<BranchProtection> {
    const repoInfo = this.parseRepoUrl(repoUrl);

    if (repoInfo.provider !== 'github') {
      // Only GitHub is supported for now
      return {
        enabled: false,
        requiresPullRequest: false,
        requiredReviewers: 0,
      };
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/branches/${branchName}/protection`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (response.status === 404) {
        // Branch protection not enabled
        return {
          enabled: false,
          requiresPullRequest: false,
          requiredReviewers: 0,
        };
      }

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      return {
        enabled: true,
        requiresPullRequest:
          data.required_pull_request_reviews !== undefined,
        requiredReviewers:
          data.required_pull_request_reviews
            ?.required_approving_review_count || 0,
      };
    } catch (error) {
      // If we can't check, assume it might be protected
      console.warn('Failed to check branch protection:', error);
      return {
        enabled: false,
        requiresPullRequest: false,
        requiredReviewers: 0,
      };
    }
  }

  /**
   * Create a pull request (GitHub)
   *
   * @param repoUrl Repository URL
   * @param sourceBranch Source branch
   * @param targetBranch Target branch (usually 'main')
   * @param title PR title
   * @param body PR body
   * @param token GitHub Personal Access Token
   * @returns PR number
   */
  async createPullRequest(
    repoUrl: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    body: string,
    token: string
  ): Promise<number> {
    const repoInfo = this.parseRepoUrl(repoUrl);

    if (repoInfo.provider !== 'github') {
      throw new Error(
        'Pull request creation is only supported for GitHub repositories'
      );
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            body,
            head: sourceBranch,
            base: targetBranch,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Failed to create PR: ${error.message || response.statusText}`
        );
      }

      const pr = await response.json();
      return pr.number;
    } catch (error) {
      throw new Error(
        `Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get user info from GitHub token
   *
   * @param token GitHub Personal Access Token
   * @returns User info
   */
  async getGitHubUser(
    token: string
  ): Promise<{ login: string; name: string; email: string }> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const user = await response.json();

      return {
        login: user.login,
        name: user.name || user.login,
        email: user.email || `${user.login}@users.noreply.github.com`,
      };
    } catch (error) {
      throw new Error(
        `Failed to get GitHub user info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
