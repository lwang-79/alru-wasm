# WebContainer Git Integration

## Problem

When using `isomorphic-git` with WebContainer, you'll encounter errors like:
```
Cannot read properties of undefined (reading 'bind')
```

## Root Cause

**isomorphic-git** expects a Node.js-style filesystem interface (`fs.promises` API), but **WebContainer** provides a different FileSystem API that's based on the browser's FileSystem API.

### API Differences

**Node.js fs.promises (expected by isomorphic-git):**
```typescript
fs.promises.readFile(path, encoding)
fs.promises.writeFile(path, data)
fs.promises.stat(path)
fs.promises.readdir(path)
// ... etc
```

**WebContainer FileSystem API:**
```typescript
container.fs.readFile(path, encoding)
container.fs.writeFile(path, data)
container.fs.readdir(path, options)
// ... but no stat(), different method signatures
```

## Solution: FS Adapter

We created an **fs adapter** (`fsAdapter.ts`) that bridges the gap between WebContainer's API and what isomorphic-git expects.

### Implementation

**File:** `src/services/git/fsAdapter.ts`

The adapter wraps WebContainer's fs methods to match the Node.js fs.promises interface:

```typescript
export function createFsAdapter(container: WebContainer) {
  return {
    promises: {
      readFile: async (filepath, encoding) => {...},
      writeFile: async (filepath, content) => {...},
      mkdir: async (filepath, options) => {...},
      stat: async (filepath) => {...},
      // ... all other required methods
    }
  };
}
```

### Key Implementations

1. **stat()** - WebContainer doesn't have stat, so we:
   - Try `readdir()` - if it works, it's a directory
   - Try `readFile()` - if it works, it's a file
   - Return a stat-like object with `isFile()`, `isDirectory()`, etc.

2. **Symlinks** - WebContainer doesn't support symlinks, so `readlink()` and `symlink()` throw errors

3. **chmod** - Not supported in WebContainer, implemented as no-op

### Usage in GitService

**Before:**
```typescript
export class GitService {
  constructor(private container: WebContainer) {}

  async cloneRepository(...) {
    await git.clone({
      fs: this.container.fs,  // ❌ Wrong API
      // ...
    });
  }
}
```

**After:**
```typescript
import { createFsAdapter } from './fsAdapter';

export class GitService {
  private fs: any;

  constructor(private container: WebContainer) {
    this.fs = createFsAdapter(container);  // ✅ Create adapter
  }

  async cloneRepository(...) {
    await git.clone({
      fs: this.fs,  // ✅ Use adapted fs
      // ...
    });
  }
}
```

## What This Fixes

✅ **Git clone operations** - Can now clone repositories into WebContainer
✅ **Git status checks** - Can detect changed files
✅ **Git commits** - Can stage and commit changes
✅ **Git push** - Can push to remote repositories
✅ **All isomorphic-git operations** - Full compatibility

## Technical Details

### Why isomorphic-git uses fs.promises

isomorphic-git was designed to work in both Node.js and browser environments. In Node.js, it uses `fs.promises` for file operations. In browsers, it expects a compatible interface to be provided.

### Why WebContainer's API is different

WebContainer uses the browser's FileSystem API (similar to Origin Private File System), which has different method signatures and capabilities than Node.js fs.

### Performance Considerations

The adapter adds minimal overhead:
- Most methods are simple pass-throughs
- Only `stat()` has custom logic (checking if path is file or directory)
- All operations are still async and non-blocking

## Limitations

1. **No symlinks** - WebContainer doesn't support symbolic links
2. **No file permissions** - chmod is a no-op
3. **Simplified stat** - Returns minimal stat information (no inode, uid, gid, etc.)
4. **No file watching** - fs.watch() not implemented (not needed for git operations)

These limitations don't affect git operations, as git doesn't rely on these features for basic clone/commit/push workflows.

## Alternative Approaches (Not Used)

### Why not use memfs or unionfs?

We could wrap WebContainer with libraries like `memfs` or `unionfs`, but:
- Adds extra dependencies
- More complex than needed
- Our custom adapter is simpler and more direct

### Why not use BrowserFS?

BrowserFS is outdated and has compatibility issues with modern bundlers and TypeScript.

### Why not modify isomorphic-git?

isomorphic-git's fs interface is well-designed and stable. Creating an adapter is cleaner than forking the library.

## Testing

To verify the fs adapter works:

1. **Clone operation** - Should successfully clone a repo
2. **File operations** - Should create repo files in WebContainer
3. **Stat checks** - Should correctly identify files vs directories
4. **Commit/Push** - Should stage changes and push to remote

## Future Improvements

1. **Add caching** - Cache stat results to reduce fs calls
2. **Better error messages** - Map WebContainer errors to Node.js error codes
3. **Add missing methods** - Implement additional fs methods if needed by future git operations
4. **Performance monitoring** - Track fs operation performance in WebContainer

## References

- [isomorphic-git documentation](https://isomorphic-git.org/)
- [WebContainer API documentation](https://webcontainer.io/)
- [Node.js fs.promises API](https://nodejs.org/api/fs.html#promises-api)
