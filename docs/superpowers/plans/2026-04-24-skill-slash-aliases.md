# Skill Slash Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make installed skills show up as slash commands in the TUI so `/dummy-test <prompt>` is discoverable and continues to route trailing text to the skill.

**Architecture:** The backend command registry already exposes skills as `source: "skill"`, and prompt submission already dispatches any known slash command through `session.command(...)`. The implementation should keep that path intact, remove the frontend autocomplete filter that hides skill commands, and add focused tests that lock in command precedence and autocomplete behavior.

**Tech Stack:** Bun, TypeScript, Effect, SolidJS, Bun test

---

## File Map

- Create: `packages/opencode/test/command/command.test.ts`
  Purpose: regression tests for command registry behavior, including skill exposure and collision precedence.
- Create: `packages/opencode/test/cli/tui/prompt-autocomplete-command-options.test.ts`
  Purpose: unit tests for slash autocomplete option generation, including installed skills.
- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete-command-options.ts`
  Purpose: small pure helper that builds slash autocomplete options from registered slash commands and server commands.
- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/slash-command-input.ts`
  Purpose: tiny parser for slash command submission so empty and multiline prompt forwarding can be tested directly.
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`
  Purpose: switch the inline slash option builder to the new helper and stop hiding `source: "skill"` commands.
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
  Purpose: reuse the extracted slash input parser during submission instead of duplicating parsing inline.
- Create: `packages/opencode/test/cli/tui/prompt-slash-command-input.test.ts`
  Purpose: unit tests for empty-prompt and multiline slash parsing.
- Modify: `packages/web/src/content/docs/skills.mdx`
  Purpose: document that installed skills are available as `/skill-name <prompt>` slash commands.

### Task 1: Lock In Server Command Behavior

**Files:**
- Create: `packages/opencode/test/command/command.test.ts`
- Test: `packages/opencode/test/command/command.test.ts`

- [ ] **Step 1: Write the failing command registry tests**

```ts
import { Effect, Layer } from "effect"
import { describe, expect } from "bun:test"
import path from "path"
import { Command } from "../../src/command"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Command.defaultLayer))

describe("command.list", () => {
  it.live("includes discovered skills as commands", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".opencode", "skills", "dummy-test", "SKILL.md"),
              `---
name: dummy-test
description: A test skill.
---

# Dummy Test
`,
            ),
          )

          const command = yield* Command.Service
          const list = yield* command.list()
          const skill = list.find((item) => item.name === "dummy-test")

          expect(skill?.source).toBe("skill")
          expect(skill?.description).toBe("A test skill.")
        }),
      {
        git: true,
      },
    ),
  )

  it.live("keeps built-in or configured commands ahead of skills on name collision", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".opencode", "skills", "init", "SKILL.md"),
              `---
name: init
description: A colliding skill.
---

# Init Skill
`,
            ),
          )

          const command = yield* Command.Service
          const info = yield* command.get("init")

          expect(info?.source).toBe("command")
          expect(info?.description).toBe("guided AGENTS.md setup")
        }),
      {
        git: true,
      },
    ),
  )
})
```

- [ ] **Step 2: Run the new command test file and confirm it fails first**

Run: `bun test test/command/command.test.ts`
Expected: FAIL because the new test file does not exist yet.

- [ ] **Step 3: Create the command registry test file exactly as above**

```ts
import { Effect, Layer } from "effect"
import { describe, expect } from "bun:test"
import path from "path"
import { Command } from "../../src/command"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Command.defaultLayer))

