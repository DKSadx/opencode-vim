import { batch, createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useCodexUsage } from "@tui/context/codex-usage"
import {
  codexStartupOptions,
  formatCodexReset,
  nextCodexIntervalState,
  nextCodexRefreshState,
  shouldShowCodexUsage,
} from "@tui/context/codex-usage-machine"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"

function progress(percent: number) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)))
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`
}

export function CodexUsageSidebar(props: { sessionID: string }) {
  const dialog = useDialog()
  const local = useLocal()
  const codex = useCodexUsage()
  const sync = useSync()
  const { theme } = useTheme()
  const [refreshSeeded, setRefreshSeeded] = createSignal(false)
  const [seenCompletedAssistantID, setSeenCompletedAssistantID] = createSignal<string>()
  const [intervalActive, setIntervalActive] = createSignal(false)

  const providerID = createMemo(() => local.model.current()?.providerID)
  const visible = createMemo(() => shouldShowCodexUsage(providerID()))
  const view = createMemo(() => (visible() ? codex.view() : undefined))
  const lastAssistant = createMemo(() => {
    return (sync.data.message[props.sessionID] ?? []).findLast((message) => message.role === "assistant")
  })
  let refreshInterval: ReturnType<typeof setInterval> | undefined

  createEffect(() => {
    if (!visible()) {
      codex.resetPrompt()
      batch(() => {
        setRefreshSeeded(false)
        setSeenCompletedAssistantID(undefined)
      })
      return
    }
    if (codex.state.status === "idle") {
      void codex.connect().catch((error: Error) => {
        codex.handleError(error)
      })
      return
    }
    if (codex.state.status !== "offline") return
    if (codex.state.prompted) return
    let handled = false
    dialog.replace(
      () => (
        <DialogSelect
          title="Start Codex server"
          options={codexStartupOptions()}
          onSelect={(option) => {
            handled = true
            dialog.clear()
            if (option.value === "start") {
              void codex.start().catch((error: Error) => {
                codex.handleError(error)
              })
              return
            }
            codex.decline()
          }}
        />
      ),
      () => {
        if (handled) return
        codex.decline()
      },
    )
  })

  createEffect(() => {
    if (!visible()) {
      batch(() => {
        setRefreshSeeded(false)
        setSeenCompletedAssistantID(undefined)
      })
      return
    }

    const next = nextCodexRefreshState({
      latestAssistantID: lastAssistant()?.id,
      latestAssistantCompleted: !!lastAssistant()?.time.completed,
      seenCompletedAssistantID: seenCompletedAssistantID(),
      seeded: refreshSeeded(),
    })

    batch(() => {
      setRefreshSeeded(next.seeded)
      setSeenCompletedAssistantID(next.seenCompletedAssistantID)
    })

    if (!next.refresh) return
    void codex.refresh().catch((error: Error) => {
      codex.handleError(error)
    })
  })

  createEffect(() => {
    const next = nextCodexIntervalState({
      visible: visible(),
      connected: codex.state.status === "connected",
      active: intervalActive(),
    })

    if (next.stop && refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = undefined
    }

    if (next.start) {
      refreshInterval = setInterval(() => {
        void codex.refresh().catch((error: Error) => {
          codex.handleError(error)
        })
      }, 120000)
    }

    setIntervalActive(next.active)
  })

  onCleanup(() => {
    if (!refreshInterval) return
    clearInterval(refreshInterval)
  })

  return (
    <Show when={visible() && view()}>
      {(current) => (
        <box gap={1} flexDirection="column">
          <text fg={theme.text}>
            <b>Codex Usage</b>
          </text>
          <Switch>
            <Match when={current().type === "usage"}>
              <For each={current().rows}>
                {(row) => (
                  <box gap={0} flexDirection="column">
                    <text fg={theme.text}>{row.label}</text>
                    <text fg={theme.primary}>
                      {progress(row.percent)} {row.percent}%
                    </text>
                    <text fg={theme.textMuted}>Resets {formatCodexReset(row.resetsAt)}</text>
                  </box>
                )}
              </For>
            </Match>
            <Match when={current().type === "loading" || current().type === "offline" || current().type === "unavailable"}>
              <text fg={theme.textMuted}>{current().message}</text>
            </Match>
          </Switch>
        </box>
      )}
    </Show>
  )
}
