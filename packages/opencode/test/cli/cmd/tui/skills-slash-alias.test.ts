import { describe, expect, test } from "bun:test"
import {
  formatSkillsAutocompleteDisplay,
  getSkillsSlashAutocompleteQuery,
  getSkillsAutocompleteWidth,
  isSkillsSlashAutocompleteQuery,
  normalizeSkillsSlashAlias,
  parseSkillsSlashInput,
  shouldHideSkillsSlashAutocomplete,
  shouldKeepSkillsSlashAutocomplete,
  shouldPreserveSkillsSlashInput,
} from "../../../../src/cli/cmd/tui/component/prompt/skills-slash-alias"

describe("skills slash alias", () => {
  test("normalizes /skills/<name> to the canonical skill command", () => {
    expect(normalizeSkillsSlashAlias("skills/skill-foo")).toBe("skill-foo")
  })

  test("leaves direct commands unchanged", () => {
    expect(normalizeSkillsSlashAlias("skill-foo")).toBe("skill-foo")
  })

  test("treats /skills and /skills/ as picker triggers", () => {
    expect(parseSkillsSlashInput("/skills")).toEqual({ kind: "picker" })
    expect(parseSkillsSlashInput("/skills/")).toEqual({ kind: "picker" })
    expect(parseSkillsSlashInput("/skills   ")).toEqual({ kind: "picker" })
  })

  test("normalizes aliased picker paths with a skill name", () => {
    expect(parseSkillsSlashInput("/skills/skill-foo")).toEqual({
      kind: "command",
      command: "skill-foo",
    })
  })

  test("keeps autocomplete open for /skills/", () => {
    expect(shouldKeepSkillsSlashAutocomplete("/skills/")).toBe(true)
  })

  test("does not keep autocomplete open for /skills/<name>", () => {
    expect(shouldKeepSkillsSlashAutocomplete("/skills/skill-foo")).toBe(false)
  })

  test("only hides autocomplete for typed /skills/<name> aliases", () => {
    expect(shouldHideSkillsSlashAutocomplete("/")).toBe(false)
    expect(shouldHideSkillsSlashAutocomplete("/s")).toBe(false)
    expect(shouldHideSkillsSlashAutocomplete("/skills/")).toBe(false)
    expect(shouldHideSkillsSlashAutocomplete("/skills/skill-foo")).toBe(true)
  })

  test("preserves typed /skills/<name> text when closing autocomplete", () => {
    expect(shouldPreserveSkillsSlashInput("/skills/")).toBe(false)
    expect(shouldPreserveSkillsSlashInput("/skills/skill-foo")).toBe(true)
  })

  test("switches slash autocomplete into skills mode for /skills/ queries", () => {
    expect(isSkillsSlashAutocompleteQuery("skills/")).toBe(true)
    expect(isSkillsSlashAutocompleteQuery("skills/skill-foo")).toBe(true)
    expect(isSkillsSlashAutocompleteQuery("skills")).toBe(false)
    expect(isSkillsSlashAutocompleteQuery("init")).toBe(false)
  })

  test("extracts the nested skill search term from /skills/ queries", () => {
    expect(getSkillsSlashAutocompleteQuery("skills/")).toBe("")
    expect(getSkillsSlashAutocompleteQuery("skills/skill-foo")).toBe("skill-foo")
  })

  test("handles missing anchor width for skills autocomplete", () => {
    expect(getSkillsAutocompleteWidth(undefined)).toBe(0)
    expect(getSkillsAutocompleteWidth(12)).toBe(8)
  })

  test("pads skill autocomplete labels before the description", () => {
    expect(formatSkillsAutocompleteDisplay("/brainstorming", 18)).toBe("/brainstorming    ")
  })

  test("does not keep autocomplete open for slash commands with spaces", () => {
    expect(shouldKeepSkillsSlashAutocomplete("/skills/foo bar")).toBe(false)
  })
})
