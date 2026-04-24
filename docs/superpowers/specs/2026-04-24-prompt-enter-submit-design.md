## Summary

Change prompt input handling so bare `Enter` always submits the prompt and `Shift+Enter` inserts a newline. This should apply globally, including when Vim mode is enabled and the prompt is currently in insert mode.

## Current State

- Default keybind config already defines `input_submit` as `return`.
- Default keybind config already defines `input_newline` as `shift+return,ctrl+return,alt+return,ctrl+j`.
- Vim normal mode explicitly intercepts bare `return` and submits.
- The remaining inconsistent behavior is in the prompt input stack, where insert-mode handling still allows bare `Enter` to insert a newline instead of submitting.

## Design

Update the prompt input key handling at the shared textarea/prompt layer so the global behavior is consistent:

- `Enter` submits the prompt.
- `Shift+Enter` inserts a newline.
- Existing alternate newline shortcuts remain available unless they directly conflict with this rule.
- Vim normal mode keeps its explicit submit handling, but it should align with the same global prompt semantics rather than depending on a separate insert-mode exception.

The implementation should prefer the smallest change in the existing prompt/textarea keybinding path instead of adding a Vim-only override or a new configuration toggle.

## Components Affected

- `packages/opencode/src/cli/cmd/tui/component/textarea-keybindings.ts`
  - Verify the shared textarea bindings still map `return` to submit and `shift+return` to newline.
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
  - Adjust prompt input handling if it overrides or bypasses the shared textarea bindings while Vim insert mode is active.
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-handler.ts`
  - Keep normal-mode `return` submission behavior aligned with the global rule.

## Data Flow

1. Key press is received by the prompt textarea.
2. Shared prompt input bindings decide whether the action is submit or newline.
3. Vim normal mode may intercept bare `return` before the textarea path, but insert mode should fall through to the same submit/newline rules as non-Vim input.
4. Prompt submission continues through the existing `submit()` flow without changing prompt payload structure.

## Error Handling

- No new error states are introduced.
- If the prompt is not submittable because of existing application state, the current submit guards and user feedback should remain unchanged.
- This change should not alter non-Enter navigation or editing behavior.

## Testing

Add or update focused TUI tests that cover:

- non-Vim prompt submission on bare `Enter`
- newline insertion on `Shift+Enter`
- Vim insert mode submission on bare `Enter`
- Vim normal mode submission on bare `Enter`

The tests should validate actual prompt behavior rather than duplicating keybinding logic.

## Scope

This change is intentionally limited to prompt input behavior. It does not add new configuration, does not change other textareas or dialog inputs unless they already share the prompt textarea path, and does not alter Vim motion/editing semantics outside of Enter submission behavior.
