export function latestPendingRequestID(input: ReadonlyArray<{ id: string }>) {
  return input.reduce<string | undefined>((latest, item) => {
    if (!latest || item.id > latest) return item.id
    return latest
  }, undefined)
}

export function nextAnswerSoundState(input: {
  enabled: boolean
  latestAssistantID?: string
  latestAssistantCompleted: boolean
  latestAssistantFinal: boolean
  readyForPrompt: boolean
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

  if (!input.latestAssistantFinal) {
    return {
      play: false,
      seenCompletedAssistantID: input.latestAssistantID,
      seeded: true,
    }
  }

  if (!input.readyForPrompt) {
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

export function nextAttentionRequestSoundState(input: {
  enabled: boolean
  latestRequestID?: string
  seenRequestID?: string
  seeded: boolean
}) {
  if (!input.latestRequestID) {
    return {
      play: false,
      seenRequestID: input.seenRequestID,
      seeded: true,
    }
  }

  if (!input.seeded) {
    return {
      play: false,
      seenRequestID: input.latestRequestID,
      seeded: true,
    }
  }

  if (input.seenRequestID === input.latestRequestID) {
    return {
      play: false,
      seenRequestID: input.seenRequestID,
      seeded: true,
    }
  }

  return {
    play: input.enabled,
    seenRequestID: input.latestRequestID,
    seeded: true,
  }
}
