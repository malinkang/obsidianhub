const START = "<!-- notionhub-managed-start -->"
const END = "<!-- notionhub-managed-end -->"

export type EntityIdentity = { service: string; entityType: string; entityId: string }

export function identityFromFrontmatter(frontmatter: Record<string, unknown> | undefined): EntityIdentity | null {
  const service = text(frontmatter?.notionhub_service)
  const entityType = text(frontmatter?.notionhub_entity_type)
  const entityId = text(frontmatter?.notionhub_entity_id)
  return service && entityType && entityId ? { service, entityType, entityId } : null
}

export function entityKey(identity: EntityIdentity): string {
  return `${identity.service}:${identity.entityType}:${identity.entityId}`
}

export function mergeManagedMarkdown(local: string | null, remote: string): string {
  if (local === null) return ensureTrailingNewline(remote)
  const localDoc = splitDocument(local)
  const remoteDoc = splitDocument(remote)
  const reserved = remoteDoc.frontmatter.filter((line) => frontmatterKey(line)?.startsWith("notionhub_"))
  const user = localDoc.frontmatter.filter((line) => {
    const key = frontmatterKey(line)
    return !key || !key.startsWith("notionhub_")
  })
  const frontmatter = [...user, ...reserved]
  const remoteManaged = managedRegion(remoteDoc.body)
  const localBody = replaceManagedRegion(localDoc.body, remoteManaged)
  return ensureTrailingNewline(renderDocument(frontmatter, localBody))
}

export function archiveManagedMarkdown(local: string): { content: string; pureManaged: boolean } {
  const doc = splitDocument(local)
  const withoutManaged = replaceManagedRegion(doc.body, "")
  const userBody = withoutManaged.replace(START, "").replace(END, "").trim()
  const userFrontmatter = doc.frontmatter.filter((line) => {
    const key = frontmatterKey(line)
    return key && !key.startsWith("notionhub_")
  })
  if (!userBody && userFrontmatter.length === 0) return { content: "", pureManaged: true }
  const reserved = doc.frontmatter.filter((line) => frontmatterKey(line)?.startsWith("notionhub_") && frontmatterKey(line) !== "notionhub_archived")
  return {
    pureManaged: false,
    content: ensureTrailingNewline(renderDocument([...userFrontmatter, ...reserved, "notionhub_archived: true"], withoutManaged.replace(START, "").replace(END, "").trim())),
  }
}

export async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("")
}

function splitDocument(content: string): { frontmatter: string[]; body: string } {
  const normalized = content.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) return { frontmatter: [], body: normalized }
  const end = normalized.indexOf("\n---\n", 4)
  if (end < 0) return { frontmatter: [], body: normalized }
  return { frontmatter: normalized.slice(4, end).split("\n"), body: normalized.slice(end + 5) }
}

function renderDocument(frontmatter: string[], body: string): string {
  const yaml = frontmatter.length ? `---\n${frontmatter.join("\n")}\n---\n` : ""
  return `${yaml}${body.replace(/^\n+/, "")}`
}

function managedRegion(body: string): string {
  const start = body.indexOf(START)
  const end = body.indexOf(END, start + START.length)
  if (start < 0 || end < 0) throw new Error("Remote note is missing the NotionHub managed region")
  return body.slice(start + START.length, end).replace(/^\n|\n$/g, "")
}

function replaceManagedRegion(body: string, managed: string): string {
  const replacement = `${START}\n${managed}${managed ? "\n" : ""}${END}`
  const start = body.indexOf(START)
  const end = body.indexOf(END, start + START.length)
  if (start < 0 || end < 0) return `${body.trimEnd()}${body.trim() ? "\n\n" : ""}${replacement}\n`
  return `${body.slice(0, start)}${replacement}${body.slice(end + END.length)}`
}

function frontmatterKey(line: string): string | null {
  if (/^\s/.test(line)) return null
  return line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1] || null
}

function ensureTrailingNewline(value: string): string {
  return `${value.replace(/\s+$/, "")}\n`
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
