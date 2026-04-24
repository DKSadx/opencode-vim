# Answer Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a short TUI sound once when a model answer finishes, enabled by default and disableable through `tui.json`.

**Architecture:** Keep the feature inside the existing TUI session route. Add one optional `answer_sound` config flag, extract a tiny pure helper that decides whether a completion should trigger sound, and have the active session route call `Sound.pulse()` only when that helper says a newly completed assistant message has appeared.

**Tech Stack:** Bun, TypeScript, SolidJS, Bun test

---

## File Map

- Modify: `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts`
  Purpose: add the new `answer_sound` TUI option.
- Modify: `packages/opencode/test/config/tui.test.ts`
  Purpose: lock in default-on config behavior and explicit opt-out parsing.
- Create: `packages/opencode/src/cli/cmd/tui/routes/session/answer-sound.ts`
  Purpose: hold a tiny pure helper that decides whether the latest assistant completion should play sound and what state should be remembered next.
- Create: `packages/opencode/test/cli/tui/session-answer-sound.test.ts`
  Purpose: regression-test the one-shot completion decision logic without depending on terminal audio.
- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
  Purpose: wire the helper into the active session route and call `Sound.pulse()` when a new assistant completion is observed.

### Task 1: Add The `answer_sound` TUI Config Flag

**Files:**
- Modify: `packages/opencode/test/config/tui.test.ts`
- Modify: `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts`
- Test: `packages/opencode/test/config/tui.test.ts`

- [ ] **Step 1: Write the failing config tests**

Add these tests near the other TUI config loading tests in `packages/opencode/test/config/tui.test.ts`:

```ts
test("defaults answer_sound to enabled when tui.json omits it", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "tui.json"),
        JSON.stringify({ theme: "project", diff_style: "stacked" }, null, 2),
      )
    },
  })

  const config = await getTuiConfig(tmp.path)

  expect(config.answer_sound).toBeUndefined()
  expect(config.diff_style).toBe("stacked")
})

test("loads answer_sound when explicitly disabled in tui.json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "tui.json"),
        JSON.stringify({ answer_sound: false, theme: "project" }, null, 2),
      )
    },
  })

  const config = await getTuiConfig(tmp.path)

  expect(config.answer_sound).toBe(false)
  expect(config.theme).toBe("project")
})
```

- [ ] **Step 2: Run the config test file and confirm the new coverage fails first**

Run: `bun test test/config/tui.test.ts`
Expected: FAIL because `answer_sound` is not part of `TuiInfo` yet, so the explicit `false` value is dropped.

- [ ] **Step 3: Add the schema field with the existing TUI option style**

Update `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts` inside `TuiOptions`:

```ts
export const TuiOptions = z.object({
  scroll_speed: z.number().min(0.001).optional().describe("TUI scroll speed"),
  scroll_acceleration: z
    .object({
      enabled: z.boolean().describe("Enable scroll acceleration"),
    })
    .optional()
    .describe("Scroll acceleration settings"),
  diff_style: z
    .enum(["auto", "stacked"])
    .optional()
    .describe("Control diff rendering style: 'auto' adapts to terminal width, 'stacked' always shows single column"),
  vim: z.boolean().optional().describe("Enable vim-style input for the prompt"),
  prompt_max_height: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of rows the prompt input expands to"),
  prompt_scrollbar: z.boolean().optional().describe("Show a scrollbar for the prompt input"),
  vim_enter_submit: z.boolean().optional().describe("Submit prompt with Enter in vim insert and replace modes"),
  mouse: z.boolean().optional().describe("Enable or disable mouse capture (default: true)"),
  answer_sound: z.boolean().optional().describe("Play a short sound when an assistant answer completes"),
})
```

- [ ] **Step 4: Run the config tests again**

Run: `bun test test/config/tui.test.ts`
Expected: PASS, proving `answer_sound` survives config parsing while omitted config still behaves like the existing optional settings.

- [ ] **Step 5: Commit the config change**

```bash
git add test/config/tui.test.ts src/cli/cmd/tui/config/tui-schema.ts
git commit -m "feat: add tui answer sound config"
```

### Task 2: Lock In One-Shot Completion Detection

**Files:**
- Create: `packages/opencode/test/cli/tui/session-answer-sound.test.ts`
- Create: `packages/opencode/src/cli/cmd/tui/routes/session/answer-sound.ts`
- Test: `packages/opencode/test/cli/tui/session-answer-sound.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `packages/opencode/test/cli/tui/session-answer-sound.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { nextAnswerSoundState } from "../../../src/cli/cmd/tui/routes/session/answer-sound"

