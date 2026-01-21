# OperationCard Component

## Overview
Created a reusable `OperationCard` component to abstract common operation UI patterns in the Clone & Update step.

## Location
`/src/components/common/OperationCard.tsx`

## Features
- Dynamic step numbering
- Status-based styling (pending/running/success/failed)
- Action button with customizable labels
- Error display with retry functionality
- Support for children content
- `renderExtra` prop for custom content injection

## Current Usage
- ✅ Step 1: Clone Repository
- ✅ Step 2: Update Runtime
- ⏳ Step 3: Update Environment Variables (can be refactored)
- ⏳ Step 4: Update Build Configuration (can be refactored)
- ⏳ Step 5: Package Upgrade (can be refactored)

## Example Usage
```tsx
<OperationCard
  stepNumber={1}
  title="Clone Repository"
  description="Clone the repository and detect project configuration"
  status={cloneStatus()}
  onAction={handleClone}
  actionLabel="Clone"
  runningLabel="Cloning..."
  successLabel="✓ Cloned"
  failedLabel="✗ Failed"
  error={cloneError()}
>
  {/* Additional content goes here */}
</OperationCard>
```

## Benefits
- Reduces code duplication (~100 lines per step)
- Consistent UI/UX across all operations
- Easier to maintain and update styling
- Type-safe with TypeScript
- Follows DRY principles

## Next Steps
To complete the refactoring, convert the remaining 3 steps to use OperationCard following the same pattern as Clone and Update Runtime steps.
