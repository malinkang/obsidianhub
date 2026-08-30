const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export function safeRelativePath(value: string): string {
  if (!value || value.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(value)) throw new Error(`不安全的路径：${value}`)
  if (value.includes("\\") || CONTROL_CHARACTERS.test(value)) throw new Error(`不安全的路径：${value}`)
  const parts = value.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error(`不安全的路径：${value}`)
  return parts.join("/")
}

export function safeConfiguredPath(value: string, fallback: string): string {
  const candidate = value.trim() || fallback
  return safeVaultWritePath(candidate)
}

export function safeVaultWritePath(value: string): string {
  const safe = safeRelativePath(value)
  if (safe.split("/", 1)[0]?.toLowerCase() === ".obsidian") throw new Error(`禁止访问 Obsidian 配置目录：${value}`)
  return safe
}

export function joinVaultPath(...parts: string[]): string {
  return safeVaultWritePath(parts.filter(Boolean).join("/"))
}

export function serviceEntryVaultPath(
  vaultRoot: string,
  serviceFolders: Record<string, string>,
  service: string,
  remotePath: string,
): string {
  const prefix = `services/${safeRelativePath(service)}/`
  if (!remotePath.startsWith(prefix)) throw new Error(`条目路径与服务不匹配：${remotePath}`)
  const relative = safeRelativePath(remotePath.slice(prefix.length))
  const root = safeConfiguredPath(vaultRoot, "NotionHub")
  const serviceRoot = safeConfiguredPath(String(serviceFolders[service] || ""), `services/${service}`)
  return joinVaultPath(root, serviceRoot, relative)
}
