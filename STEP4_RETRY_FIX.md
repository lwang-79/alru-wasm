# Step 4 Retry UI Fix

## Problem

After retrying a failed deployment job in step 4, the UI was showing retry buttons above the job card (yellow box with "Retry Failed Deployment" button), instead of showing a simple warning inside the card like step 2 does.

## Root Cause Analysis

### Issue 1: Setting `step4LastFailedJob()` in wrong places

The `step4LastFailedJob()` was being set in multiple places:

1. ✅ **Line 1036** (checkLastJobStatusForStep4 callback) - CORRECT: Set when checking last job status for no-changes scenario
2. ❌ **Line 1063** (handlePushToCurrent) - WRONG: Set when initial job is FAILED/CANCELLED
3. ❌ **Line 1075** (polling callback) - WRONG: Set when job fails during polling

Step 2 only sets `lastFailedJob()` in the first scenario (checking last job status), NOT during push or polling.

### Issue 2: UI showing wrong job

Step 2 has TWO separate Show blocks:

- **When `lastFailedJob()` exists**: Show `lastFailedJob()` WITH retry options (title: "Last Deployment Job")
- **When `lastFailedJob()` is null**: Show `deploymentJob().job` WITHOUT retry options (title: "Current Deployment Job")

Step 4 had only ONE Show block that:

- Always showed `step4Job().job` (not `step4LastFailedJob()`)
- Conditionally set `showRetryOptions` based on `step4LastFailedJob()`

This caused the issue: after retry, `step4LastFailedJob()` was cleared but `step4Job().job` contained the new failed job. The UI was showing the new job but checking if `step4LastFailedJob()` exists to determine retry options. Since both were set initially, it appeared to work, but the logic was fundamentally wrong.

## Solution

### Fix 1: Remove incorrect `setStep4LastFailedJob()` calls

Removed the code that was setting `step4LastFailedJob()` during push and polling (lines 1063 and 1075).

### Fix 2: Split UI into two separate Show blocks (matching step 2)

Changed step 4 UI from:

```tsx
<Show when={step4Job().job}>
  <DeploymentJobCard
    job={step4Job().job} // Always showing step4Job
    showRetryOptions={!!step4LastFailedJob()} // Conditionally showing retry
  />
</Show>
```

To:

```tsx
{
  /* Show current job WITHOUT retry options */
}
<Show when={step4Job().job && !step4LastFailedJob()}>
  <DeploymentJobCard job={step4Job().job} title="Current Deployment Job" />
</Show>;

{
  /* Show last job WITH retry options */
}
<Show when={step4LastFailedJob()}>
  <DeploymentJobCard
    job={step4LastFailedJob()} // Showing lastFailedJob, not step4Job
    title="Last Deployment Job"
    showRetryOptions={true}
  />
</Show>;
```

## Expected Behavior

### Before Retry (No Changes Scenario)

- Show "NO CHANGES APPLIED" section
- Show "Last Deployment Job" card (displaying `step4LastFailedJob()`) with yellow box and retry buttons ABOVE the card
- `showRetryOptions={true}` because we're in the `step4LastFailedJob()` Show block

### After Retry Fails

- Hide "NO CHANGES APPLIED" section (because `step4Job().job` now exists)
- Show "Current Deployment Job" card (displaying `step4Job().job`) with simple yellow warning INSIDE the card
- NO retry buttons above the card
- We're in the `step4Job().job && !step4LastFailedJob()` Show block

This now matches step 2's behavior exactly.

## Test Results

All 50 tests passing ✅
