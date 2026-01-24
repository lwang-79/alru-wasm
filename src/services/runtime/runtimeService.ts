/**
 * Node.js release schedule entry
 */
interface NodeRelease {
  start: string;
  lts?: string;
  maintenance?: string;
  end: string;
  codename?: string;
}

/**
 * Node.js release schedule
 */
interface NodeReleaseSchedule {
  [version: string]: NodeRelease;
}

/**
 * Runtime Service
 * Handles Node.js runtime version management
 * Ports logic from runtime.rs
 */
export class RuntimeService {
  private static readonly RELEASE_SCHEDULE_URL =
    'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';

  /**
   * Get supported Node.js runtimes (not yet EOL)
   * Fetches Node.js release schedule from GitHub
   *
   * @returns Array of supported major versions (descending)
   */
  async getSupportedRuntimes(): Promise<number[]> {
    try {
      const response = await fetch(RuntimeService.RELEASE_SCHEDULE_URL);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch release schedule: ${response.statusText}`
        );
      }

      const schedule: NodeReleaseSchedule = await response.json();
      const now = new Date();
      const supported: number[] = [];

      for (const [version, data] of Object.entries(schedule)) {
        // Extract major version (v18 → 18)
        const versionNum = parseInt(version.substring(1));

        // Check if version is still supported (before EOL)
        const end = new Date(data.end);

        if (now < end) {
          supported.push(versionNum);
        }
      }

      // Sort descending (newest first)
      return supported.sort((a, b) => b - a);
    } catch (error) {
      console.warn('Failed to fetch Node.js release schedule:', error);

      // Fallback to hardcoded supported versions
      return [22, 20]; // As of 2025, Node.js 20 and 22 are LTS
    }
  }

  /**
   * Get target runtime for updates
   * Returns the second oldest supported LTS version (or oldest if only one exists)
   * This is the stable version we recommend updating to
   * This matches the logic from alru Rust backend (runtime.rs:160-183)
   *
   * @returns Target runtime string (e.g., "nodejs20.x")
   */
  async getTargetRuntime(): Promise<string> {
    const supported = await this.getSupportedRuntimes();

    if (supported.length === 0) {
      throw new Error('No supported Node.js runtimes found');
    }

    // Sort ascending (oldest first) - supported is already descending
    const sortedAscending = [...supported].sort((a, b) => a - b);

    // Get the second oldest, or the oldest if there's only one
    // This gives us a stable, well-tested version (not bleeding edge)
    const targetVersion = sortedAscending.length >= 2 
      ? sortedAscending[1]  // Second oldest (e.g., 20 when we have [20, 22])
      : sortedAscending[0]; // Only one version available

    return `nodejs${targetVersion}.x`;
  }

  /**
   * Get the minimum supported runtime version
   * Any version below this is considered outdated/deprecated
   *
   * @returns Minimum supported version number
   */
  async getMinimumSupportedVersion(): Promise<number> {
    const supported = await this.getSupportedRuntimes();

    if (supported.length === 0) {
      throw new Error('No supported Node.js runtimes found');
    }

    // Return the oldest supported version (minimum acceptable)
    return Math.min(...supported);
  }

  /**
   * Get target runtime for updates based on current versions
   * Never downgrades - if a function is already on a newer runtime, keep it
   *
   * @param currentVersions Current runtime versions in use
   * @returns Target runtime string
   */
  async getTargetRuntimeForVersions(
    currentVersions: string[]
  ): Promise<string> {
    const supported = await this.getSupportedRuntimes();

    if (supported.length === 0) {
      throw new Error('No supported Node.js runtimes found');
    }

    // Extract major versions from current runtimes
    const currentMajorVersions = currentVersions
      .map((v) => {
        const match = v.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      })
      .filter((v) => v > 0);

    // Find the highest current version
    const highestCurrent = Math.max(...currentMajorVersions, 0);

    // If highest current is newer than latest supported, keep it
    // Otherwise use latest supported
    const targetVersion = Math.max(highestCurrent, supported[0]);

    return `nodejs${targetVersion}.x`;
  }

  /**
   * Extract major version from runtime string
   *
   * @param runtime Runtime string (e.g., "nodejs18.x", "Runtime.NODEJS_20_X")
   * @returns Major version number
   */
  extractMajorVersion(runtime: string): number {
    const match = runtime.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  /**
   * Check if a runtime is outdated (compared to target)
   *
   * @param current Current runtime
   * @param target Target runtime
   * @returns true if current is older than target
   */
  isRuntimeOutdated(current: string, target: string): boolean {
    const currentVersion = this.extractMajorVersion(current);
    const targetVersion = this.extractMajorVersion(target);

    return currentVersion > 0 && currentVersion < targetVersion;
  }

  /**
   * Convert runtime string to different formats
   *
   * @param runtime Runtime string
   * @param format Target format
   * @returns Formatted runtime string
   */
  formatRuntime(
    runtime: string,
    format: 'aws' | 'cdk-enum' | 'cdk-number'
  ): string {
    const version = this.extractMajorVersion(runtime);

    if (version === 0) {
      throw new Error(`Invalid runtime: ${runtime}`);
    }

    switch (format) {
      case 'aws':
        return `nodejs${version}.x`;
      case 'cdk-enum':
        return `Runtime.NODEJS_${version}_X`;
      case 'cdk-number':
        return `${version}`;
      default:
        return runtime;
    }
  }

  /**
   * Get EOL date for a Node.js version
   *
   * @param version Major version number
   * @returns EOL date or null if not found
   */
  async getEolDate(version: number): Promise<Date | null> {
    try {
      const response = await fetch(RuntimeService.RELEASE_SCHEDULE_URL);

      if (!response.ok) {
        return null;
      }

      const schedule: NodeReleaseSchedule = await response.json();
      const versionKey = `v${version}`;

      if (schedule[versionKey]) {
        return new Date(schedule[versionKey].end);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a version is EOL
   *
   * @param version Major version number
   * @returns true if version is past EOL
   */
  async isVersionEol(version: number): Promise<boolean> {
    const eolDate = await this.getEolDate(version);

    if (!eolDate) {
      // If we can't determine, assume versions < 18 are EOL
      return version < 18;
    }

    return new Date() > eolDate;
  }
}
