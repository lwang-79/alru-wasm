import { FileService } from './fileService';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';
export type BackendType = 'Gen1' | 'Gen2';

/**
 * Detection Service
 * Detects package manager and backend type
 * Ports logic from file_ops.rs
 */
export class DetectionService {
  constructor(private fileService: FileService) {}

  /**
   * Detect backend type (Gen1 vs Gen2)
   * Ported from file_ops.rs:114-158
   *
   * Gen2 is identified by the presence of @aws-amplify/backend
   * in devDependencies or dependencies
   *
   * @param projectPath Project root path
   * @returns 'Gen1' or 'Gen2'
   */
  async detectBackendType(projectPath: string): Promise<BackendType> {
    try {
      const packageJson = await this.fileService.readFile(
        `${projectPath}/package.json`
      );
      const pkg = JSON.parse(packageJson);

      // Check for @aws-amplify/backend in devDependencies or dependencies
      const hasGen2Pkg =
        pkg.devDependencies?.['@aws-amplify/backend'] ||
        pkg.dependencies?.['@aws-amplify/backend'];

      return hasGen2Pkg ? 'Gen2' : 'Gen1';
    } catch (error) {
      throw new Error(
        `Failed to detect backend type: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Detect package manager based on lock files
   * Ported from file_ops.rs package manager detection logic
   *
   * Priority order: bun > pnpm > yarn > npm
   *
   * @param projectPath Project root path
   * @returns Package manager type
   */
  async detectPackageManager(
    projectPath: string
  ): Promise<PackageManager> {
    // Check for bun.lockb (highest priority)
    if (await this.fileService.fileExists(`${projectPath}/bun.lockb`)) {
      return 'bun';
    }

    // Check for pnpm-lock.yaml
    if (
      await this.fileService.fileExists(`${projectPath}/pnpm-lock.yaml`)
    ) {
      return 'pnpm';
    }

    // Check for yarn.lock
    if (await this.fileService.fileExists(`${projectPath}/yarn.lock`)) {
      return 'yarn';
    }

    // Default to npm
    return 'npm';
  }

  /**
   * Detect both backend type and package manager
   * Convenience method to detect both at once
   *
   * @param projectPath Project root path
   * @returns Object with backendType and packageManager
   */
  async detectAll(
    projectPath: string
  ): Promise<{ backendType: BackendType; packageManager: PackageManager }> {
    const [backendType, packageManager] = await Promise.all([
      this.detectBackendType(projectPath),
      this.detectPackageManager(projectPath),
    ]);

    return { backendType, packageManager };
  }
}
