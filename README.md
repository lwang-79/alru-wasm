# ALRU Web App

Browser-based version of ALRU (Amplify Lambda Runtime Updater) using WebContainers, AWS SDK for JavaScript, and isomorphic-git.

## Project Status

✅ **MVP Complete!** All phases finished, ready for testing.

### User Flow

1. **AWS Credentials** - Enter AWS access key, secret key, and region
2. **App Selection** - Select Amplify app and branch
3. **Clone & Update** - Clone repo, update runtimes, configure build
4. **Push Changes** - Commit, push, and trigger Amplify build

## Tech Stack

- **Frontend**: SolidJS + TypeScript + Vite
- **Runtime**: @webcontainer/api (Node.js in browser)
- **Git**: isomorphic-git (HTTPS only)
- **AWS**: AWS SDK for JavaScript v3

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Run tests
bun run test

# Build for production
bun run build
```

## Architecture

```
src/
├── components/       # UI components (from desktop app)
├── services/         # Service layer (new)
│   ├── aws/          # AWS SDK interactions
│   ├── git/          # Git operations
│   ├── container/    # WebContainer & file operations
│   └── runtime/      # Runtime update logic
├── store/            # Global state management
└── types/            # TypeScript types
```

## Key Differences from Desktop App

1. **No Backend**: Fully browser-based, no Rust/Tauri backend
2. **Git HTTPS Only**: SSH not supported, requires Personal Access Tokens
3. **AWS Credentials**: Manual entry (no AWS CLI profiles)
4. **Session Storage**: Files exist only during browser session

## Browser Requirements

- Chrome 102+
- Edge 102+
- Safari 16.4+

## Known Limitations

- Repository size limited by browser memory (~500MB recommended max)
- Git operations require HTTPS (no SSH support)
- AWS credentials stored in sessionStorage (cleared on browser close)
- Gen1 Amplify support deferred to Phase 2
