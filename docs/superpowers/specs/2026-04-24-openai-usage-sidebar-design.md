# OpenAI Usage Sidebar Design

## Goal

Add Claude Code-style usage information to the right sidebar in opencode for OpenAI/Codex sessions, with `5h` usage emphasized over `7d` usage, while preserving the existing OpenAI OAuth flow used for model access.

## Scope

This design covers:

- a separate optional API key used only for OpenAI usage fetching
- sidebar rendering for OpenAI/Codex sessions
- remote usage fetching, aggregation, caching, and fallback behavior
- test coverage for aggregation and rendering behavior

This design does not change:

- existing `openai` OAuth auth used for inference
- provider selection flows for normal model usage
- non-OpenAI provider sidebar behavior

## Current Context

The current right sidebar in the TUI is rendered by `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx` and extended through sidebar feature plugins. The existing `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx` plugin already computes and displays local token usage and spend from session messages and provider metadata.

Provider credentials are not limited to shell environment variables. opencode already stores auth entries through `packages/opencode/src/auth/index.ts`, and the current `openai` entry in this environment is OAuth-backed. Testing showed that the OAuth access token cannot call `GET https://api.openai.com/v1/usage`; that endpoint returned `401 invalid_api_key`. Therefore, remote usage must use a separate API-key-based credential.

## Requirements

For OpenAI/Codex sessions only, the right sidebar should show:

- current context usage
- current session cost
- `5h` usage as totals plus percent
- `7d` usage as totals plus percent

UI requirements:

- `5h` must be visually more prominent than `7d`
- the display should feel Claude Code-inspired, including colored accents and progress-bar-like visuals
- the new display should live in the existing right sidebar area rather than a new panel

Auth requirements:

- introduce a separate optional `openai-usage` credential
- this credential must be used only for fetching OpenAI usage
- it must not replace or mutate the existing `openai` OAuth auth

Behavior requirements:

- when the usage credential is missing or remote fetch fails, the UI must degrade gracefully
- non-OpenAI/Codex sessions must not show the remote usage rows

## Proposed Architecture

### 1. Separate Auth Entry

Store a new auth record under a distinct key, `openai-usage`, using the existing auth storage service in `packages/opencode/src/auth/index.ts`.

The stored record should use the existing API auth shape:

- `type: "api"`
- `key: <OpenAI API key>`

This keeps the current `openai` OAuth record intact and avoids changing inference auth behavior.

### 2. Usage Fetch Path

Add a small OpenAI-usage-specific fetch layer that:

- reads `openai-usage` from the auth service
- does nothing if the key is absent
- calls the OpenAI usage API with the stored API key, starting with `GET /v1/usage`
- normalizes bucketed usage data into a shape the sidebar can render

This fetch path should be separate from the model provider path. It is a UI support path, not part of inference.

### 3. Aggregation Layer

Add pure aggregation helpers that compute:

- `5h` totals from recent usage buckets
- `7d` totals from recent usage buckets
- percent values for both windows

These helpers should be independent of UI rendering so they can be tested directly.

Because Claude Code-style account quota semantics are not available through the current OpenAI OAuth setup, the percent should be derived from the usage dataset and any explicit limit/quota information the remote response makes available. If no denominator is available, the UI should fall back to `--` for percent rather than inventing a misleading value.

### 4. Sidebar Integration

Extend the existing sidebar context feature plugin rather than introducing a second sidebar subsystem.

The plugin should:

- keep current local context and spend behavior
- detect whether the current session is using `openai`
- request remote usage state through the new usage-fetch path
- render additional usage rows only for OpenAI/Codex sessions

This keeps the feature aligned with the way current token usage is displayed today.

### 5. Caching

Usage responses should be cached briefly to avoid refetching on every render. A short-lived in-memory cache is sufficient because the sidebar is informational and does not require per-render freshness.

The cache should:

- store last successful usage payload and derived values
- expire after a short interval
- reuse last good values when a transient fetch error occurs

## UI Design

The usage section remains inside the existing right sidebar content area.

Suggested order:

1. Context
2. Local cost/spend
3. `5h` usage
4. `7d` usage

Rendering characteristics:

- `5h` row first, brighter accent
- `7d` row second, slightly less prominent accent
- bold percent text
- colored progress bar using TUI-safe block characters
- muted trailing totals text

Example shape:

- `5h 98% 70.7k/...`
- `7d 30% ...`

The progress bar should use the same family of TUI-safe block characters consistently across both rows, with the visual hierarchy matching the request:

- strong color
- compact bar
- immediate readability from the sidebar

## Data Flow

1. Sidebar context plugin reads current session messages.
2. It determines the active provider from the latest assistant message.
3. If the provider is not `openai`, render only current local context and spend.
4. If the provider is `openai`, attempt to read `openai-usage` auth.
5. If absent, render fallback values for `5h` and `7d`.
6. If present, fetch usage buckets from OpenAI through the usage client.
7. Aggregate the buckets into `5h` and `7d` totals and percents.
8. Render the usage rows with Claude-style color emphasis.

## Error Handling

### Missing Usage Key

- no blocking error
- sidebar shows `--` for remote usage values
- local context and spend still render normally

### Invalid Key / Unauthorized / Forbidden

- no disruptive session UI error
- fallback to `--`
- background debug log entry is acceptable

### Transient Network Failure / Rate Limit

- keep last successful cached usage values when available
- otherwise render `--`

### Non-OpenAI Sessions

- do not render `5h` or `7d` rows

## Testing Strategy

Follow TDD for implementation.

### Aggregation Tests

Add failing tests for pure usage aggregation helpers that verify:

- `5h` totals are computed correctly from bucketed usage
- `7d` totals are computed correctly from bucketed usage
- percentages are computed correctly when denominator data is available
- missing or empty data returns fallback-safe values

### Sidebar Rendering Tests

Add focused tests for the sidebar/context rendering path that verify:

- OpenAI sessions render the extra usage rows
- non-OpenAI sessions do not render the extra usage rows
- missing usage key yields fallback values
- cached or fetched usage values appear in the expected visual order

### Failure Handling Tests

Add tests for usage fetch failure behavior so the sidebar:

- does not crash on fetch errors
- preserves last successful values when cache is populated
- falls back cleanly when no cached data exists

## File Impact

Expected touched areas:

- `packages/opencode/src/auth/index.ts`
  - reuse existing auth model with a new storage key only
- `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`
  - extend the current sidebar context plugin
- a new OpenAI usage fetch/aggregation module in the TUI or shared UI-support area
  - fetch remote usage
  - cache it briefly
  - compute `5h` and `7d`
- tests covering aggregation and sidebar rendering

The implementation should prefer the smallest focused additions rather than creating a new general-purpose provider-usage framework unless later requirements justify it.

## Open Questions Resolved

- Separate usage key or replace current OpenAI auth: separate usage key
- Which windows matter: `5h` and `7d`
- Priority: `5h` is more important
- Display format: totals plus percent
- Styling: Claude Code-inspired colored bar treatment

## Success Criteria

The feature is successful when:

- users can add a dedicated OpenAI API key for usage fetching without affecting current OpenAI OAuth model auth
- OpenAI/Codex sessions show `5h` and `7d` usage in the right sidebar
- `5h` is visually emphasized over `7d`
- the rendering feels consistent with Claude Code’s colored usage bars while matching opencode’s existing TUI conventions
- the sidebar degrades safely when no usage key is configured or remote usage is unavailable
