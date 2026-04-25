## TUI Answer Sound Recovery

These are the terminal/TUI changes to keep if the working behavior needs to be restored.

### Config

`/Users/sadx/projects/software/opencode-vim-clean/.opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "answer_sound": true,
  "plugin": [
    [
      "./plugins/tui-smoke.tsx",
      {
        "enabled": false,
        "label": "workspace",
        "keybinds": {
          "modal": "ctrl+alt+m",
          "screen": "ctrl+alt+o",
          "home": "escape,ctrl+shift+h",
          "dialog_close": "escape,q"
        }
      }
    ]
  ]
}
```

### Sound Gate

`packages/opencode/src/cli/cmd/tui/routes/session/answer-sound.ts`

```ts
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
```

### Session Route Wiring

`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

Key behavior:

- compute `readyForPrompt` from the root session family
- require every related session to be idle
- require no assistant message in the family to still be incomplete
- pass `latestAssistantFinal` and `readyForPrompt` into `nextAnswerSoundState(...)`

Current wiring lives near the `answerSoundEnabled` / `lastAssistant` logic in that file.

### Test

`packages/opencode/test/cli/tui/session-answer-sound.test.ts`

The test suite should include coverage for:

- new final completed assistant message plays
- streaming assistant message does not play
- same completed assistant does not replay
- disabled sound does not play
- initial mount does not backfill
- prompt-not-ready does not play
- non-final completed assistant does not play
```
