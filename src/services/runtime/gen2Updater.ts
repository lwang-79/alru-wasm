import { FileService } from '../container/fileService';
import { RuntimeService } from './runtimeService';

/**
 * File change record
 */
export interface FileChange {
  filePath: string;
  changeType: 'runtime_update';
  oldValue: string;
  newValue: string;
  lineNumber?: number;
}

/**
 * Update result
 */
export interface UpdateResult {
  totalChanges: number;
  filesChanged: number;
  changes: FileChange[];
}

/**
 * Gen2 Updater
 * Updates Node.js runtime definitions in Gen2 Amplify resource.ts files
 * Ports logic from file_ops.rs:720-916
 */
export class Gen2Updater {
  private runtimeService = new RuntimeService();

  constructor(private fileService: FileService) {}

  /**
   * Update runtimes in all resource.ts files
   * Ported from file_ops.rs:720-916
   *
   * @param projectPath Project root path
   * @param targetRuntime Target runtime (e.g., "nodejs20.x")
   * @returns Update result with all changes
   */
  async updateRuntimes(
    projectPath: string,
    targetRuntime: string
  ): Promise<UpdateResult> {
    const changes: FileChange[] = [];
    const targetVersion = this.runtimeService.extractMajorVersion(
      targetRuntime
    );

    if (targetVersion === 0) {
      throw new Error(`Invalid target runtime: ${targetRuntime}`);
    }

    // Find all resource.ts files
    const resourceFiles = await this.fileService.findFiles(
      projectPath,
      /\/resource\.ts$/
    );

    if (resourceFiles.length === 0) {
      console.warn('No resource.ts files found in project');
    }

    // Update each file
    for (const filePath of resourceFiles) {
      const content = await this.fileService.readFile(filePath);
      const fileChanges = this.updateRuntimeInResourceTs(
        content,
        targetVersion,
        filePath
      );

      if (fileChanges.updated) {
        await this.fileService.writeFile(filePath, fileChanges.content);
        changes.push(...fileChanges.changes);
      }
    }

    // Count unique files changed
    const filesChanged = new Set(changes.map((c) => c.filePath)).size;

    return {
      totalChanges: changes.length,
      filesChanged,
      changes,
    };
  }

  /**
   * Update runtime definitions in a resource.ts file
   * Handles two patterns:
   * 1. Runtime.NODEJS_XX_X (enum format)
   * 2. runtime: XX (numeric format)
   *
   * Never downgrades - only updates to newer versions
   *
   * @param content File content
   * @param targetVersion Target major version
   * @param filePath File path (for change tracking)
   * @returns Updated content and changes
   */
  private updateRuntimeInResourceTs(
    content: string,
    targetVersion: number,
    filePath: string
  ): { updated: boolean; content: string; changes: FileChange[] } {
    const changes: FileChange[] = [];
    let updated = content;
    let hasChanges = false;

    // Pattern 1: Runtime.NODEJS_XX_X (CDK enum format)
    const enumRegex = /Runtime\.NODEJS_(\d+)_X/g;
    updated = updated.replace(enumRegex, (match, oldVersion) => {
      const oldVer = parseInt(oldVersion);

      // Only update if old version is less than target (never downgrade)
      if (oldVer < targetVersion) {
        hasChanges = true;
        const newValue = `Runtime.NODEJS_${targetVersion}_X`;

        changes.push({
          filePath,
          changeType: 'runtime_update',
          oldValue: match,
          newValue,
        });

        return newValue;
      }

      // Keep existing if already newer or equal
      return match;
    });

    // Pattern 2: runtime: XX (numeric format)
    // This pattern appears in defineFunction calls
    // Example: runtime: 18
    const numericRegex = /(\bruntime:\s*)(\d+)/g;
    updated = updated.replace(
      numericRegex,
      (match, prefix, oldVersion) => {
        const oldVer = parseInt(oldVersion);

        // Only update if old version is less than target (never downgrade)
        if (oldVer < targetVersion) {
          hasChanges = true;
          const newValue = `${prefix}${targetVersion}`;

          changes.push({
            filePath,
            changeType: 'runtime_update',
            oldValue: match,
            newValue,
          });

          return newValue;
        }

        // Keep existing if already newer or equal
        return match;
      }
    );

    return {
      updated: hasChanges,
      content: updated,
      changes,
    };
  }

