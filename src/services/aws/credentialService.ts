/**
 * AWS Credentials interface
 */
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

/**
 * Git Credentials interface
 */
export interface GitCredentials {
  username: string;
  token: string; // Personal Access Token
}

/**
 * All Credentials interface
 */
export interface AllCredentials extends AWSCredentials {
  git?: GitCredentials;
}

/**
 * Credential Service
 * Manages AWS and Git credentials storage and retrieval
 * Uses sessionStorage for security (cleared on browser close)
 */
export class CredentialService {
  private static readonly STORAGE_KEY = "alru_credentials";

  /**
   * Store AWS credentials in sessionStorage
   * Uses base64 encoding (upgrade to Web Crypto API in production)
   *
   * @param creds AWS credentials to store
   */
  async setCredentials(creds: AllCredentials): Promise<void> {
    // Validate credentials before storing
    if (!creds.accessKeyId || !creds.secretAccessKey || !creds.region) {
      throw new Error(
        "Invalid credentials: accessKeyId, secretAccessKey, and region are required",
      );
    }

    // Simple base64 encoding
    // TODO: Upgrade to Web Crypto API for better security in production
    const encoded = btoa(JSON.stringify(creds));
    sessionStorage.setItem(CredentialService.STORAGE_KEY, encoded);
  }

  /**
   * Retrieve all credentials from sessionStorage
   *
   * @returns All credentials or null if not found
   */
  getCredentials(): AllCredentials | null {
    const encoded = sessionStorage.getItem(CredentialService.STORAGE_KEY);
    if (!encoded) {
      return null;
    }

    try {
      const decoded = atob(encoded);
      const creds = JSON.parse(decoded) as AllCredentials;

      // Validate structure
      if (!creds.accessKeyId || !creds.secretAccessKey || !creds.region) {
        // Invalid stored credentials, clear them
        this.clearCredentials();
        return null;
      }

      return creds;
    } catch (error) {
      // Failed to decode, clear invalid data
      this.clearCredentials();
      return null;
    }
  }

  /**
   * Clear stored AWS credentials
   */
  clearCredentials(): void {
    sessionStorage.removeItem(CredentialService.STORAGE_KEY);
  }

  /**
   * Check if credentials are stored
   *
   * @returns true if credentials exist
   */
  hasCredentials(): boolean {
    return this.getCredentials() !== null;
  }

  /**
   * Get credentials for AWS SDK
   * Returns credentials in the format expected by AWS SDK
   *
   * @returns Credentials object for AWS SDK or null
   */
  getAWSSDKCredentials(): {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  } | null {
    const creds = this.getCredentials();
    if (!creds) {
      return null;
    }

    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    };
  }

  /**
   * Get current region
   *
   * @returns AWS region or null
   */
  getRegion(): string | null {
    const creds = this.getCredentials();
    return creds?.region ?? null;
  }

  /**
   * Update only the region
   *
   * @param region New region to set
   */
  async updateRegion(region: string): Promise<void> {
    const creds = this.getCredentials();
    if (!creds) {
      throw new Error("No credentials found. Set credentials first.");
    }

    creds.region = region;
    await this.setCredentials(creds);
  }

  /**
   * Get Git credentials
   *
   * @returns Git credentials or null
   */
  getGitCredentials(): GitCredentials | null {
    const creds = this.getCredentials();
    return creds?.git ?? null;
  }

  /**
   * Set Git credentials (updates existing credentials)
   *
   * @param gitCreds Git credentials to set
   */
  async setGitCredentials(gitCreds: GitCredentials): Promise<void> {
    const creds = this.getCredentials();
    if (!creds) {
      throw new Error("AWS credentials must be set first");
    }

    creds.git = gitCreds;
    await this.setCredentials(creds);
  }

  /**
   * Check if Git credentials are stored
   *
   * @returns true if Git credentials exist
   */
  hasGitCredentials(): boolean {
    return this.getGitCredentials() !== null;
  }
}
