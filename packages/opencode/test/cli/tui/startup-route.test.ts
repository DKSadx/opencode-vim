import { describe, expect, test } from "bun:test"

const { getStartupRouteAction } = await import("../../../src/cli/cmd/tui/startup-route")

describe("getStartupRouteAction", () => {
  test("creates a new session on startup even when prior sessions exist", () => {
    expect(
      getStartupRouteAction({
        route: { type: "home", startup: true },
        args: {},
        status: "complete",
        sessions: [
          {
            id: "child",
            parentID: "root-new",
            time: { created: 30, updated: 30 },
          },
          {
            id: "root-old",
            time: { created: 20, updated: 20 },
          },
          {
            id: "root-new",
            time: { created: 40, updated: 40 },
          },
        ],
      }),
    ).toEqual({ type: "create" })
  })

  test("creates a new session when no root session exists", () => {
    expect(
      getStartupRouteAction({
        route: { type: "home", startup: true },
        args: {},
        status: "complete",
        sessions: [],
      }),
    ).toEqual({ type: "create" })
  })

  test("waits for sync before deciding on startup", () => {
    expect(
      getStartupRouteAction({
        route: { type: "home", startup: true },
        args: {},
        status: "loading",
        sessions: [],
      }),
    ).toEqual({ type: "none" })
  })

  test("does not override explicit navigation", () => {
    expect(
      getStartupRouteAction({
        route: { type: "home" },
        args: {},
        status: "complete",
        sessions: [{ id: "root", time: { created: 10, updated: 10 } }],
      }),
    ).toEqual({ type: "none" })
  })

  test("does not override explicit session args", () => {
    expect(
      getStartupRouteAction({
        route: { type: "home", startup: true },
        args: { continue: true },
        status: "complete",
        sessions: [{ id: "root", time: { created: 10, updated: 10 } }],
      }),
    ).toEqual({ type: "none" })
  })
})
