# Skill Slash Aliases Design

## Summary

Installed skills should automatically appear as slash commands in the TUI. Typing a skill alias like `/dummy-test now whatever I type here` should invoke the `dummy-test` skill and forward `now whatever I type here` as the prompt passed to that skill.

## Goals

- Make installed skills discoverable through the existing slash command UI.
- Let users invoke a skill directly with `/skill-name <prompt>`.
- Reuse the existing skill registry and invocation flow.
- Avoid install-time generated command wrappers or persisted alias state.

## Non-Goals

- Adding new top-level CLI subcommands such as `opencode <skill-name>`.
- Changing plugin installation behavior.
- Introducing a separate skill command namespace beyond the existing slash command system.
- Adding custom prompt templating or a preflight picker before invocation.

## Current State

- Skills are available through the skill system and plugin-provided registries.
- The TUI command dialog already supports slash metadata on commands via `slash: { name, aliases? }`.
- Plugin install and skill install do not currently create slash aliases automatically.
- Slash commands and the slash picker rely on registered command sources.

## Proposed Design

### Command Source Integration

Extend the slash command source so it merges two categories of entries:

- existing built-in slash commands
- synthetic slash commands derived from installed skills

Each synthetic skill entry should include:

- `name`: the skill name as exposed by the installed skill registry
- `description`: the skill description when available
- `execute`: a handler that invokes the existing skill execution path with the skill name and trailing prompt text

This keeps the skill registry as the single source of truth and avoids generated command files or install-time bookkeeping.

### Parsing and Dispatch

Slash command parsing should continue to split the first token from the rest of the input.

Examples:

- `/dummy-test hello world` -> command name `dummy-test`, prompt `hello world`
- `/dummy-test` -> command name `dummy-test`, prompt `""`

Dispatch order:

1. Check built-in slash commands first.
2. If no built-in slash command matches, check installed skills.
3. If a skill matches, invoke that skill with the trailing prompt text.

This preserves existing host behavior and gives built-in slash commands priority during name collisions.

### Picker and Autocomplete

Because skill aliases are part of the same slash command source, they should appear in the existing slash picker and autocomplete results.

Expected behavior:

- installed skills are listed alongside normal slash commands
- skill descriptions are shown when available
- selecting a skill alias from the picker inserts or triggers the same slash flow as any other slash command

### Naming Rules

- Use the skill name exactly as exposed by the registry.
- Do not introduce extra slugification or alias rewriting unless the current registry already does so.
- If multiple plugins expose the same skill name, reuse the registry's existing winner behavior rather than adding a new conflict rule here.

### Empty Prompt Behavior

Submitting `/dummy-test` without trailing text should still invoke the skill, passing an empty string as the prompt.

This keeps the behavior predictable and avoids adding a new validation branch that some skills may not need.

## Error Handling

- If a skill appears in the slash list but is unavailable at execution time, surface the same missing-skill error path used by direct skill invocation.
- If skill metadata lacks a description, the slash entry should still be shown with just the name.
- If slash resolution finds neither a built-in command nor a skill, existing unknown-command behavior should remain unchanged.

## Implementation Notes

- Prefer the minimal change: extend the command/slash aggregation layer rather than adding a second parser path.
- Reuse the current skill invocation API instead of introducing a parallel execution entrypoint.
- Keep built-in precedence local to slash resolution so other skill APIs remain unchanged.

## Testing

Add coverage for:

- installed skills appearing in the slash command list
- `/dummy-test hello` invoking skill `dummy-test` with prompt `hello`
- `/dummy-test` invoking skill `dummy-test` with an empty prompt
- built-in slash commands winning when a built-in command and skill share the same name
- unknown slash commands continuing to fail through the existing path

## Documentation

Update the relevant skills or plugin documentation to explain:

- installed skills automatically become slash commands
- the slash format is `/skill-name <prompt>`
- built-in slash commands win on name collision

## Open Questions Resolved

- Scope: TUI slash commands only, not CLI subcommands.
- Invocation: trailing text after the slash command is forwarded as the skill prompt.
- Discovery: skills should appear in slash autocomplete rather than only resolving as a hidden fallback.

## Rollout Impact

This is a backward-compatible UX enhancement. Existing slash commands and skill installation flows continue to work, while installed skills gain a more direct entrypoint that matches user expectations from Claude Code style slash commands.
