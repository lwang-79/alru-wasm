# Push Step Multi-Wizard Implementation

## Overview
The PushStep component has been enhanced to support a multi-step wizard flow when deploying to a test branch, similar to the CloneUpdateStep pattern.

## Wizard Flow

### Step 0: Deploy Changes (Initial Push)
- User selects deployment mode:
  - **Deploy to current branch**: Direct deployment to the main branch
  - **Deploy to test branch**: Creates a new test branch (test-username-timestamp)
- Executes the push operation
- Shows deployment status and Amplify job tracking
- **For Test Branch Deployments**:
  - Waits for Amplify job to complete (SUCCEED, FAILED, or CANCELLED)
  - Shows "Waiting for deployment to complete..." message while job is running
  - Next button is disabled until job reaches terminal state
  - "Test Branch Management" section is hidden until job completes
- **Next Action**:
  - If current branch: Shows "Finish" button → Complete
  - If test branch: Shows "Next" button (enabled after job completes) → Go to Step 1

### Step 1: Merge Decision
- Displayed only after successful test branch deployment AND job completion
- User chooses how to proceed:
  - **Push to Current Branch**: Automatically merge and push to main branch
  - **Manual Merge**: User will handle merge through Git provider
- **Next Action**:
  - If "Push to Current": Go to Step 2
  - If "Manual Merge": Skip to Step 3

### Step 2: Deploy to Current Branch
- Automatically triggered when user selects "Push to Current"
- Shows progress of:
  1. Checking out the current branch
  2. Merging the test branch
  3. Pushing to remote
- Displays success/error status
- **Next Action**: After successful push → Go to Step 3

### Step 3: Branch Cleanup
- Final step showing deployment completion
- Optional cleanup: Delete test branch
  - Deletes from local repository
  - Deletes from remote repository
  - Deletes from AWS Amplify
- Shows "Finish" button to complete the wizard
- **Next Action**: Click "Finish" → Complete wizard

## Key Features

### State Management
- Uses `innerStep` state (0-3) to track wizard progress
- Preserves state during navigation using the store
- Resets when upstream dependencies change (app, branch, clone path)

### Navigation
- **Back Button**: 
  - Disabled once push starts (status = "running" or "success")
  - Disabled during operations in steps 2 and 3
- **Next Button**: 
  - Step 0 (Test Branch): Disabled until push succeeds AND Amplify job completes
  - Step 0 (Current Branch): Shows as "Finish" when push succeeds
  - Step 1: Disabled until user makes a selection
  - Step 2: Disabled until push to current branch succeeds
  - Step 3: Always enabled, shows as "Finish"

### User Experience
- Clear visual feedback at each step
- Progress indicators during operations
- "Waiting for deployment" message while Amplify job is running
- "Test Branch Management" only appears after job completion
- Error handling with retry options
- Optional cleanup (user can skip deleting test branch)

## Technical Implementation

### New Methods Added

#### GitService.merge()
```typescript
async merge(repoPath: string, branchName: string): Promise<void>
```
Merges a branch into the current branch using isomorphic-git.

#### Updated handlePushToCurrent()
Now performs a proper merge workflow:
1. Checkout current branch
2. Merge test branch
3. Push to remote

### State Variables
- `innerStep`: Current wizard step (0-3)
- `postTestSelection`: User's choice ("push" | "manual" | null)
- `managementStatus`: Status messages for branch operations
- `managementLoading`: Loading state for branch operations

### Navigation Logic

#### isNextDisabled()
- Step 0: Checks push status AND job completion for test branches
- Step 1: Checks if user made a selection
- Step 2: Checks if push to current succeeded
- Step 3: Always enabled (cleanup is optional)

#### handleSubBack()
- Disabled once push starts or completes
- Disabled during loading operations

## Benefits

1. **Safe Testing**: Deploy to test branch first, verify, then merge
2. **Job Completion Awareness**: Waits for Amplify deployment to finish before proceeding
3. **Flexibility**: Choose between automatic or manual merge
4. **Clean Workflow**: Optional cleanup of test resources
5. **User Control**: Clear decision points at each step
6. **Consistent UX**: Matches the CloneUpdateStep pattern
7. **No Premature Actions**: Prevents moving forward while deployment is in progress

## Files Modified

1. **src/components/PushStep.tsx**
   - Enhanced wizard flow with 4 steps
   - Updated UI for each step
   - Improved navigation logic
   - Added job completion checks
   - Added waiting state UI

2. **src/services/git/gitService.ts**
   - Added `merge()` method for branch merging

3. **src/store/appStore.ts**
   - Already had `innerStep` and `postTestSelection` state
   - No changes needed
