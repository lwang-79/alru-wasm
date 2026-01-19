# Credential Management Improvements

## Summary

Updated the credential management system to store both AWS and GitHub credentials in Step 1, eliminating the need for popup prompts during repository cloning.

## Changes Made

### 1. Enhanced CredentialService

**File:** `src/services/aws/credentialService.ts`

**New Interfaces:**
```typescript
interface GitCredentials {
  username: string;
  token: string; // Personal Access Token
}

interface AllCredentials extends AWSCredentials {
  git?: GitCredentials;
}
```

**New Methods:**
- `getGitCredentials()` - Retrieve stored GitHub credentials
- `setGitCredentials(gitCreds)` - Update GitHub credentials
- `hasGitCredentials()` - Check if GitHub credentials exist

**Updated Methods:**
- `setCredentials()` - Now accepts `AllCredentials` (includes git field)
- `getCredentials()` - Now returns `AllCredentials`

### 2. Enhanced CredentialStep Component

**File:** `src/components/CredentialStep.tsx`

**New UI Elements:**
- Section heading: "GitHub Credentials (for repository access)"
- GitHub Username input field (optional)
- GitHub Personal Access Token input field (optional)
- Help text with link to create PAT: https://github.com/settings/tokens

**Behavior:**
- GitHub credentials are **optional** (no validation required)
- Saved together with AWS credentials when both are provided
- Useful for private repositories that require authentication
- Public repositories can skip GitHub credentials

### 3. Updated CloneUpdateStep Component

**File:** `src/components/CloneUpdateStep.tsx`

**New Function:**
```typescript
getGitCredentials() {
  // 1. Try to load from credentialService
  const storedCreds = credentialService.getGitCredentials();
  if (storedCreds) return storedCreds;
  
  // 2. Fallback to prompt (if not configured in Step 1)
  return promptUser();
}
```

**Updated UI:**
- Shows different messages based on credential availability:
  - **With credentials**: "✓ Using GitHub credentials from Step 1"
  - **Without credentials**: "⚠️ Configure GitHub credentials in Step 1 for automatic authentication"

**Improved Error Messages:**
- If prompting is needed, error messages now suggest: "Please go back to Step 1 to configure credentials."

## User Experience Flow

### Before (Old Behavior)
1. Enter AWS credentials in Step 1
2. Select app/branch in Step 2
3. Click Clone in Step 3
4. **Browser popup**: "Enter GitHub username"
5. **Browser popup**: "Enter Personal Access Token"
6. Clone proceeds

### After (New Behavior)
1. Enter AWS credentials **and GitHub credentials** in Step 1
2. Select app/branch in Step 2
3. Click Clone in Step 3
4. Clone proceeds **automatically** using stored credentials ✨

## Benefits

### ✅ Better User Experience
- No interruption with browser prompts during workflow
- Enter credentials once, use everywhere
- Clear indication of credential status in UI

### ✅ More Secure
- Credentials stored in sessionStorage (same as AWS creds)
- Cleared when browser closes
- No repeated credential entry reduces exposure

### ✅ More Convenient
- Set and forget - credentials persist for the session
- Easy to update credentials (just go back to Step 1)
- Graceful fallback to prompts if not configured

### ✅ Flexible
- GitHub credentials are optional
- Can work with public repositories without GitHub auth
- Fallback prompts still available for edge cases

## Storage Details

**Storage Location:** `sessionStorage` (key: `alru_credentials`)

**Storage Format:**
```json
{
  "accessKeyId": "AKIA...",
  "secretAccessKey": "...",
  "sessionToken": "...",
  "region": "us-east-1",
  "git": {
    "username": "octocat",
    "token": "ghp_..."
  }
}
```

**Encoding:** Base64 (TODO: Upgrade to Web Crypto API in production)

**Lifetime:** Session-scoped (cleared on browser close)

## Security Considerations

### Current Implementation
- Credentials stored in sessionStorage (browser-managed, per-session)
- Base64 encoding (obfuscation, not encryption)
- Cleared automatically when browser/tab closes
- No server-side storage

### Production Recommendations
1. **Upgrade to Web Crypto API** - Use SubtleCrypto for actual encryption
2. **Add credential rotation** - Prompt users to update credentials periodically
3. **Implement credential validation** - Test credentials before saving
4. **Add audit logging** - Track credential usage (client-side)
5. **Consider OAuth flow** - For GitHub, use OAuth instead of PAT

## GitHub PAT Requirements

When entering GitHub credentials, users need a Personal Access Token with:

**For Private Repositories:**
- Scope: `repo` (full control of private repositories)

**For Public Repositories:**
- Scope: `public_repo` (access to public repositories)

**Create at:** https://github.com/settings/tokens

## Troubleshooting

### "Configure GitHub credentials in Step 1" message appears
- **Solution:** Go back to Step 1 (AWS Credentials) and fill in GitHub Username and Token fields
- This message appears when credentials are not stored
- Optional: You can proceed without GitHub credentials for public repos

### "Please go back to Step 1 to configure credentials" error
- **Cause:** Clone operation requires authentication but credentials aren't saved
- **Solution:** Navigate back to Step 1, enter GitHub credentials, then return to Step 3

### Credentials not persisting
- **Cause:** SessionStorage is cleared when browser closes
- **Expected behavior:** Re-enter credentials each browser session for security

### "Failed to clone" with authentication error
- **Possible causes:**
  1. Token is expired (GitHub PATs can expire)
  2. Token lacks required scopes
  3. Username is incorrect
  4. Repository requires different access level
- **Solution:** Go back to Step 1, re-enter credentials with correct PAT

## Future Enhancements

### Planned Improvements
1. **Credential validation on save** - Test GitHub credentials before accepting
2. **Remember username only** - Keep username, only prompt for token
3. **OAuth integration** - Use GitHub OAuth flow instead of PAT
4. **Multiple Git providers** - Support GitLab, Bitbucket, CodeCommit
5. **Credential expiry notifications** - Warn when PAT is about to expire
6. **Import from file** - Allow uploading credentials from config file

### Not Planned (Security Concerns)
- ❌ LocalStorage persistence - Security risk (not cleared on browser close)
- ❌ Cookie storage - Can be vulnerable to XSS
- ❌ Remembering across sessions - Would require encryption at rest

## Migration Notes

### For Users Upgrading
- No action needed - new credential fields are optional
- Existing AWS credentials remain compatible
- Next time you enter credentials, you can add GitHub info

### For Developers
- `AWSCredentials` type still exists for backward compatibility
- New `AllCredentials` type is superset of `AWSCredentials`
- All existing code continues to work
- TypeScript compilation validated ✅

## Testing Checklist

### Manual Testing
- [ ] Enter AWS credentials only → Should work
- [ ] Enter AWS + GitHub credentials → Should save both
- [ ] Clone with saved GitHub credentials → Should work without prompts
- [ ] Clone without GitHub credentials → Should prompt (fallback)
- [ ] Clear credentials → Should clear both AWS and GitHub
- [ ] Refresh browser → Should require re-entering credentials
- [ ] Close and reopen browser → Should require re-entering credentials

### Edge Cases
- [ ] Invalid GitHub username → Should show error during clone
- [ ] Expired GitHub token → Should show authentication error
- [ ] Public repo without credentials → Should work
- [ ] Private repo without credentials → Should prompt or fail
- [ ] Special characters in password → Should handle correctly
