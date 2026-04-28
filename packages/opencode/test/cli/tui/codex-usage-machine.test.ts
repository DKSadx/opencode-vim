import { describe, expect, test } from "bun:test"
import {
  codexStartupOptions,
  formatCodexReset,
  nextCodexIntervalState,
  nextCodexRefreshState,
  normalizeCodexBuckets,
  shouldShowCodexUsage,
  codexUsageView,
  nextCodexUsageState,
  type CodexUsageState,
} from "../../../src/cli/cmd/tui/context/codex-usage-machine"

describe("normalizeCodexBuckets", () => {
  test("keeps only 5h and 7d buckets from rateLimitsByLimitId", () => {
    expect(
      normalizeCodexBuckets({
        rateLimits: null,
        rateLimitsByLimitId: {
          codex_5h: {
            limitId: "codex_5h",
            primary: { usedPercent: 48, windowDurationMins: 300, resetsAt: 1730947200 },
            secondary: null,
            rateLimitReachedType: null,
          },
          codex_7d: {
            limitId: "codex_7d",
            primary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1731552000 },
            secondary: null,
            rateLimitReachedType: null,
          },
          codex_other: {
            limitId: "codex_other",
            primary: { usedPercent: 99, windowDurationMins: 60, resetsAt: 1730900000 },
            secondary: null,
            rateLimitReachedType: null,
          },
        },
      }),
    ).toEqual({
      "5h": { usedPercent: 48, windowDurationMins: 300, resetsAt: 1730947200 },
      "7d": { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1731552000 },
    })
  })

  test("falls back to rateLimits when the bucket map is missing", () => {
    expect(
      normalizeCodexBuckets({
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1730947200 },
          secondary: null,
          rateLimitReachedType: null,
        },
      }),
    ).toEqual({
      "5h": { usedPercent: 33, windowDurationMins: 300, resetsAt: 1730947200 },
    })
  })

  test("reads 5h and 7d buckets from primary and secondary windows on the same limit", () => {
    expect(
      normalizeCodexBuckets({
        rateLimits: {
          limitId: "codex",
          primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 1730947200 },
          secondary: { usedPercent: 61, windowDurationMins: 10080, resetsAt: 1731552000 },
          rateLimitReachedType: null,
        },
      }),
    ).toEqual({
      "5h": { usedPercent: 33, windowDurationMins: 300, resetsAt: 1730947200 },
      "7d": { usedPercent: 61, windowDurationMins: 10080, resetsAt: 1731552000 },
    })
  })

  test("drops malformed buckets", () => {
    expect(
      normalizeCodexBuckets({
        rateLimitsByLimitId: {
          broken: {
            limitId: "broken",
            primary: { usedPercent: "nope", windowDurationMins: 300, resetsAt: null },
            secondary: null,
            rateLimitReachedType: null,
          },
        },
      }),
    ).toEqual({})
  })
})

describe("shouldShowCodexUsage", () => {
  test("shows only for the openai provider", () => {
    expect(shouldShowCodexUsage("openai")).toBe(true)
    expect(shouldShowCodexUsage("anthropic")).toBe(false)
    expect(shouldShowCodexUsage(undefined)).toBe(false)
  })
})

describe("codexUsageView", () => {
  test("returns offline after the user declined startup", () => {
    const state: CodexUsageState = {
      status: "offline",
      prompted: true,
      declined: true,
      buckets: {},
      error: undefined,
    }
    expect(codexUsageView(state)).toEqual({ type: "offline", message: "Codex server offline" })
  })

  test("returns usage rows when matching buckets exist", () => {
    const state: CodexUsageState = {
      status: "connected",
      prompted: true,
      declined: false,
      buckets: {
        "5h": { usedPercent: 48, windowDurationMins: 300, resetsAt: 1730947200 },
        "7d": { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1731552000 },
      },
      error: undefined,
    }
    expect(codexUsageView(state)).toEqual({
      type: "usage",
      rows: [
        { key: "5h", label: "Usage (5h)", percent: 48, resetsAt: 1730947200 },
        { key: "7d", label: "Usage (7d)", percent: 12, resetsAt: 1731552000 },
      ],
    })
  })
})

describe("nextCodexUsageState", () => {
  test("records a declined startup without dropping offline status", () => {
    expect(
      nextCodexUsageState(
        {
          status: "offline",
          prompted: false,
          declined: false,
          buckets: {},
          error: undefined,
        },
        { type: "startup-declined" },
      ),
    ).toEqual({
      status: "offline",
      prompted: true,
      declined: true,
      buckets: {},
      error: undefined,
    })
  })

  test("stores normalized buckets after a successful read", () => {
    expect(
      nextCodexUsageState(
        {
          status: "connecting",
          prompted: true,
          declined: false,
          buckets: {},
          error: undefined,
        },
        {
          type: "read-succeeded",
          result: {
            rateLimitsByLimitId: {
              codex_7d: {
                limitId: "codex_7d",
                primary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1731552000 },
              },
            },
          },
        },
      ),
    ).toEqual({
      status: "connected",
      prompted: true,
      declined: false,
      buckets: {
        "7d": { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1731552000 },
      },
      error: undefined,
    })
  })
})

describe("codexStartupOptions", () => {
  test("returns explicit start and not-now choices", () => {
    expect(codexStartupOptions()).toEqual([
      {
        title: "Start server",
        value: "start",
        description: "Launch local Codex app server",
      },
      {
        title: "Not now",
        value: "cancel",
        description: "Keep Codex usage offline",
      },
    ])
  })
})

describe("formatCodexReset", () => {
  test("formats reset timestamps as dd/mm/yyyy 24h time", () => {
    expect(formatCodexReset(1730947200)).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})

describe("nextCodexRefreshState", () => {
  test("refreshes when the latest assistant answer newly completes", () => {
    expect(
      nextCodexRefreshState({
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      refresh: true,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not refresh while the latest assistant answer is still running", () => {
    expect(
      nextCodexRefreshState({
        latestAssistantID: "a1",
        latestAssistantCompleted: false,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      refresh: false,
      seenCompletedAssistantID: undefined,
      seeded: true,
    })
  })

  test("does not backfill a refresh on initial mount", () => {
    expect(
      nextCodexRefreshState({
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: undefined,
        seeded: false,
      }),
    ).toEqual({
      refresh: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not replay for the same completed assistant answer", () => {
    expect(
      nextCodexRefreshState({
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        seenCompletedAssistantID: "a1",
        seeded: true,
      }),
    ).toEqual({
      refresh: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })
})

describe("nextCodexIntervalState", () => {
  test("activates interval only when visible and connected", () => {
    expect(
      nextCodexIntervalState({
        visible: true,
        connected: true,
        active: false,
      }),
    ).toEqual({
      active: true,
      start: true,
      stop: false,
    })
  })

  test("stops interval when connection is no longer connected", () => {
    expect(
      nextCodexIntervalState({
        visible: true,
        connected: false,
        active: true,
      }),
    ).toEqual({
      active: false,
      start: false,
      stop: true,
    })
  })

  test("does not start interval when sidebar is hidden", () => {
    expect(
      nextCodexIntervalState({
        visible: false,
        connected: true,
        active: false,
      }),
    ).toEqual({
      active: false,
      start: false,
      stop: false,
    })
  })

  test("stops interval when visibility turns off", () => {
    expect(
      nextCodexIntervalState({
        visible: false,
        connected: true,
        active: true,
      }),
    ).toEqual({
      active: false,
      start: false,
      stop: true,
    })
  })
})
