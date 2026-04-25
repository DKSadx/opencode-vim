import { describe, expect, test } from "bun:test"
import {
  nextAnswerSoundState,
  nextAttentionRequestSoundState,
} from "../../../src/cli/cmd/tui/routes/session/answer-sound"

describe("nextAnswerSoundState", () => {
  test("plays when the latest assistant message newly completes", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: true,
        readyForPrompt: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: true,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not play while the latest assistant message is still streaming", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: false,
        latestAssistantFinal: false,
        readyForPrompt: false,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: undefined,
      seeded: true,
    })
  })

  test("does not replay for the same completed assistant message", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: true,
        readyForPrompt: true,
        seenCompletedAssistantID: "a1",
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not play when answer_sound is disabled", () => {
    expect(
      nextAnswerSoundState({
        enabled: false,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: true,
        readyForPrompt: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("does not backfill sound on initial mount for an already completed answer", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: true,
        readyForPrompt: true,
        seenCompletedAssistantID: undefined,
        seeded: false,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })

  test("waits until the prompt is ready before playing", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: true,
        readyForPrompt: false,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: undefined,
      seeded: true,
    })
  })

  test("does not play for non-final completed assistant messages", () => {
    expect(
      nextAnswerSoundState({
        enabled: true,
        latestAssistantID: "a1",
        latestAssistantCompleted: true,
        latestAssistantFinal: false,
        readyForPrompt: true,
        seenCompletedAssistantID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenCompletedAssistantID: "a1",
      seeded: true,
    })
  })
})

describe("nextAttentionRequestSoundState", () => {
  ;[
    ["permission", "permission-r1"],
    ["question", "question-r1"],
  ].forEach(([kind, latestRequestID]) => {
    test(`plays when a new ${kind} request appears`, () => {
      expect(
        nextAttentionRequestSoundState({
          enabled: true,
          latestRequestID,
          seenRequestID: undefined,
          seeded: true,
        }),
      ).toEqual({
        play: true,
        seenRequestID: latestRequestID,
        seeded: true,
      })
    })
  })

  test("does not replay for the same request", () => {
    expect(
      nextAttentionRequestSoundState({
        enabled: true,
        latestRequestID: "r1",
        seenRequestID: "r1",
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenRequestID: "r1",
      seeded: true,
    })
  })

  test("does not backfill on initial mount", () => {
    expect(
      nextAttentionRequestSoundState({
        enabled: true,
        latestRequestID: "r1",
        seenRequestID: undefined,
        seeded: false,
      }),
    ).toEqual({
      play: false,
      seenRequestID: "r1",
      seeded: true,
    })
  })

  test("records the latest request when sound is disabled", () => {
    expect(
      nextAttentionRequestSoundState({
        enabled: false,
        latestRequestID: "r1",
        seenRequestID: undefined,
        seeded: true,
      }),
    ).toEqual({
      play: false,
      seenRequestID: "r1",
      seeded: true,
    })
  })

  test("keeps seeded state when no request is present", () => {
    expect(
      nextAttentionRequestSoundState({
        enabled: true,
        latestRequestID: undefined,
        seenRequestID: "r1",
        seeded: false,
      }),
    ).toEqual({
      play: false,
      seenRequestID: "r1",
      seeded: true,
    })
  })
})