  /**
   * Get current runtimes used in project
   * Scans all resource.ts files and extracts runtime versions
   *
   * @param projectPath Project root path
   * @returns Array of runtime strings found
   */
  async getCurrentRuntimes(projectPath: string): Promise<string[]> {
    const runtimes = new Set<string>();

    // Find all resource.ts files
    const resourceFiles = await this.fileService.findFiles(
      projectPath,
      /\/resource\.ts$/
    );

    for (const filePath of resourceFiles) {
      const content = await this.fileService.readFile(filePath);

      // Find Runtime.NODEJS_XX_X patterns
      const enumMatches = content.matchAll(/Runtime\.NODEJS_(\d+)_X/g);
      for (const match of enumMatches) {
        runtimes.add(`nodejs${match[1]}.x`);
      }

      // Find runtime: XX patterns
      const numericMatches = content.matchAll(/\bruntime:\s*(\d+)/g);
      for (const match of numericMatches) {
        runtimes.add(`nodejs${match[1]}.x`);
      }
    }

    return Array.from(runtimes).sort();
  }

  /**
   * Preview changes without applying them
   * Useful for showing users what will be changed
   *
   * @param projectPath Project root path
   * @param targetRuntime Target runtime
   * @returns Preview of changes
   */
  async previewChanges(
    projectPath: string,
    targetRuntime: string
  ): Promise<UpdateResult> {
    const changes: FileChange[] = [];
    const targetVersion = this.runtimeService.extractMajorVersion(
      targetRuntime
    );

    if (targetVersion === 0) {
      throw new Error(`Invalid target runtime: ${targetRuntime}`);
    }

    // Find all resource.ts files
    const resourceFiles = await this.fileService.findFiles(
      projectPath,
      /\/resource\.ts$/
    );

    // Preview changes for each file (don't write)
    for (const filePath of resourceFiles) {
      const content = await this.fileService.readFile(filePath);
      const fileChanges = this.updateRuntimeInResourceTs(
        content,
        targetVersion,
        filePath
      );

      changes.push(...fileChanges.changes);
    }

    const filesChanged = new Set(changes.map((c) => c.filePath)).size;

    return {
      totalChanges: changes.length,
      filesChanged,
      changes,
    };
  }

  /**
   * Check if project needs runtime updates
   *
   * @param projectPath Project root path
   * @param targetRuntime Target runtime
   * @returns true if any updates are needed
   */
  async needsUpdate(
    projectPath: string,
    targetRuntime: string
  ): Promise<boolean> {
    const preview = await this.previewChanges(projectPath, targetRuntime);
    return preview.totalChanges > 0;
  }

  /**
   * Upgrade Amplify packages to latest versions
   * Updates package.json to use latest @aws-amplify/backend packages
   *
   * @param projectPath Project root path
   * @returns true if package.json was updated
   */
  async upgradeAmplifyPackages(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = `${projectPath}/package.json`;
      const content = await this.fileService.readFile(packageJsonPath);
      const pkg = JSON.parse(content);

      let updated = false;

      // Update @aws-amplify/backend packages to latest
      const amplifyPackages = [
        '@aws-amplify/backend',
        '@aws-amplify/backend-cli',
      ];

      for (const pkgName of amplifyPackages) {
        // Check devDependencies
        if (pkg.devDependencies?.[pkgName]) {
          pkg.devDependencies[pkgName] = 'latest';
          updated = true;
        }

        // Check dependencies
        if (pkg.dependencies?.[pkgName]) {
          pkg.dependencies[pkgName] = 'latest';
          updated = true;
        }
      }

      if (updated) {
        // Write updated package.json
        await this.fileService.writeFile(
          packageJsonPath,
          JSON.stringify(pkg, null, 2) + '\n'
        );
      }

      return updated;
    } catch (error) {
      console.warn('Failed to upgrade Amplify packages:', error);
      return false;
    }
  }
}
