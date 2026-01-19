import { WebContainer } from "@webcontainer/api";

/**
 * File Service
 * Handles file operations within the WebContainer
 */
export class FileService {
  constructor(private container: WebContainer) {}

  /**
   * Read a file from the WebContainer filesystem
   * @param path Absolute path within the WebContainer
   * @returns File contents as string
   */
  async readFile(path: string): Promise<string> {
    const bytes = await this.container.fs.readFile(path);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Write a file to the WebContainer filesystem
   * @param path Absolute path within the WebContainer
   * @param content File contents as string
   */
  async writeFile(path: string, content: string): Promise<void> {
    await this.container.fs.writeFile(path, new TextEncoder().encode(content));
  }

  /**
   * Read a directory listing
   * @param path Directory path
   * @returns Array of file/directory names
   */
  async readDir(path: string): Promise<string[]> {
    return await this.container.fs.readdir(path);
  }

  /**
   * Check if a file exists
   * @param path File path
   * @returns true if file exists, false otherwise
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      await this.container.fs.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a directory (and parent directories if needed)
   * @param path Directory path
   * @param options Options (recursive flag)
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (options?.recursive) {
      await this.container.fs.mkdir(path, { recursive: true });
    } else {
      await this.container.fs.mkdir(path);
    }
  }

  /**
   * Remove a file
   * @param path File path
   */
  async removeFile(path: string): Promise<void> {
    await this.container.fs.rm(path);
  }

  /**
   * Remove a directory recursively
   * @param path Directory path
   */
  async removeDir(path: string): Promise<void> {
    await this.container.fs.rm(path, { recursive: true });
  }

  /**
   * Recursively walk a directory and yield all file paths
   * Replaces Rust's walkdir functionality
   *
   * @param dir Directory to walk
   * @param excludes Directories to exclude (node_modules, .git, etc.)
   */
  async *walkDirectory(
    dir: string,
    excludes = ["node_modules", ".git", "dist", ".amplify", "cdk.out", "build"],
  ): AsyncGenerator<string> {
    const entries = await this.container.fs.readdir(dir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      // Skip excluded directories
      if (excludes.includes(entry.name)) {
        continue;
      }

      const fullPath = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        // Recursively walk subdirectories
        yield* this.walkDirectory(fullPath, excludes);
      } else {
        // Yield file path
        yield fullPath;
      }
    }
  }

  /**
   * Find files matching a pattern (e.g., "resource.ts")
   * @param dir Directory to search in
   * @param pattern File name pattern to match
   * @param excludes Directories to exclude
   * @returns Array of matching file paths
   */
  async findFiles(
    dir: string,
    pattern: string | RegExp,
    excludes?: string[],
  ): Promise<string[]> {
    const matches: string[] = [];
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    for await (const filePath of this.walkDirectory(dir, excludes)) {
      if (regex.test(filePath)) {
        matches.push(filePath);
      }
    }

    return matches;
  }
}
