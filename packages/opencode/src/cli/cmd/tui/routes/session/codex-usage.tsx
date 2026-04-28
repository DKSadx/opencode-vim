import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useCodexUsage } from "@tui/context/codex-usage"
import { codexStartupOptions, formatCodexReset, shouldShowCodexUsage } from "@tui/context/codex-usage-machine"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"

function progress(percent: number) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)))
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`
}

export function CodexUsageSidebar() {
  const dialog = useDialog()
  const local = useLocal()
  const codex = useCodexUsage()
  const { theme } = useTheme()

  const providerID = createMemo(() => local.model.current()?.providerID)
  const visible = createMemo(() => shouldShowCodexUsage(providerID()))
  const view = createMemo(() => (visible() ? codex.view() : undefined))

  createEffect(() => {
    if (!visible()) {
      codex.resetPrompt()
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
