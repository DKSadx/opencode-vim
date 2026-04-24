# OpenAI Usage Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate optional OpenAI usage API key and show Claude-style `5h` and `7d` usage bars in the right sidebar for OpenAI/Codex sessions without changing existing OpenAI OAuth inference auth.

**Architecture:** Keep the current sidebar context plugin as the rendering entry point. Add one small helper module that reads the new `openai-usage` auth entry, fetches and caches OpenAI usage data, and returns normalized `5h` and `7d` values for the sidebar to render. Add first-class CLI support for storing the separate usage key so users do not need to abuse the generic `Other` provider path.

**Tech Stack:** Bun, TypeScript, Solid, Effect, `@clack/prompts`, `@opentui/solid`

---

## File Structure

- Modify: `packages/opencode/src/cli/cmd/providers.ts`
  - Add a first-class `openai-usage` credential target to login/list/logout flows.
- Create: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/openai-usage.ts`
  - Read `openai-usage` auth, fetch OpenAI usage, cache results, and aggregate `5h` / `7d` token totals and percents.
- Modify: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`
  - Keep current token/cost output and append OpenAI-only usage rows with colored bars.
- Modify: `packages/opencode/test/cli/plugin-auth-picker.test.ts`
  - Add unit coverage for the special `openai-usage` credential option.
- Create: `packages/opencode/test/cli/tui/openai-usage.test.ts`
  - Test normalization, aggregation, caching, and fallback behavior.
- Create: `packages/opencode/test/cli/tui/openai-usage-sidebar.test.tsx`
  - Test rendering of OpenAI usage rows and non-OpenAI fallback.

## Implementation Notes

- Treat usage totals as token totals so the new sidebar rows match the existing token-centric context display.
- Keep `openai-usage` out of provider model lists; it is a credential target, not a model provider.
- Prefer pure helper functions in `openai-usage.ts` so most behavior is testable without mounting the TUI.
- If the remote payload does not contain a denominator for percent, return `percent: undefined` and let the UI render `--`.

### Task 1: Add First-Class `openai-usage` Credential Support

**Files:**
- Modify: `packages/opencode/src/cli/cmd/providers.ts`
- Test: `packages/opencode/test/cli/plugin-auth-picker.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `packages/opencode/test/cli/plugin-auth-picker.test.ts`:

```ts
import { test, expect, describe } from "bun:test"
import { resolvePluginProviders, SPECIAL_PROVIDER_OPTIONS } from "../../src/cli/cmd/providers"
import type { Hooks } from "@opencode-ai/plugin"

function hookWithAuth(provider: string): Hooks {
  return {
    auth: {
      provider,
      methods: [],
    },
  }
}

