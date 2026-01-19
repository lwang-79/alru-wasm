import type { WebContainer } from "@webcontainer/api";

/**
 * Adapter to make WebContainer's FileSystem API compatible with isomorphic-git
 * isomorphic-git expects a Node.js fs-like interface with callback-based methods
 */
export function createFsAdapter(container: WebContainer) {
  const fs = container.fs;

  // Create stat function that can be reused
  const statImpl = async (filepath: string) => {
    console.log("[fsAdapter.stat] Checking:", filepath);

    try {
      // WebContainer doesn't have stat, so we try to read and determine type
      await fs.readdir(filepath, { withFileTypes: true });
      // If readdir works, it's a directory
      const result = {
        type: "dir" as const,
        mode: 0o777,
        size: 0,
        ino: 0,
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        uid: 1,
        gid: 1,
        dev: 1,
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
      };
      console.log("[fsAdapter.stat] Directory:", filepath);
      return result;
    } catch (dirError) {
      // If readdir fails, try reading as file
      try {
        const content: string | Uint8Array = await fs.readFile(filepath);
        const size =
          typeof content === "string" ? content.length : content.byteLength;
        const result = {
          type: "file" as const,
          mode: 0o666,
          size,
          ino: 0,
          mtimeMs: Date.now(),
          ctimeMs: Date.now(),
          uid: 1,
          gid: 1,
          dev: 1,
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
        };
        console.log("[fsAdapter.stat] File:", filepath, "size:", size);
        return result;
      } catch (fileError: any) {
        console.log("[fsAdapter.stat] Not found:", filepath);
        // Create proper ENOENT error that git expects
        const error: any = new Error(
          `ENOENT: no such file or directory, stat '${filepath}'`,
        );
        error.code = "ENOENT";
        error.errno = -2;
        error.path = filepath;
        error.syscall = "stat";
        throw error;
      }
    }
  };

  return {
    promises: {
      readFile: async (filepath: string, encoding?: string) => {
        try {
          const content = await fs.readFile(filepath, encoding as any);
          return content;
        } catch (err: any) {
          // Create proper ENOENT error
          const error: any = new Error(
            `ENOENT: no such file or directory, open '${filepath}'`,
          );
          error.code = "ENOENT";
          error.errno = -2;
          error.path = filepath;
          error.syscall = "open";
          throw error;
        }
      },
      writeFile: async (filepath: string, content: string | Uint8Array) => {
        // Ensure parent directory exists
        const parentDir = filepath.substring(0, filepath.lastIndexOf("/"));
        if (parentDir) {
          try {
            await fs.mkdir(parentDir, { recursive: true });
          } catch {
            // Directory may already exist
          }
        }
        await fs.writeFile(filepath, content);
      },
      unlink: async (filepath: string) => {
        await fs.rm(filepath);
      },
      readdir: async (filepath: string) => {
        return await fs.readdir(filepath);
      },
      mkdir: async (filepath: string, options?: { recursive?: boolean }) => {
        if (options?.recursive) {
          await fs.mkdir(filepath, { recursive: true });
        } else {
          await fs.mkdir(filepath);
        }
      },
      rmdir: async (filepath: string) => {
        await fs.rm(filepath, { recursive: true });
      },
      stat: statImpl,
      lstat: statImpl, // Same as stat for WebContainer (no symlinks)
      readlink: async () => {
        throw new Error("Symlinks not supported in WebContainer");
      },
      symlink: async () => {
        throw new Error("Symlinks not supported in WebContainer");
      },
      chmod: async () => {
        // WebContainer doesn't support chmod, no-op
      },
      access: async (filepath: string) => {
        // Check if file exists by trying to stat it
        try {
          await statImpl(filepath);
        } catch (err: any) {
          if (err.code === "ENOENT") {
            // For access, we throw ENOENT not EACCES for missing files
            throw err;
          }
          throw err;
        }
      },
      rename: async (oldPath: string, newPath: string) => {
        // WebContainer doesn't have rename, so copy and delete
        try {
          const content = await fs.readFile(oldPath);
          await fs.writeFile(newPath, content);
          await fs.rm(oldPath);
        } catch (err: any) {
          throw new Error(
            `Failed to rename ${oldPath} to ${newPath}: ${err.message}`,
          );
        }
      },
      rm: async (filepath: string, options?: { recursive?: boolean }) => {
        await fs.rm(filepath, { recursive: options?.recursive });
      },
    },
  };
}
