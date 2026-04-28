import { Global } from "@/global"

export function getSidebarLocation(input: { directory?: string; branch?: string; home?: string }) {
  const directory = input.directory || process.cwd()
  const home = input.home ?? Global.Path.home
  const path = directory === home ? "~" : directory.startsWith(home + "/") ? directory.replace(home, "~") : directory
  const list = path.split("/")
  return {
    path,
    parent: list.slice(0, -1).join("/"),
    name: list.at(-1) ?? "",
    branch: input.branch,
  }
}