describe("provider credential targets", () => {
  test("includes openai-usage as a first-class special option", () => {
    expect(SPECIAL_PROVIDER_OPTIONS).toContainEqual({
      id: "openai-usage",
      name: "OpenAI usage",
      hint: "API key for 5h/7d sidebar usage",
    })
  })

  test("does not inject openai-usage into plugin provider discovery", () => {
    const result = resolvePluginProviders({
      hooks: [hookWithAuth("portkey")],
      existingProviders: {},
      disabled: new Set(),
      providerNames: {},
    })

    expect(result).toEqual([{ id: "portkey", name: "portkey" }])
    expect(result.find((item) => item.id === "openai-usage")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/plugin-auth-picker.test.ts`

Expected: FAIL because `SPECIAL_PROVIDER_OPTIONS` does not exist yet and `openai-usage` is not exposed as a first-class credential target.

- [ ] **Step 3: Write minimal implementation**

Update `packages/opencode/src/cli/cmd/providers.ts`.

Add the special credential target export near `resolvePluginProviders`:

```ts
export const SPECIAL_PROVIDER_OPTIONS = [
  {
    id: "openai-usage",
    name: "OpenAI usage",
    hint: "API key for 5h/7d sidebar usage",
  },
] as const
```

When building login options, append the new option before `Other`:

```ts
const options = [
  ...pipe(
    providers,
    values(),
    sortBy(
      (x) => priority[x.id] ?? 99,
      (x) => x.name ?? x.id,
    ),
    map((x) => ({
      label: x.name,
      value: x.id,
      hint: {
        opencode: "recommended",
        openai: "ChatGPT Plus/Pro or API key",
      }[x.id],
    })),
  ),
  ...SPECIAL_PROVIDER_OPTIONS.map((item) => ({
    label: item.name,
    value: item.id,
    hint: item.hint,
  })),
  ...pluginProviders.map((x) => ({
    label: x.name,
    value: x.id,
    hint: "plugin",
  })),
]
```

Add a specific prompt for the special usage key before the generic API-key path:

```ts
if (provider === "openai-usage") {
  prompts.log.info("This key is only used to fetch OpenAI usage for the sidebar.")
  const key = await prompts.password({
    message: "Enter your OpenAI usage API key",
    validate: (x) => (x && x.length > 0 ? undefined : "Required"),
  })
  if (prompts.isCancel(key)) throw new UI.CancelledError()
  await put("openai-usage", {
    type: "api",
    key,
  })
  prompts.outro("Done")
  return
}
```

Adjust list/logout labeling so `openai-usage` prints a human name:

```ts
const name = providerID === "openai-usage" ? "OpenAI usage" : database[providerID]?.name || providerID
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/plugin-auth-picker.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/cli/cmd/providers.ts packages/opencode/test/cli/plugin-auth-picker.test.ts
git commit -m "feat: add a dedicated OpenAI usage credential target"
```

### Task 2: Add OpenAI Usage Fetching, Caching, and Aggregation

**Files:**
- Create: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/openai-usage.ts`
- Test: `packages/opencode/test/cli/tui/openai-usage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/opencode/test/cli/tui/openai-usage.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import {
  aggregateUsageWindows,
  createOpenAIUsageLoader,
  type OpenAIUsageBucket,
} from "../../../src/cli/cmd/tui/feature-plugins/sidebar/openai-usage"

describe("openai usage aggregation", () => {
  test("computes 5h and 7d token totals from buckets", async () => {
    const now = Date.UTC(2026, 3, 24, 12, 0, 0)
    const buckets: OpenAIUsageBucket[] = [
      {
        start_time: Math.floor((now - 60 * 60 * 1000) / 1000),
        end_time: Math.floor(now / 1000),
        results: [{ input_tokens: 1000, output_tokens: 200, limit_tokens: 2000 }],
      },
      {
        start_time: Math.floor((now - 2 * 24 * 60 * 60 * 1000) / 1000),
        end_time: Math.floor((now - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) / 1000),
        results: [{ input_tokens: 500, output_tokens: 300, limit_tokens: 4000 }],
      },
    ]

    const usage = aggregateUsageWindows(buckets, now)

    expect(usage.fiveHour.totalTokens).toBe(1200)
    expect(usage.sevenDay.totalTokens).toBe(2000)
    expect(usage.fiveHour.percent).toBe(60)
    expect(usage.sevenDay.percent).toBe(33)
  })

  test("returns undefined percents when limits are absent", () => {
    const now = Date.UTC(2026, 3, 24, 12, 0, 0)
    const usage = aggregateUsageWindows(
      [
        {
          start_time: Math.floor((now - 30 * 60 * 1000) / 1000),
          end_time: Math.floor(now / 1000),
          results: [{ input_tokens: 10, output_tokens: 5 }],
        },
      ],
      now,
    )

    expect(usage.fiveHour.percent).toBeUndefined()
    expect(usage.sevenDay.percent).toBeUndefined()
  })
})

describe("openai usage loader", () => {
  test("reuses cached data for repeated reads inside ttl", async () => {
    let calls = 0
    const load = createOpenAIUsageLoader({
      ttlMs: 60_000,
      now: () => 1_000,
      getAuth: async () => "sk-usage",
      fetchUsage: async () => {
        calls += 1
        return {
          buckets: [
            {
              start_time: 0,
              end_time: 1,
              results: [{ input_tokens: 1, output_tokens: 1, limit_tokens: 10 }],
            },
          ],
        }
      },
    })

    await load()
    await load()

    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/tui/openai-usage.test.ts`

Expected: FAIL because `openai-usage.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/openai-usage.ts`:

```ts
import { AppRuntime } from "@/effect/app-runtime"
import { Auth } from "@/auth"
import { Effect } from "effect"

export const OPENAI_USAGE_AUTH_ID = "openai-usage"

export type OpenAIUsageBucket = {
  start_time: number
  end_time: number
  results: Array<{
    input_tokens: number
    output_tokens: number
    limit_tokens?: number
  }>
}

export type UsageWindow = {
  totalTokens: number
  percent?: number
}

export type UsageSnapshot = {
  fiveHour: UsageWindow
  sevenDay: UsageWindow
}

type LoaderInput = {
  ttlMs?: number
  now?: () => number
  getAuth?: () => Promise<string | undefined>
  fetchUsage?: (key: string) => Promise<{ buckets: OpenAIUsageBucket[] }>
}

function tokens(result: OpenAIUsageBucket["results"][number]) {
  return result.input_tokens + result.output_tokens
}

function summarize(buckets: OpenAIUsageBucket[]) {
  const totalTokens = buckets.flatMap((item) => item.results).reduce((sum, item) => sum + tokens(item), 0)
  const totalLimit = buckets.flatMap((item) => item.results).reduce((sum, item) => sum + (item.limit_tokens ?? 0), 0)
  return {
    totalTokens,
    percent: totalLimit > 0 ? Math.round((totalTokens / totalLimit) * 100) : undefined,
  }
}

export function aggregateUsageWindows(buckets: OpenAIUsageBucket[], now = Date.now()): UsageSnapshot {
  const fiveHourCutoff = Math.floor((now - 5 * 60 * 60 * 1000) / 1000)
  const sevenDayCutoff = Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000)

  return {
    fiveHour: summarize(buckets.filter((item) => item.end_time >= fiveHourCutoff)),
    sevenDay: summarize(buckets.filter((item) => item.end_time >= sevenDayCutoff)),
  }
}

async function readUsageAuth() {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      const result = yield* auth.get(OPENAI_USAGE_AUTH_ID)
      if (result?.type !== "api") return undefined
      return result.key
    }),
  )
}

async function fetchOpenAIUsage(key: string) {
  const response = await fetch("https://api.openai.com/v1/usage", {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) throw new Error(`OpenAI usage request failed: ${response.status}`)
  const body = await response.json()
  return {
    buckets: Array.isArray(body.data)
      ? body.data.map((item: any) => ({
          start_time: item.start_time,
          end_time: item.end_time,
          results: Array.isArray(item.result)
            ? item.result.map((result: any) => ({
                input_tokens: result.input_tokens ?? 0,
                output_tokens: result.output_tokens ?? 0,
                limit_tokens: result.limit_tokens,
              }))
            : [],
        }))
      : [],
  }
}

export function createOpenAIUsageLoader(input: LoaderInput = {}) {
  const ttlMs = input.ttlMs ?? 60_000
  const now = input.now ?? Date.now
  const getAuth = input.getAuth ?? readUsageAuth
  const fetchUsage = input.fetchUsage ?? fetchOpenAIUsage
  let cache: { expires: number; value: UsageSnapshot } | undefined

  return async () => {
    const current = now()
    if (cache && cache.expires > current) return cache.value
    const key = await getAuth()
    if (!key) return undefined
    const payload = await fetchUsage(key)
    const value = aggregateUsageWindows(payload.buckets, current)
    cache = { expires: current + ttlMs, value }
    return value
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/tui/openai-usage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/openai-usage.ts packages/opencode/test/cli/tui/openai-usage.test.ts
git commit -m "feat: add OpenAI usage loading for sidebar metrics"
```

### Task 3: Render Claude-Style `5h` and `7d` Usage in the Sidebar

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`
- Create: `packages/opencode/test/cli/tui/openai-usage-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/opencode/test/cli/tui/openai-usage-sidebar.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { formatUsageBar, formatUsageTokens, id } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/context"

describe("sidebar openai usage", () => {
  test("exports a stable plugin id", () => {
    expect(id).toBe("internal:sidebar-context")
  })

  test("formats token totals for compact sidebar display", () => {
    expect(formatUsageTokens(700)).toBe("700")
    expect(formatUsageTokens(70_700)).toBe("70.7k")
  })

  test("formats a fixed-width usage bar", () => {
    expect(formatUsageBar(undefined)).toBe("··········")
    expect(formatUsageBar(50)).toBe("■■■■■·····")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/tui/openai-usage-sidebar.test.tsx`

Expected: FAIL because `context.tsx` does not export `id`, `formatUsageTokens`, or `formatUsageBar` yet.

- [ ] **Step 3: Write minimal implementation**

Update `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`:

```tsx
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createResource, Show } from "solid-js"
import { createOpenAIUsageLoader } from "./openai-usage"

const id = "internal:sidebar-context"
const loadOpenAIUsage = createOpenAIUsageLoader()
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function formatUsageTokens(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`
}

function formatUsageBar(percent: number | undefined) {
  const width = 10
  const fill = percent === undefined ? 0 : Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return "■".repeat(fill) + "·".repeat(width - fill)
}

function UsageRow(props: { api: TuiPluginApi; label: string; percent?: number; total: number; color: string }) {
  const theme = () => props.api.theme.current
  return (
    <box flexDirection="column">
      <text fg={theme().text}>
        <span style={{ fg: props.color }}>{props.label}</span>{" "}
        <span style={{ bold: true }}>{props.percent === undefined ? "--" : `${props.percent}%`}</span>{" "}
        <span style={{ fg: props.color }}>{formatUsageBar(props.percent)}</span>
      </text>
      <text fg={theme().textMuted}>{formatUsageTokens(props.total)} tokens</text>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const cost = createMemo(() => msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0))
  const last = createMemo(() => msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0))
  const isOpenAI = createMemo(() => last()?.providerID === "openai")
  const [usage] = createResource(isOpenAI, async (enabled) => (enabled ? loadOpenAIUsage() : undefined))

  const state = createMemo(() => {
    const current = last()
    if (!current) return { tokens: 0, percent: null }
    const tokens =
      current.tokens.input +
      current.tokens.output +
      current.tokens.reasoning +
      current.tokens.cache.read +
      current.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === current.providerID)?.models[current.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{state().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      <Show when={isOpenAI()}>
        <UsageRow
          api={props.api}
          label="5h"
          percent={usage()?.fiveHour.percent}
          total={usage()?.fiveHour.totalTokens ?? 0}
          color={theme().warning}
        />
        <UsageRow
          api={props.api}
          label="7d"
          percent={usage()?.sevenDay.percent}
          total={usage()?.sevenDay.totalTokens ?? 0}
          color={theme().success}
        />
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
export { formatUsageBar, formatUsageTokens, id }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/tui/openai-usage-sidebar.test.tsx test/cli/tui/openai-usage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx packages/opencode/test/cli/tui/openai-usage-sidebar.test.tsx
git commit -m "feat: show OpenAI 5h and 7d usage in the sidebar"
```

### Task 4: Run Focused Verification and Package-Wide Checks

**Files:**
- Modify: none

- [ ] **Step 1: Run focused tests**

Run: `bun test test/cli/plugin-auth-picker.test.ts test/cli/tui/openai-usage.test.ts test/cli/tui/openai-usage-sidebar.test.tsx`

Expected: PASS

- [ ] **Step 2: Run auth regression test**

Run: `bun test test/auth/auth.test.ts`

Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `bun typecheck`

Expected: PASS with no TypeScript errors

- [ ] **Step 4: Run package test subset covering provider/auth paths**

Run: `bun test test/provider/provider.test.ts test/cli/plugin-auth-picker.test.ts test/auth/auth.test.ts`

Expected: PASS
