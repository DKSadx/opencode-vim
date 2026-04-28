import { spawn } from "node:child_process"
import { createStore, reconcile } from "solid-js/store"
import { onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"
import {
  codexUsageView,
  nextCodexUsageState,
  type CodexUsageState,
  type RateLimitReadResult,
} from "./codex-usage-machine"

const CODEX_PORT = 45123

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const initialState: CodexUsageState = {
  status: "idle",
  prompted: false,
  declined: false,
  buckets: {},
  error: undefined,
}

export const { use: useCodexUsage, provider: CodexUsageProvider } = createSimpleContext({
  name: "CodexUsage",
  init: () => {
    const [state, setState] = createStore(initialState)

    let socket: WebSocket | undefined
    let nextID = 1
    const pending = new Map<number, Pending>()

    const url = () => `ws://127.0.0.1:${CODEX_PORT}`
    const readyUrl = () => `http://127.0.0.1:${CODEX_PORT}/readyz`

    const apply = (event: Parameters<typeof nextCodexUsageState>[1]) => {
      setState(reconcile(nextCodexUsageState(state, event)))
    }

    const send = (message: unknown) => socket?.send(JSON.stringify(message))

    const request = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<unknown>((resolve, reject) => {
        const id = nextID
        nextID += 1
        pending.set(id, { resolve, reject })
        send({ method, params, id })
      })

    const connect = async () => {
      apply({ type: "connect-started" })
      socket?.close()
      socket = new WebSocket(url())
      await new Promise<void>((resolve, reject) => {
        socket!.onopen = () => resolve()
        socket!.onerror = () => reject(new Error("Failed to connect to Codex app-server"))
      })
      socket.onclose = () => apply({ type: "connection-lost" })
      socket.onmessage = (event) => {
        const msg = JSON.parse(String(event.data))
        if (msg.method === "account/rateLimits/updated") {
          apply({ type: "read-succeeded", result: msg.params as RateLimitReadResult })
          return
        }
        if (msg.id == null) return
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        if (msg.error) {
          entry.reject(new Error(msg.error.message))
          return
        }
        entry.resolve(msg.result)
      }
      await request("initialize", {
        clientInfo: { name: "opencode_tui", title: "OpenCode TUI", version: "0.1.0" },
      })
      send({ method: "initialized", params: {} })
      apply({ type: "read-succeeded", result: (await request("account/rateLimits/read")) as RateLimitReadResult })
    }

    const waitForReady = async () => {
      for (const _ of Array.from({ length: 40 })) {
        const response = await fetch(readyUrl()).catch(() => undefined)
        if (response?.ok) return
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error("Codex app-server did not become ready")
    }

    const start = async () => {
      apply({ type: "startup-accepted" })
      const child = spawn(Bun.which("codex") ?? "codex", ["app-server", "--listen", url()], {
        detached: true,
        stdio: "ignore",
      })
      child.unref()
      await waitForReady()
      await connect()
    }

    onCleanup(() => {
      socket?.close()
      for (const entry of pending.values()) entry.reject(new Error("Codex usage context disposed"))
      pending.clear()
    })

    return {
      state,
      view: () => codexUsageView(state),
      connect,
      start,
      handleError(error: Error) {
        apply({ type: "connection-lost", error: error.message })
      },
      decline() {
        apply({ type: "startup-declined" })
      },
      resetPrompt() {
        setState("prompted", false)
        setState("declined", false)
      },
    }
  },
})