describe("command.list", () => {
  it.live("includes discovered skills as commands", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".opencode", "skills", "dummy-test", "SKILL.md"),
              `---
name: dummy-test
description: A test skill.
---

# Dummy Test
`,
            ),
          )

          const command = yield* Command.Service
          const list = yield* command.list()
          const skill = list.find((item) => item.name === "dummy-test")

          expect(skill?.source).toBe("skill")
          expect(skill?.description).toBe("A test skill.")
        }),
      {
        git: true,
      },
    ),
  )

  it.live("keeps built-in or configured commands ahead of skills on name collision", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".opencode", "skills", "init", "SKILL.md"),
              `---
name: init
description: A colliding skill.
---

# Init Skill
`,
            ),
          )

          const command = yield* Command.Service
          const info = yield* command.get("init")

          expect(info?.source).toBe("command")
          expect(info?.description).toBe("guided AGENTS.md setup")
        }),
      {
        git: true,
      },
    ),
  )
})
```

- [ ] **Step 4: Run the command registry tests again**

Run: `bun test test/command/command.test.ts`
Expected: PASS, proving skills are already available on the backend command list and collisions still prefer built-in commands.

- [ ] **Step 5: Commit the backend regression tests**

```bash
git add test/command/command.test.ts
git commit -m "test: cover skill command registry behavior"
```

### Task 2: Expose Skill Commands In Slash Autocomplete

**Files:**
- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete-command-options.ts`
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`
- Create: `packages/opencode/test/cli/tui/prompt-autocomplete-command-options.test.ts`
- Test: `packages/opencode/test/cli/tui/prompt-autocomplete-command-options.test.ts`

- [ ] **Step 1: Write the failing autocomplete tests**

```ts
import { describe, expect, mock, test } from "bun:test"
import { autocompleteCommandOptions } from "../../../src/cli/cmd/tui/component/prompt/autocomplete-command-options"

describe("autocompleteCommandOptions", () => {
  test("includes skill commands in slash autocomplete results", () => {
    const replaceInput = mock(() => {})
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput,
    })

    expect(options.some((item) => item.display.trim() === "/dummy-test")).toBe(true)
  })

  test("uses the same insertion flow for skill commands", () => {
    const replaceInput = mock(() => {})
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput,
    })

    options[0]?.onSelect?.()

    expect(replaceInput).toHaveBeenCalledWith("/dummy-test ")
  })

  test("keeps the :mcp suffix only for MCP commands", () => {
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "deploy",
          description: "Deploy command.",
          source: "mcp",
        },
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput: () => {},
    })

    expect(options.some((item) => item.display.trim() === "/deploy:mcp")).toBe(true)
    expect(options.some((item) => item.display.trim() === "/dummy-test")).toBe(true)
  })
})
```

- [ ] **Step 2: Run the autocomplete test file and confirm it fails first**

Run: `bun test test/cli/tui/prompt-autocomplete-command-options.test.ts`
Expected: FAIL because the helper module and test file do not exist yet.

- [ ] **Step 3: Add the pure helper that builds slash autocomplete options**

Create `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete-command-options.ts`:

```ts
import type { AutocompleteOption } from "./autocomplete"

type ServerCommand = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
}

export function autocompleteCommandOptions(input: {
  slashes: AutocompleteOption[]
  serverCommands: ServerCommand[]
  replaceInput: (text: string) => void
}) {
  const results: AutocompleteOption[] = [...input.slashes]

  for (const serverCommand of input.serverCommands) {
    const label = serverCommand.source === "mcp" ? ":mcp" : ""
    results.push({
      display: "/" + serverCommand.name + label,
      description: serverCommand.description,
      onSelect: () => {
        input.replaceInput("/" + serverCommand.name + " ")
      },
    })
  }

  results.sort((a, b) => a.display.localeCompare(b.display))

  const max = results.reduce((longest, item) => Math.max(longest, item.display.length), 0)
  if (!max) return results
  return results.map((item) => ({
    ...item,
    display: item.display.padEnd(max + 2),
  }))
}
```

- [ ] **Step 4: Wire the helper into the existing autocomplete component with the minimal change**

Update `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`:

```ts
import { autocompleteCommandOptions } from "./autocomplete-command-options"
```

Replace the inline `commands` memo body with:

```ts
  const commands = createMemo((): AutocompleteOption[] =>
    autocompleteCommandOptions({
      slashes: command.slashes(),
      serverCommands: sync.data.command,
      replaceInput: (newText) => {
        const cursor = props.input().logicalCursor
        props.input().deleteRange(0, 0, cursor.row, cursor.col)
        props.input().insertText(newText)
        props.input().cursorOffset = Bun.stringWidth(newText)
      },
    }),
  )
