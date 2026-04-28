import { describe, expect, test } from "bun:test"
import { getSidebarLocation } from "../../../src/cli/cmd/tui/feature-plugins/sidebar/location"

describe("getSidebarLocation", () => {
  test("formats the current path and preserves the git branch", () => {
    expect(
      getSidebarLocation({
        directory: "/Users/demo/work/opencode",
        branch: "feature/sidebar",
        home: "/Users/demo",
      }),
    ).toEqual({
      path: "~/work/opencode",
      parent: "~/work",
      name: "opencode",
      branch: "feature/sidebar",
    })
  })

  test("omits the branch when the directory is not a git repo", () => {
    expect(
      getSidebarLocation({
        directory: "/tmp/project",
        home: "/Users/demo",
      }),
    ).toEqual({
      path: "/tmp/project",
      parent: "/tmp",
      name: "project",
      branch: undefined,
    })
  })

  test("does not collapse directories that only share a home prefix", () => {
    expect(
      getSidebarLocation({
        directory: "/Users/demo2/project",
        home: "/Users/demo",
      }),
    ).toEqual({
      path: "/Users/demo2/project",
      parent: "/Users/demo2",
      name: "project",
      branch: undefined,
    })
  })

  test("keeps the home directory display as a single segment", () => {
    expect(
      getSidebarLocation({
        directory: "/Users/demo",
        home: "/Users/demo",
      }),
    ).toEqual({
      path: "~",
      parent: "",
      name: "~",
      branch: undefined,
    })
  })
})
