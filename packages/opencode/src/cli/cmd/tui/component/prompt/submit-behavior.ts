export function promptSubmitBehavior(input: {
  mode: "normal" | "shell"
  vim: boolean
  vim_mode: "normal" | "insert" | "visual" | "visual-line" | "replace" | "copy"
}) {
  return "submit"
}
