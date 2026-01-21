# Tailwind CSS Migration Guide for alru-wasm

## Completed Steps

1. ✅ Installed Tailwind CSS dependencies (tailwindcss, postcss, autoprefixer)
2. ✅ Created `tailwind.config.js`
3. ✅ Created `postcss.config.js`
4. ✅ Updated `src/index.css` with Tailwind directives
5. ✅ Updated `src/App.tsx` to use Tailwind classes
6. ✅ Updated `src/components/CleanupDialog.tsx` to use Tailwind classes
7. ✅ Created `src/components/shared-tailwind.css` with common utility classes

## Remaining Components to Update

The following components still need to be converted from CSS modules to Tailwind:

### 1. CredentialStep.tsx
- Remove: `import "./shared.css"`
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

### 2. AppSelectionStep.tsx
- Remove: `import "./shared.css"` and `import "./AppSelectionStep.css"`
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

### 3. CloneUpdateStep.tsx
- Remove: `import "./shared.css"` and `import "./CloneUpdateStep.css"`
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

### 4. PushStep.tsx
- Remove: `import "./shared.css"` and `import "./PushStep.css"`
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

### 5. ProfileRegionStep.tsx (if exists)
- Remove CSS imports
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

### 6. PrerequisitesStep.tsx (if exists)
- Remove: `import "./shared.css"` and `import "./PrerequisitesStep.css"`
- Add: `import "./shared-tailwind.css"`
- Convert class names to Tailwind utilities

## Common Class Mappings

### Container Classes
```
.step-container → step-container (from shared-tailwind.css)
.step-container.wide → step-container-wide
```

### Button Classes
```
.button.button-primary → btn-primary
.button.button-secondary → btn-secondary
.button.button-danger → btn-danger
```

### Form Classes
```
.form-group → form-group
.form-label → form-label
.form-input → form-input
.form-select → form-select
.form-textarea → form-textarea
```

### Message Classes
```
.message.error → message-error
.message.warning → message-warning
.message.success → message-success
.message.info → message-info
.message.neutral → message-neutral
```

### Loading Classes
```
.loading-container → loading-container
.loading-inline → loading-inline
.spinner → spinner
.spinner-small → spinner-small
```

### Code Classes
```
.code-block → code-block
code (inline) → inline-code
```

### Card Classes
```
.card → card
.card-hover → card-hover
```

## Example Conversion

### Before (CSS Module):
```tsx
<div class="step-container">
  <h2>Title</h2>
  <p class="step-description">Description</p>
  <button class="button button-primary">Continue</button>
</div>
```

### After (Tailwind):
```tsx
<div class="step-container">
  <h2 class="text-2xl font-bold text-[#333] dark:text-[#eee] mb-2">Title</h2>
  <p class="text-[#666] dark:text-[#aaa] mb-8">Description</p>
  <button class="btn-primary">Continue</button>
</div>
```

## Files to Delete After Migration

Once all components are updated, these CSS files can be deleted:
- `src/App.css`
- `src/components/shared.css`
- `src/components/PrerequisitesStep.css`
- `src/components/AppSelectionStep.css`
- `src/components/CloneUpdateStep.css`
- `src/components/PushStep.css`
- `src/components/CleanupDialog.css`

## Testing

After migration:
1. Run `npm run dev` to start the development server
2. Test all components visually
3. Check dark mode functionality
4. Verify responsive behavior
5. Test all interactive elements (buttons, forms, etc.)

## Notes

- The shared-tailwind.css file uses `@apply` directive to create reusable utility classes
- All colors and spacing match the original alru project
- Dark mode is handled with `dark:` prefix
- Custom colors use bracket notation: `bg-[#396cd8]`
- Animations are preserved (fadeIn, spin)
