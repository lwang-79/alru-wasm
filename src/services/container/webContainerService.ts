import { WebContainer } from '@webcontainer/api';

/**
 * WebContainer Service
 * Manages the WebContainer instance for running Node.js in the browser
 */
export class WebContainerService {
  private static instance: WebContainer | null = null;
  private static initPromise: Promise<WebContainer> | null = null;

  /**
   * Get or create the WebContainer instance (singleton)
   */
  static async getInstance(): Promise<WebContainer> {
    if (this.instance) {
      return this.instance;
    }

    // If initialization is already in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.bootContainer();

    try {
      this.instance = await this.initPromise;
      return this.instance;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Boot the WebContainer
   */
  private static async bootContainer(): Promise<WebContainer> {
    const container = await WebContainer.boot();
    return container;
  }

  /**
   * Initialize WebContainer with global tools needed for Gen2
   * Should be called once after getInstance()
   */
  static async initialize(
    onProgress?: (message: string) => void
  ): Promise<void> {
    const container = await this.getInstance();

    onProgress?.('Installing global Amplify packages...');

    // Install global tools needed for Gen2
    const installProcess = await container.spawn('npm', [
      'install',
      '-g',
      '@aws-amplify/backend@latest',
      '@aws-amplify/backend-cli@latest',
    ]);

    // Wait for installation to complete
    const exitCode = await installProcess.exit;

    if (exitCode !== 0) {
      throw new Error(
        `Failed to install Amplify packages (exit code: ${exitCode})`
      );
    }

    onProgress?.('Amplify packages installed successfully');
  }

  /**
   * Check if WebContainer is initialized
   */
  static isInitialized(): boolean {
    return this.instance !== null;
  }

  /**
   * Reset the WebContainer instance (for testing)
   */
  static reset(): void {
    this.instance = null;
    this.initPromise = null;
  }
}