```

This is the important behavior change: do not skip `serverCommand.source === "skill"` anymore.

- [ ] **Step 5: Add the autocomplete helper tests exactly as written in Step 1**

```ts
import { describe, expect, mock, test } from "bun:test"
import { autocompleteCommandOptions } from "../../../src/cli/cmd/tui/component/prompt/autocomplete-command-options"

describe("autocompleteCommandOptions", () => {
  test("includes skill commands in slash autocomplete results", () => {
    const replaceInput = mock(() => {})
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput,
    })

    expect(options.some((item) => item.display.trim() === "/dummy-test")).toBe(true)
  })

  test("uses the same insertion flow for skill commands", () => {
    const replaceInput = mock(() => {})
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput,
    })

    options[0]?.onSelect?.()

    expect(replaceInput).toHaveBeenCalledWith("/dummy-test ")
  })

  test("keeps the :mcp suffix only for MCP commands", () => {
    const options = autocompleteCommandOptions({
      slashes: [],
      serverCommands: [
        {
          name: "deploy",
          description: "Deploy command.",
          source: "mcp",
        },
        {
          name: "dummy-test",
          description: "A test skill.",
          source: "skill",
        },
      ],
      replaceInput: () => {},
    })

    expect(options.some((item) => item.display.trim() === "/deploy:mcp")).toBe(true)
    expect(options.some((item) => item.display.trim() === "/dummy-test")).toBe(true)
  })
})
```

- [ ] **Step 6: Run the focused tests for the new helper and the existing command registry**

Run: `bun test test/cli/tui/prompt-autocomplete-command-options.test.ts test/command/command.test.ts`
Expected: PASS, showing that skills are discoverable in slash autocomplete and still keep the existing backend command behavior.

- [ ] **Step 7: Run package typechecking**

Run: `bun typecheck`
Expected: PASS with no new type errors.

- [ ] **Step 8: Commit the autocomplete change**

```bash
git add src/cli/cmd/tui/component/prompt/autocomplete-command-options.ts src/cli/cmd/tui/component/prompt/autocomplete.tsx test/cli/tui/prompt-autocomplete-command-options.test.ts test/command/command.test.ts
git commit -m "feat: expose installed skills in slash autocomplete"
```

### Task 3: Lock In Empty And Multiline Prompt Forwarding

**Files:**
- Create: `packages/opencode/src/cli/cmd/tui/component/prompt/slash-command-input.ts`
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- Create: `packages/opencode/test/cli/tui/prompt-slash-command-input.test.ts`
- Test: `packages/opencode/test/cli/tui/prompt-slash-command-input.test.ts`

- [ ] **Step 1: Write the failing parser tests for empty and multiline slash input**

```ts
import { describe, expect, test } from "bun:test"
import { parseSlashCommandInput } from "../../../src/cli/cmd/tui/component/prompt/slash-command-input"

describe("parseSlashCommandInput", () => {
  test("returns an empty argument string when no prompt text follows the slash command", () => {
    expect(parseSlashCommandInput("/dummy-test")).toEqual({
      command: "dummy-test",
      arguments: "",
    })
  })

  test("preserves multiline prompt text after the slash command", () => {
    expect(parseSlashCommandInput("/dummy-test first line\nsecond line")).toEqual({
      command: "dummy-test",
      arguments: "first line\nsecond line",
    })
  })
})
```

- [ ] **Step 2: Run the parser test file and confirm it fails first**

Run: `bun test test/cli/tui/prompt-slash-command-input.test.ts`
Expected: FAIL because the parser helper and test file do not exist yet.

- [ ] **Step 3: Add the tiny shared slash parser helper**

Create `packages/opencode/src/cli/cmd/tui/component/prompt/slash-command-input.ts`:

```ts
export function parseSlashCommandInput(input: string) {
  const firstLineEnd = input.indexOf("\n")
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd)
  const [command, ...firstLineArgs] = firstLine.split(" ")
  const restOfInput = firstLineEnd === -1 ? "" : input.slice(firstLineEnd + 1)

  return {
    command: command.slice(1),
    arguments: firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : ""),
  }
}
```

- [ ] **Step 4: Replace the inline parsing logic in prompt submission with the helper**

Add this import in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`:

