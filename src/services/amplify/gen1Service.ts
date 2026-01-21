/**
 * Amplify Gen1 Service
 * Handles Amplify CLI operations for Gen1 apps in WebContainer
 */

import { FileService } from '../container/fileService';

export class AmplifyGen1Service {
  constructor(private fileService: FileService) {}

  /**
   * Check if Amplify CLI is installed globally
   */
  async isAmplifyCliInstalled(): Promise<boolean> {
    // In WebContainer, we'll install it locally per project
    return false;
  }

  /**
   * Install Amplify CLI in the project
   * @param projectPath Project directory path
   */
  async installAmplifyCli(projectPath: string): Promise<void> {
    // Will be implemented with WebContainer npm install
    console.log('[AmplifyGen1Service] Installing Amplify CLI locally');
  }

  /**
   * Run amplify pull to initialize the project
   * @param projectPath Project directory path
   * @param appId Amplify app ID
   * @param envName Environment name
   */
  async amplifyPull(
    projectPath: string,
    appId: string,
    envName: string
  ): Promise<void> {
    console.log('[AmplifyGen1Service] Running amplify pull');
    // Will be implemented with WebContainer command execution
  }

  /**
   * Checkout Amplify environment
   * @param projectPath Project directory path
   * @param envName Environment name
   */
  async amplifyEnvCheckout(
    projectPath: string,
    envName: string
  ): Promise<void> {
    console.log('[AmplifyGen1Service] Checking out environment:', envName);
    // Will be implemented with WebContainer command execution
  }

  /**
   * Update Gen1 backend Lambda runtimes
   * @param projectPath Project directory path
   * @param targetRuntime Target Node.js runtime
   */
  async updateGen1Backend(
    projectPath: string,
    targetRuntime: string
  ): Promise<{ updated_files: string[]; changes: any[] }> {
    const changes: any[] = [];
    const updatedFiles: string[] = [];

    // Find all CloudFormation template files
    const templateFiles = await this.findCloudFormationTemplates(projectPath);

    // Update runtime in each template
    for (const filePath of templateFiles) {
      const content = await this.fileService.readFile(filePath);
      const { updatedContent, fileChanges } = this.updateRuntimeInTemplate(
        content,
        targetRuntime,
        filePath
      );

      if (fileChanges.length > 0) {
        await this.fileService.writeFile(filePath, updatedContent);
        updatedFiles.push(filePath);
        changes.push(...fileChanges);
      }
    }

    return { updated_files: updatedFiles, changes };
  }

  /**
   * Find all CloudFormation template files in amplify/backend/function
   */
  private async findCloudFormationTemplates(
    projectPath: string
  ): Promise<string[]> {
    const templates: string[] = [];
    const functionPath = `${projectPath}/amplify/backend/function`;

    try {
      const entries = await this.fileService.readDir(functionPath);
      
      for (const entryName of entries) {
        const funcDir = `${functionPath}/${entryName}`;
        
        try {
          const funcEntries = await this.fileService.readDir(funcDir);
          
          for (const fileName of funcEntries) {
            if (fileName.endsWith('-cloudformation-template.json')) {
              templates.push(`${funcDir}/${fileName}`);
            }
          }
        } catch {
          // Not a directory or can't read, skip
        }
      }
    } catch (error) {
      console.warn('No function directory found:', error);
    }

    return templates;
  }

  /**
   * Update runtime in CloudFormation template
   */
  private updateRuntimeInTemplate(
    content: string,
    targetRuntime: string,
    filePath: string
  ): { updatedContent: string; fileChanges: any[] } {
    const changes: any[] = [];
    
    try {
      const template = JSON.parse(content);
      
      if (template.Resources) {
        for (const [resourceName, resource] of Object.entries(template.Resources)) {
          const res = resource as any;
          if (res.Properties?.Runtime) {
            const oldRuntime = res.Properties.Runtime;
            
            if (
              oldRuntime.startsWith('nodejs') &&
              oldRuntime !== targetRuntime &&
              this.isRuntimeOlder(oldRuntime, targetRuntime)
            ) {
              res.Properties.Runtime = targetRuntime;
              changes.push({
                path: filePath,
                resource: resourceName,
                old_value: oldRuntime,
                new_value: targetRuntime,
              });
            }
          }
        }
      }

      return {
        updatedContent: JSON.stringify(template, null, 2),
        fileChanges: changes,
      };
    } catch (error) {
      console.error('Failed to parse template:', error);
      return { updatedContent: content, fileChanges: [] };
    }
  }

  /**
   * Check if runtime version is older than target
   */
  private isRuntimeOlder(current: string, target: string): boolean {
    const currentVersion = parseInt(current.replace(/nodejs|\.x/g, ''));
    const targetVersion = parseInt(target.replace(/nodejs|\.x/g, ''));
    return currentVersion < targetVersion;
  }
}
