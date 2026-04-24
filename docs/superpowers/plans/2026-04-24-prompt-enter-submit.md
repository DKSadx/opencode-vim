# Prompt Enter Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bare `Enter` submit the prompt globally, including when Vim mode is enabled and the prompt is in insert or replace mode, while keeping newline entry on `Shift+Enter`.

**Architecture:** Keep the existing textarea keybindings as the source of truth for `Enter` vs `Shift+Enter`, and remove the special-case override in the prompt component that inserts a newline for Vim insert/replace mode. Add a small regression-tested helper for the prompt submit decision so the behavior is explicit and easy to verify without introducing a large prompt-mount test harness.

**Tech Stack:** Bun, TypeScript, Solid, OpenTUI, Bun test

---

## File Map

- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/submit-behavior.ts`
  - Tiny helper that defines the prompt submit/newline decision used by `onSubmit`.
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
  - Replace the Vim insert/replace newline override in `submitFromTextarea()` with the shared behavior helper.
- Create: `packages/opencode/test/cli/cmd/tui/prompt-submit-behavior.test.ts`
  - Regression tests for the prompt submit decision.
- Modify: `packages/opencode/test/cli/tui/vim-motions.test.ts`
  - Keep coverage for Vim normal-mode bare `Enter` submission so the explicit handler path remains verified.

### Task 1: Add the Failing Regression Test

**Files:**
- Create: `packages/opencode/test/cli/cmd/tui/prompt-submit-behavior.test.ts`
- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/submit-behavior.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/opencode/test/cli/cmd/tui/prompt-submit-behavior.test.ts` with this content:

```ts
import { describe, expect, test } from "bun:test"
import { promptSubmitBehavior } from "../../../../src/cli/cmd/tui/component/prompt/submit-behavior"

describe("prompt submit behavior", () => {
  test("submits from vim insert mode", () => {
    expect(
      promptSubmitBehavior({
        prompt_mode: "normal",
        vim_enabled: true,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })

  test("submits from vim replace mode", () => {
    expect(
      promptSubmitBehavior({
        prompt_mode: "normal",
        vim_enabled: true,
        vim_mode: "replace",
      }),
    ).toBe("submit")
  })

  test("submits when vim is disabled", () => {
    expect(
      promptSubmitBehavior({
        prompt_mode: "normal",
        vim_enabled: false,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })

  test("submits in shell mode", () => {
    expect(
      promptSubmitBehavior({
        prompt_mode: "shell",
        vim_enabled: true,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `packages/opencode`:

```bash
bun test test/cli/cmd/tui/prompt-submit-behavior.test.ts
```

Expected: FAIL with a module resolution error because `src/cli/cmd/tui/component/prompt/submit-behavior.ts` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/opencode/src/cli/cmd/tui/component/prompt/submit-behavior.ts` with this content:

```ts
import type { VimMode } from "../vim/vim-state"

export function promptSubmitBehavior(_input: {
  prompt_mode: "normal" | "shell"
  vim_enabled: boolean
  vim_mode: VimMode
}) {
  return "submit" as const
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `packages/opencode`:

```bash
bun test test/cli/cmd/tui/prompt-submit-behavior.test.ts
```

Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit the regression test scaffold**

```bash
git add test/cli/cmd/tui/prompt-submit-behavior.test.ts src/cli/cmd/tui/component/prompt/submit-behavior.ts
git commit -m "test: cover prompt enter submission behavior"
```

### Task 2: Remove the Vim Insert-Mode Newline Override

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:63-73`
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:863-873`
- Modify: `packages/opencode/test/cli/tui/vim-motions.test.ts:1107-1122`
- Test: `packages/opencode/test/cli/cmd/tui/prompt-submit-behavior.test.ts`
- Test: `packages/opencode/test/cli/tui/vim-motions.test.ts`

- [ ] **Step 1: Update prompt submission to use the helper**

In `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`, add the helper import near the other prompt imports:

```ts
import { promptSubmitBehavior } from "./submit-behavior"
```

Then replace `submitFromTextarea()` with:

```ts
  function submitFromTextarea() {
    const action = promptSubmitBehavior({
      prompt_mode: store.mode,
      vim_enabled: vimEnabled(),
      vim_mode: vimState.mode(),
    })

    if (action === "submit") {
      submit()
      return
    }

    input.insertText("\n")
  }
```

This removes the `cfg.vim_enter_submit` branch from prompt submission behavior while keeping the function shape small and explicit.

- [ ] **Step 2: Add a focused Vim normal-mode regression assertion**

In `packages/opencode/test/cli/tui/vim-motions.test.ts`, keep the existing normal-mode submit test and extend it so the handler still prevents default and stays in normal mode:

```ts
  test("submit from normal keeps mode and clears pending", () => {
    let calls = 0
    const ctx = createHandler("", {
      mode: "normal",
      submit() {
        calls++
      },
    })
    ctx.state.setPending("d")

    const enter = createEvent("return")
    expect(ctx.handler.handleKey(enter.event)).toBe(true)

    expect(enter.prevented()).toBe(true)
    expect(calls).toBe(1)
    expect(ctx.state.mode()).toBe("normal")
    expect(ctx.state.pending()).toBe("")
  })
```

- [ ] **Step 3: Run the focused tests**

Run from `packages/opencode`:

```bash
bun test test/cli/cmd/tui/prompt-submit-behavior.test.ts test/cli/tui/vim-motions.test.ts
```

Expected: PASS, including the new prompt submit behavior tests and the existing Vim normal-mode regression.

- [ ] **Step 4: Run package typecheck**

Run from `packages/opencode`:

```bash
bun typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the behavior change**

```bash
git add src/cli/cmd/tui/component/prompt/index.tsx src/cli/cmd/tui/component/prompt/submit-behavior.ts test/cli/cmd/tui/prompt-submit-behavior.test.ts test/cli/tui/vim-motions.test.ts
git commit -m "fix: submit prompts with enter in vim insert mode"
```

## Self-Review

- Spec coverage: the plan changes the shared prompt submission path, preserves `Shift+Enter` newline behavior by leaving textarea keybindings in place, and keeps Vim normal-mode submit behavior covered.
- Placeholder scan: no `TODO`, `TBD`, or undefined follow-up work remains.
- Type consistency: the helper uses `prompt_mode`, `vim_enabled`, and `vim_mode` consistently in both tests and implementation, and `VimMode` is imported from the existing prompt Vim state module.
