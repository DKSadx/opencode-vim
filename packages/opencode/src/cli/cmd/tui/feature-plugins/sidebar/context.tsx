import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo } from "solid-js"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function progress(percent: number) {
  const filled = Math.max(0, Math.min(20, Math.round(percent / 5)))
  return `${"█".repeat(filled)}${"░".repeat(20 - filled)}`
}

function progressColor(theme: TuiPluginApi["theme"]["current"], percent: number) {
  if (percent > 80) return theme.error
  if (percent > 50) return theme.warning
  return theme.success
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const cost = createMemo(() => msg().reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0))

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  return (
    <box gap={1} flexDirection="column">
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <box gap={0} flexDirection="column">
        <text fg={theme().text}>Usage</text>
        <text fg={progressColor(theme(), state().percent ?? 0)}>
          {progress(state().percent ?? 0)} {state().percent ?? 0}%
        </text>
        <text fg={theme().textMuted}>
          {state().tokens.toLocaleString()} tokens · {money.format(cost())} spent
        </text>
      </box>
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
