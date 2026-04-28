export type CodexUsageBucketKey = "5h" | "7d"

export type CodexUsageBucket = {
  usedPercent: number
  windowDurationMins: number
  resetsAt: number
}

export type CodexUsageState = {
  status: "idle" | "connecting" | "connected" | "offline" | "error"
  prompted: boolean
  declined: boolean
  buckets: Partial<Record<CodexUsageBucketKey, CodexUsageBucket>>
  error?: string
}

type CodexUsageEvent =
  | { type: "connect-started" }
  | { type: "read-succeeded"; result: RateLimitReadResult }
  | { type: "connection-lost"; error?: string }
  | { type: "startup-declined" }
  | { type: "startup-accepted" }

type RateLimitBucket = {
  limitId?: string | null
  secondary?: {
    usedPercent?: unknown
    windowDurationMins?: unknown
    resetsAt?: unknown
  } | null
  rateLimitReachedType?: unknown
  primary?: {
    usedPercent?: unknown
    windowDurationMins?: unknown
    resetsAt?: unknown
  } | null
}

type RateLimitReadResult = {
  rateLimits?: RateLimitBucket | null
  rateLimitsByLimitId?: Record<string, RateLimitBucket> | null
}

const bucketKey = (minutes: number) => {
  if (minutes === 300) return "5h" as const
  if (minutes === 10080) return "7d" as const
  return
}

const normalizeWindow = (window: RateLimitBucket["primary"] | RateLimitBucket["secondary"]) => {
  if (!window) return
  if (typeof window.usedPercent !== "number") return
  if (typeof window.windowDurationMins !== "number") return
  if (typeof window.resetsAt !== "number") return
  const key = bucketKey(window.windowDurationMins)
  if (!key) return
  return {
    key,
    value: {
      usedPercent: window.usedPercent,
      windowDurationMins: window.windowDurationMins,
      resetsAt: window.resetsAt,
    },
  }
}

export function normalizeCodexBuckets(input: RateLimitReadResult) {
  const values = Object.values(input.rateLimitsByLimitId ?? {})
  const source = values.length > 0 ? values : input.rateLimits ? [input.rateLimits] : []
  return source.reduce<Partial<Record<CodexUsageBucketKey, CodexUsageBucket>>>((acc, bucket) => {
    for (const normalized of [normalizeWindow(bucket?.primary), normalizeWindow(bucket?.secondary)].filter(
      (x): x is NonNullable<typeof x> => Boolean(x),
    )) {
      acc[normalized.key] = normalized.value
    }
    return acc
  }, {})
}

export function formatCodexReset(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000)
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear().toString()
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export function shouldShowCodexUsage(providerID: string | undefined) {
  return providerID === "openai"
}

export function codexUsageView(state: CodexUsageState) {
  if (state.status === "connecting" || state.status === "idle") {
    return { type: "loading", message: "Loading Codex usage..." } as const
  }
  if (state.status === "offline" || state.status === "error") {
    return { type: "offline", message: "Codex server offline" } as const
  }

  const rows = (["5h", "7d"] as const).flatMap((key) => {
    const bucket = state.buckets[key]
    if (!bucket) return []
    return [{ key, label: `Usage (${key})`, percent: bucket.usedPercent, resetsAt: bucket.resetsAt }]
  })

  if (rows.length === 0) {
    return { type: "unavailable", message: "Codex usage unavailable" } as const
  }

  return { type: "usage", rows } as const
}

export function codexStartupOptions() {
  return [
    {
      title: "Start server",
      value: "start" as const,
      description: "Launch local Codex app server",
    },
    {
      title: "Not now",
      value: "cancel" as const,
      description: "Keep Codex usage offline",
    },
  ]
}

export function nextCodexUsageState(state: CodexUsageState, event: CodexUsageEvent): CodexUsageState {
  if (event.type === "connect-started") return { ...state, status: "connecting", error: undefined }
  if (event.type === "startup-accepted") return { ...state, prompted: true, declined: false, status: "connecting" }
  if (event.type === "startup-declined") return { ...state, prompted: true, declined: true, status: "offline" }
  if (event.type === "connection-lost") return { ...state, status: "offline", error: event.error }
  return {
    ...state,
    status: "connected",
    error: undefined,
    buckets: normalizeCodexBuckets(event.result),
  }
}

export type { RateLimitReadResult }
