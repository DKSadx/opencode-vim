import { describe, expect, test } from "bun:test"
import { promptSubmitBehavior } from "../../../../src/cli/cmd/tui/component/prompt/submit-behavior"

describe("prompt submit behavior", () => {
  test("submits from vim insert mode", () => {
    expect(
      promptSubmitBehavior({
        mode: "normal",
        vim: true,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })

  test("submits from vim replace mode", () => {
    expect(
      promptSubmitBehavior({
        mode: "normal",
        vim: true,
        vim_mode: "replace",
      }),
    ).toBe("submit")
  })

  test("submits when vim is disabled", () => {
    expect(
      promptSubmitBehavior({
        mode: "normal",
        vim: false,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })

  test("submits in shell mode", () => {
    expect(
      promptSubmitBehavior({
        mode: "shell",
        vim: true,
        vim_mode: "insert",
      }),
    ).toBe("submit")
  })
})
