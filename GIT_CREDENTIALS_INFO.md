# Git Credentials for ALRU Web App

## Why GitHub Credentials Are Required

The ALRU web app runs entirely in your browser using WebContainer technology. To clone your Amplify project repository, the app needs to authenticate with GitHub using **HTTPS** (SSH is not supported in browser environments).

## What You Need

### 1. GitHub Username
Your GitHub username (e.g., `octocat`)

### 2. Personal Access Token (PAT)
A Personal Access Token that grants repository access.

**How to create a PAT:**
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "ALRU Web App")
4. Select expiration period (recommend 90 days)
5. Select scopes:
   - For **private repos**: Select `repo` (full control of private repositories)
   - For **public repos**: Select `public_repo` (access to public repositories)
6. Click "Generate token"
7. **Copy the token immediately** (you won't be able to see it again)

## When You'll Be Prompted

The app will prompt you for credentials when you click the **"Clone"** button in Step 3 (Clone & Update).

You'll see two browser prompts:
1. **First prompt:** Enter your GitHub username
2. **Second prompt:** Enter your Personal Access Token

## Security Notes

- **Credentials are NOT stored permanently** - They're only kept in memory for the duration of your browser session
- The token is only used to authenticate with GitHub for cloning and pushing
- Close your browser tab when done to clear credentials from memory
- **Never share your PAT** with anyone or commit it to a repository

## If You Don't Have Access

If you don't have access to the repository:
- Contact the repository owner to grant you access
- Or ask the owner to add you as a collaborator
- Repository visibility (public/private) determines required token scopes

## Troubleshooting

### "Authentication failed" error
- **Check your username** - Make sure it's correct
- **Check your PAT** - Make sure you copied it completely
- **Check token scopes** - Ensure your PAT has the right permissions:
  - Private repo requires `repo` scope
  - Public repo requires `public_repo` scope
- **Check token expiration** - PATs can expire, you may need to create a new one

### "Repository not found" error
- Verify the repository URL in the Amplify console
- Ensure you have access to the repository
- Check if the repository still exists

### Cancel/Close prompts
- If you cancel or close the credential prompts, the clone will fail
- Click "Retry Clone" to try again with correct credentials

## Alternative: Use Public Repositories

If you don't want to use a PAT:
- Make your repository public (if acceptable for your use case)
- You'll still need to authenticate, but can use a token with only `public_repo` scope
- Note: Most Amplify projects contain sensitive configuration and should remain private

## Future Improvements

Planned enhancements:
- Remember credentials for the browser session (after first prompt)
- Better credential input UI (form instead of browser prompts)
- Support for GitHub OAuth flow
- Credential validation before attempting clone
