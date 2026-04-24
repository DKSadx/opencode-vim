export function nextAnswerSoundState(input: {
  enabled: boolean
  latestAssistantID?: string
  latestAssistantCompleted: boolean
  seenCompletedAssistantID?: string
  seeded: boolean
}) {
  if (!input.latestAssistantID) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (!input.seeded) {
    return {
      play: false,
      seenCompletedAssistantID: input.latestAssistantCompleted ? input.latestAssistantID : input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (!input.latestAssistantCompleted) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  if (input.seenCompletedAssistantID === input.latestAssistantID) {
    return {
      play: false,
      seenCompletedAssistantID: input.seenCompletedAssistantID,
      seeded: true,
    }
  }

  return {
    play: input.enabled,
    seenCompletedAssistantID: input.latestAssistantID,
    seeded: true,
  }
}