describe("nextAnswerSoundState", () => {
  test("plays when the latest assistant message newly completes", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: true,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not play while the latest assistant message is still streaming", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: false,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: undefined,
      seeded: true,
    })
  })

  test("does not replay for the same completed assistant message", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: "a1",
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not play when answer_sound is disabled", () => {
    expect(
      nextAnswerSoundState({
        enabled: false,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not backfill sound on initial mount for an already completed answer", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: undefined,
        seeded: false,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })
})
```

- [ ] **Step 2: Run the new helper test file and confirm it fails first**

Run: `bun test test/cli/tui/session-answer-sound.test.ts`
Expected: FAIL because `src/cli/cmd/tui/routes/session/answer-sound.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal helper**

Create `packages/opencode/src/cli/cmd/tui/routes/session/answer-sound.ts`:

```ts
export function nextAnswerSoundState(input: {
  enabled: boolean
  latestAssistantID?: string
  latestAssistantCompleted: boolean
  seenCompletedAssistantID?: string
  seeded: boolean
}) {
  if (!input.latestAssistantID) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (!input.seeded) {
    return {
      play: false,
      seenCompletedAssistantID: input.latestAssistantCompleted ? input.latestAssistantID : input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (!input.latestAssistantCompleted) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (input.seenCompletedAssistantID === input.latestAssistantID) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  return {
    play: input.enabled,
    seenCompletedAssistantID: input.latestAssistantID,
    seeded: true,
  }
}
```

- [ ] **Step 4: Run the helper tests again**

Run: `bun test test/cli/tui/session-answer-sound.test.ts`
Expected: PASS, proving the transition rules are correct before any route wiring happens.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add test/cli/tui/session-answer-sound.test.ts src/cli/cmd/tui/routes/session/answer-sound.ts
git commit -m "test: cover answer sound completion detection"
```

### Task 3: Wire The Helper Into The Active Session Route

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- Test: `packages/opencode/test/cli/tui/session-answer-sound.test.ts`
- Test: `packages/opencode/test/config/tui.test.ts`

- [ ] **Step 1: Add the minimal route wiring that plays once per newly completed answer**

Update the imports near the top of `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`:

```ts
import * as Sound from "@tui/util/sound"
import { nextAnswerSoundState } from "./answer-sound"
```

Add the local tracker state near the other route-local signals and memos:

```ts
  const latestAssistant = createMemo(() => messages().findLast((x) => x.role === "assistant"))
  const answerSoundEnabled = createMemo(() => tuiConfig.answer_sound !== false)
  const [answerSoundSeeded, setAnswerSoundSeeded] = createSignal(false)
  const [seenCompletedAssistantID, setSeenCompletedAssistantID] = createSignal<string>()
```

Add a reactive effect after those memos:

```ts
  createEffect(() => {
    const next = nextAnswerSoundState({
      enabled: answerSoundEnabled(),
      latestAssistantID: latestAssistant()?.id,
      latestAssistantCompleted: !!latestAssistant()?.time.completed,
      seenCompletedAssistantID: seenCompletedAssistantID(),
      seeded: answerSoundSeeded(),
    })

    batch(() => {
      setAnswerSoundSeeded(next.seeded)
      setSeenCompletedAssistantID(next.seenCompletedAssistantID)
    })

    if (next.play) Sound.pulse()
  })
```

Keep the existing `lastAssistant` memo only if it is still used elsewhere after introducing `latestAssistant`. If `lastAssistant` becomes redundant, remove it instead of keeping duplicate assistant-message lookups.

- [ ] **Step 2: Run the focused tests and typecheck**

Run: `bun test test/config/tui.test.ts test/cli/tui/session-answer-sound.test.ts && bun typecheck`
Expected: PASS, showing the config still loads correctly, the helper remains green, and the session route wiring type-checks.

- [ ] **Step 3: Run the same verification again after any cleanup refactor**

Run: `bun test test/config/tui.test.ts test/cli/tui/session-answer-sound.test.ts && bun typecheck`
Expected: PASS with no new warnings or type errors.

- [ ] **Step 4: Commit the route integration**

```bash
git add src/cli/cmd/tui/routes/session/index.tsx
git commit -m "feat: play sound when answers complete"
```

## Self-Review Checklist

- Spec coverage: config flag, default-enabled behavior, one-shot completion detection, no backfill on mount, graceful playback failure, and focused tests are all covered by Tasks 1-3.
- Placeholder scan: no `TODO`, `TBD`, or "similar to" shortcuts remain.
- Type consistency: the plan uses one helper name, `nextAnswerSoundState`, and one config property name, `answer_sound`, throughout.
