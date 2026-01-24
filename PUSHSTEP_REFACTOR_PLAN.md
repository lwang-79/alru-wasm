# PushStep Refactor Plan

## Goal
Transform PushStep from a multi-step wizard with Next/Back navigation to a progressive disclosure pattern like CloneUpdateStep, where all steps appear on the same page and become visible based on the completion status of previous steps.

## Current Structure (Problem)
- Uses `innerStep` state (0-3) to show different views
- Requires clicking "Next" button to progress
- Only one step visible at a time
- "Test Branch Management" section appears within Step 0

## Desired Structure (Solution)
All steps visible on same page using OperationCard components:

### Step 1: Push Changes
- **Always visible**
- Shows deployment mode selection (current/test branch)
- Shows summary of changes
- Action button: "Push Changes"
- Status: pending → running → success/failed

### Step 2: Merge Decision (Test Branch Only)
- **Visible when**: Step 1 success AND deploymentMode === "test" AND Amplify job complete
- Two options as buttons:
  - "Push to Current Branch" → triggers Step 3
  - "Manual Merge" → skips to Step 4
- No action button, selection buttons are the actions
- Status: pending (until selection made) → success (after selection)

### Step 3: Push to Current Branch (Conditional)
- **Visible when**: Step 2 selection === "push"
- Merges test branch into current branch and pushes
- Action button: "Push to Current Branch"
- Status: pending → running → success/failed

### Step 4: Branch Cleanup (Test Branch Only, Optional)
- **Visible when**: Step 2 selection made (either "push" or "manual")
- Optional cleanup of test branch
- Action button: "Delete Test Branch"
- Status: always pending (optional action)
- Can be skipped

### Finish Button
- **Enabled when**:
  - Current branch: Step 1 success
  - Test branch: Step 1 success AND job complete AND Step 2 selection made AND (if "push" selected, Step 3 success)

## Key Changes Needed

### 1. Remove innerStep Navigation
```typescript
// REMOVE these functions:
- getStepTitle()
- getStepDescription()
- handleNext()
- handleSubBack()
- isNextDisabled()

// REMOVE innerStep-based Show conditions:
- <Show when={innerStep() === 0}>
- <Show when={innerStep() === 1}>
- <Show when={innerStep() === 2}>
- <Show when={innerStep() === 3}>
```

### 2. Add OperationCard Import
```typescript
import { OperationCard } from "./common/OperationCard";
import { OperationFeedback } from "./common/OperationFeedback";
```

### 3. Update WizardStep Props
```typescript
<WizardStep
  title="Deploy Changes"
  description="Review and push your local runtime changes to AWS Amplify."
  onNext={handleFinishWizard}
  onBack={handleBack}
  nextDisabled={!canFinish()}
  backDisabled={pushStatus() === "running" || pushStatus() === "success"}
  isLoading={pushStatus() === "running" || managementLoading()}
  nextLabel="Finish"
  showNext={canFinish()}
>
```

### 4. Implement canFinish()
```typescript
const canFinish = () => {
  if (deploymentMode() === "current") {
    return pushStatus() === "success";
  } else {
    const jobComplete = amplifyJob() && ["SUCCEED", "FAILED", "CANCELLED"].includes(amplifyJob()!.status);
    if (!jobComplete || !postTestSelection()) return false;
    
    if (postTestSelection() === "push") {
      return managementStatus()?.includes("Successfully pushed to current branch");
    }
    
    return true; // manual merge selected
  }
};
```

### 5. Restructure UI with Progressive Disclosure
```tsx
<div class="space-y-6">
  {/* Summary - always visible */}
  <div class="bg-white ...">...</div>
  
  {/* Deployment Options - always visible */}
  <div class="bg-white ...">...</div>
  
  {/* Step 1: Push Changes - always visible */}
  <OperationCard
    stepNumber={1}
    title="Push Changes"
    ...
  />
  
  {/* Step 2: Merge Decision - visible after job completes */}
  <Show when={deploymentMode() === "test" && pushStatus() === "success" && amplifyJob() && ["SUCCEED", "FAILED", "CANCELLED"].includes(amplifyJob()!.status)}>
    <OperationCard
      stepNumber={2}
      title="Merge Decision"
      ...
    />
  </Show>
  
  {/* Step 3: Push to Current - visible if "push" selected */}
  <Show when={postTestSelection() === "push"}>
    <OperationCard
      stepNumber={3}
      title="Push to Current Branch"
      ...
    />
  </Show>
  
  {/* Step 4: Cleanup - visible after merge decision */}
  <Show when={deploymentMode() === "test" && postTestSelection()}>
    <OperationCard
      stepNumber={postTestSelection() === "push" ? 4 : 3}
      title="Branch Cleanup (Optional)"
      ...
    />
  </Show>
</div>
```

## Benefits
1. **Better UX**: See all completed steps and upcoming steps at once
2. **No Navigation**: No need to click Next/Back between steps
3. **Clear Progress**: Visual indication of what's done and what's next
4. **Consistent**: Matches CloneUpdateStep pattern
5. **Simpler Code**: Less state management, no step navigation logic

## Implementation Steps
1. Backup current PushStep.tsx
2. Remove innerStep navigation logic
3. Add OperationCard imports
4. Restructure UI with progressive Show conditions
5. Update WizardStep props
6. Test all flows (current branch, test branch with push, test branch with manual merge)
