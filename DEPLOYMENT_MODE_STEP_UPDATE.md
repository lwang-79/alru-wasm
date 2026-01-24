# Deployment Mode Step Update

## Changes Made

### 1. Deployment Mode as Step 1
Converted the "Deployment Mode" section from a simple radio button group into a proper OperationCard step, matching the style of the "Merge Decision" step.

**Features**:
- Now appears as Step 1 in the wizard
- Uses card-based selection buttons (not radio buttons)
- Visual feedback with border highlighting
- Disabled after selection is made and push starts

### 2. Default to Test Branch (Recommended)
- Test branch is now the default selection
- Marked with a green "Recommended" badge
- Safer deployment strategy by default

### 3. Dangerous Styling for Current Branch
The "Deploy to Current Branch" option now has warning styling:
- ⚠️ Warning emoji
- Red border when selected (`border-red-500`)
- Red background when selected (`bg-red-50` / `dark:bg-red-900/30`)
- Red text for title and description
- Hover state shows red border hint
- Clear warning message: "Push directly to {branch} (no testing)"

### 4. Updated Step Numbers
All subsequent steps have been renumbered:
- **Step 1**: Deployment Mode (NEW)
- **Step 2**: Push Changes (was Step 1)
- **Step 3**: Merge Decision (was Step 2) - test branch only
- **Step 4**: Push to Current Branch (was Step 3) - conditional
- **Step 5**: Branch Cleanup (was Step 4) - test branch only

### 5. State Reset on Mode Change
When changing deployment mode, the component now resets:
- Push status
- Errors
- Commit hash
- Target branch
- Amplify job
- Post-test selection
- Management status

This prevents stale state from previous deployment attempts.

### 6. Progressive Disclosure
Step 2 (Push Changes) only appears after Step 1 (Deployment Mode) is completed:
```tsx
<Show when={deploymentMode()}>
  <OperationCard stepNumber={2} ...>
```

## Visual Design

### Test Branch Option (Recommended)
```
┌─────────────────────────────────────────┐
│ 🧪 Deploy to Test Branch  [Recommended] │
│                                          │
│ Create a temporary branch for safe      │
│ testing before merging                   │
└─────────────────────────────────────────┘
```
- Blue border when selected
- Blue background
- Green "Recommended" badge
- Positive, safe messaging

### Current Branch Option (Dangerous)
```
┌─────────────────────────────────────────┐
│ ⚠️ Deploy to Current Branch             │
│                                          │
│ Push directly to dev (no testing)       │
└─────────────────────────────────────────┘
```
- Red border when selected
- Red background
- Red text
- Warning emoji
- Clear danger messaging

## User Flow

### Test Branch Flow (Recommended)
1. **Step 1**: Select "Deploy to Test Branch" ✅ Default
2. **Step 2**: Push changes to test branch
3. Wait for Amplify job to complete
4. **Step 3**: Choose merge strategy (Push to Current or Manual)
5. **Step 4**: (If "Push to Current") Merge and push
6. **Step 5**: (Optional) Delete test branch
7. Click Finish

### Current Branch Flow (Direct)
1. **Step 1**: Select "Deploy to Current Branch" ⚠️ Warning
2. **Step 2**: Push changes directly to current branch
3. Wait for Amplify job to complete
4. Click Finish

## Benefits

1. **Safer Default**: Test branch is now the default, encouraging safer deployments
2. **Clear Warning**: Current branch option clearly marked as dangerous
3. **Consistent UI**: Deployment mode selection matches merge decision style
4. **Progressive Steps**: All steps follow the same OperationCard pattern
5. **Better UX**: Visual hierarchy makes the recommended path obvious
6. **State Management**: Proper reset when changing modes prevents confusion

## Code Changes

### New Function
```typescript
const getDeploymentModeStatus = (): OperationStatus => {
  if (deploymentMode()) return "success";
  return "pending";
};
```

### Updated setDeploymentMode
Now resets all related state when mode changes to prevent stale data.

### Default Selection
```typescript
onMount(() => {
  // ...
  if (!deploymentMode()) {
    setDeploymentMode("test");
  }
});
```

## Accessibility

- Buttons are keyboard accessible
- Clear visual states (default, hover, selected, disabled)
- Descriptive text for screen readers
- Proper semantic HTML structure
