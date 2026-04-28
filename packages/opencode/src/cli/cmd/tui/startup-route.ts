import type { Args } from "./context/args"
import type { Route } from "./context/route"

type StartupRouteAction = { type: "none" } | { type: "create" } | { type: "session"; sessionID: string }

export function getStartupRouteAction(input: {
  route: Route
  args: Args
  status: "loading" | "partial" | "complete"
  sessions: unknown[]
}): StartupRouteAction {
  if (input.route.type !== "home" || !input.route.startup) return { type: "none" }
  if (input.args.continue || input.args.sessionID) return { type: "none" }
  if (input.status !== "complete") return { type: "none" }
  return { type: "create" }
}
