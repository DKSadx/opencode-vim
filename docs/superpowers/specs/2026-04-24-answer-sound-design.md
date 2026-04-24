# Answer Sound Design

## Goal

Play a short sound in the opencode TUI when an assistant answer finishes, using the existing audio helper and keeping the behavior configurable.

## Scope

This design covers:

- a new TUI config flag for answer-complete sound
- detecting when the latest assistant message transitions from streaming to completed
- playing a short completion sound once per completed assistant answer
- focused test coverage for completion detection and config gating

This design does not change:

- existing decorative logo sound behavior
- tool progress or tool completion sounds
- desktop or OS-level notification systems
- non-TUI surfaces

## Current Context

The TUI package already depends on `cli-sound`, and `packages/opencode/src/cli/cmd/tui/util/sound.ts` provides reusable sound primitives:

- `start()` for a longer charging hum
- `stop()` to stop the hum
- `pulse()` for a short one-shot sound

Today, those primitives are used by the animated logo component in `packages/opencode/src/cli/cmd/tui/component/logo.tsx`, but they are not wired to assistant response completion.

The session route in `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` already derives the current message list and exposes assistant completion state through message timestamps, including `message.time.completed`. That makes the session route the smallest correct place to detect when an answer has just finished.

## Requirements

- play a short sound when an assistant answer completes in the active session view
- enable the feature by default
- allow users to disable it in `tui.json`
- do not play during partial streaming
- do not replay repeatedly for the same completed message
- do not play merely because an already-completed session is opened or re-rendered
- fail silently when audio playback is unavailable

## Proposed Architecture

### 1. TUI Config Flag

Add `answer_sound` to `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts` as an optional boolean.

Behavior:

- `undefined`: treated as enabled
- `true`: enabled
- `false`: disabled

This keeps the feature consistent with existing TUI config handling while preserving the requested default-on behavior.

### 2. Completion Detection In Session Route

Handle answer-complete sound in `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`.

The route already owns:

- the active `route.sessionID`
- the current session message list
- TUI config access through `useTuiConfig()`

Add a small local completion tracker that remembers the last assistant message ID that was already seen in a completed state.

Behavior:

- on initial mount, seed the tracker from the current latest assistant message so existing completed history is silent
- when the latest assistant message changes from incomplete to completed, and the tracker does not yet match that message ID, play the sound and update the tracker
- if the latest assistant message is still streaming, do nothing
- if the same completed message is seen again through reactive re-renders, do nothing

This keeps the implementation local to the active session screen and avoids introducing a broader event-notification subsystem.

### 3. Sound Playback

Reuse `packages/opencode/src/cli/cmd/tui/util/sound.ts` and call `pulse()` for answer completion.

`pulse()` is the right primitive because:

- it is already implemented for one-shot playback
- it is shorter and less intrusive than `start()` or `stop()`
- it matches the semantics of a completion notification rather than an in-progress effect

No new audio assets are needed for the first version.

## Data Flow

1. The session route reads the current message list for `route.sessionID`.
2. The route derives the latest assistant message.
3. The route checks `tuiConfig.answer_sound`, defaulting to enabled when unset.
4. On initial observation, it records the currently latest assistant completion state without playing audio.
5. When that latest assistant message later gains `time.completed`, the route calls `Sound.pulse()`.
6. The route updates its local tracker so the same completion is not replayed.

## Error Handling

### Audio Backend Unavailable

- no toast
- no session error state
- no retry UI
- playback remains best-effort through the existing sound helper behavior

### Config Missing

- use the default enabled behavior

### Session Re-render Or History Load

- do not backfill sounds for already-completed assistant messages
- only react to a newly observed completion transition after the route is active

## Testing Strategy

Follow TDD for implementation.

Prefer a small pure helper for the completion decision instead of testing terminal audio directly.

### Helper Tests

Add failing tests for a pure helper that decides whether to play the answer-complete sound based on:

- current latest assistant message ID
- whether that message is completed
- previously seen completed assistant message ID
- whether `answer_sound` is enabled

Cover:

- plays when the latest assistant message newly completes
- does not play while the latest assistant message is still streaming
- does not replay for the same completed assistant message
- does not play when `answer_sound` is false
- does not play on initial mount when the latest assistant message is already completed

### Session Integration

Keep the route change minimal by calling the pure helper from the existing reactive session view logic. No direct audio assertions are needed in a route-level test if the helper fully covers the transition logic and the route only wires `Sound.pulse()` behind that boolean decision.

## File Impact

Expected touched areas:

- `packages/opencode/src/cli/cmd/tui/config/tui-schema.ts`
  - add `answer_sound`
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
  - detect new assistant completion transitions and trigger playback once
- a new small pure helper near the session route or TUI utilities
  - encapsulate the one-shot completion decision for testing
- tests in `packages/opencode/test/cli/tui/`
  - verify completion detection and config gating

## Notes

This design intentionally keeps the behavior limited to the active session route rather than wiring global session-complete events. That is the smaller change, uses existing state already present in the TUI, and leaves room to add broader notification behavior later if needed.
