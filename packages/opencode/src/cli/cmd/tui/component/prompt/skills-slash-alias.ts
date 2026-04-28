import { Locale } from "@/util"

export function normalizeSkillsSlashAlias(command: string) {
  return command.startsWith("skills/") ? command.slice("skills/".length) : command
}

export function parseSkillsSlashInput(input: string) {
  if (input.match(/^\/skills\/?\s*$/)) return { kind: "picker" as const }
  const command = input.trim().split(/\s+/)[0]
  if (!command.startsWith("/skills/")) return { kind: "other" as const }
  return {
    kind: "command" as const,
    command: normalizeSkillsSlashAlias(command.slice(1)),
  }
}

export function shouldKeepSkillsSlashAutocomplete(value: string) {
  return value.match(/^\/skills\/?$/) != null
}

export function shouldHideSkillsSlashAutocomplete(value: string) {
  return value.startsWith("/skills/") && !shouldKeepSkillsSlashAutocomplete(value)
}

export function shouldPreserveSkillsSlashInput(value: string) {
  return shouldHideSkillsSlashAutocomplete(value)
}

export function isSkillsSlashAutocompleteQuery(value: string) {
  return value.startsWith("skills/")
}

export function getSkillsSlashAutocompleteQuery(value: string) {
  return isSkillsSlashAutocompleteQuery(value) ? value.slice("skills/".length) : value
}

export function getSkillsAutocompleteWidth(width: number | undefined) {
  return Math.max(0, (width ?? 0) - 4)
}

export function formatSkillsAutocompleteDisplay(display: string, width: number) {
  return Locale.truncateMiddle(display, width).padEnd(display.length + 4)
}