```ts
import { parseSlashCommandInput } from "./slash-command-input"
```

Replace this block:

```ts
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")
```

with:

```ts
      const parsed = parseSlashCommandInput(inputText)
```

and update the request body to:

```ts
        command: parsed.command,
        arguments: parsed.arguments,
```

- [ ] **Step 5: Add the parser tests exactly as written in Step 1**

```ts
import { describe, expect, test } from "bun:test"
import { parseSlashCommandInput } from "../../../src/cli/cmd/tui/component/prompt/slash-command-input"

describe("parseSlashCommandInput", () => {
  test("returns an empty argument string when no prompt text follows the slash command", () => {
    expect(parseSlashCommandInput("/dummy-test")).toEqual({
      command: "dummy-test",
      arguments: "",
    })
  })

  test("preserves multiline prompt text after the slash command", () => {
    expect(parseSlashCommandInput("/dummy-test first line\nsecond line")).toEqual({
      command: "dummy-test",
      arguments: "first line\nsecond line",
    })
  })
})
```

- [ ] **Step 6: Run the parser and autocomplete tests together**

Run: `bun test test/cli/tui/prompt-slash-command-input.test.ts test/cli/tui/prompt-autocomplete-command-options.test.ts test/command/command.test.ts`
Expected: PASS, confirming discoverability and the existing empty-string forwarding behavior.

- [ ] **Step 7: Commit the parser extraction**

```bash
git add src/cli/cmd/tui/component/prompt/slash-command-input.ts src/cli/cmd/tui/component/prompt/index.tsx test/cli/tui/prompt-slash-command-input.test.ts
git commit -m "test: cover slash command prompt forwarding"
```

### Task 4: Document The Slash Skill UX

**Files:**
- Modify: `packages/web/src/content/docs/skills.mdx`
- Test: `packages/web/src/content/docs/skills.mdx`

- [ ] **Step 1: Add a short usage section to the skills docs**

Insert after the existing discovery/tooling explanation in `packages/web/src/content/docs/skills.mdx`:

```mdx
## Use skills from the prompt

Installed skills are also available as slash commands in the TUI.

~~~text
/dummy-test summarize the failing tests
~~~

OpenCode routes everything after the skill name to that skill as the prompt.

If a built-in slash command and a skill share the same name, the built-in command wins.
```

- [ ] **Step 2: Verify the docs still read cleanly in context**

Run: `bun test test/cli/tui/prompt-slash-command-input.test.ts test/cli/tui/prompt-autocomplete-command-options.test.ts test/command/command.test.ts`
Expected: PASS again. No docs-specific build step is required for this small markdown change in the `opencode` package.

- [ ] **Step 3: Commit the docs update**

```bash
git add ../web/src/content/docs/skills.mdx
git commit -m "docs: explain slash aliases for installed skills"
```

## Final Verification

- [ ] **Step 1: Run the full focused verification set from `packages/opencode`**

Run: `bun test test/command/command.test.ts test/cli/tui/prompt-autocomplete-command-options.test.ts test/cli/tui/prompt-slash-command-input.test.ts && bun typecheck`
Expected: PASS on both commands.

- [ ] **Step 2: Manually verify the user-facing flow in the TUI**

Run: `bun run dev`
Expected:
- typing `/dum` shows `/dummy-test` in slash autocomplete
- selecting it inserts `/dummy-test `
- submitting `/dummy-test` forwards an empty string to the skill
- submitting `/dummy-test now whatever I type here` routes that trailing text through the existing slash command execution path

- [ ] **Step 3: Create the final implementation commit if the work was not already committed task-by-task**

```bash
git add src/cli/cmd/tui/component/prompt/autocomplete-command-options.ts src/cli/cmd/tui/component/prompt/autocomplete.tsx src/cli/cmd/tui/component/prompt/slash-command-input.ts src/cli/cmd/tui/component/prompt/index.tsx test/cli/tui/prompt-autocomplete-command-options.test.ts test/cli/tui/prompt-slash-command-input.test.ts test/command/command.test.ts ../web/src/content/docs/skills.mdx
git commit -m "feat: surface installed skills as slash commands"
```
