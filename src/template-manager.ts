import { TEMPLATE_END, TEMPLATE_PACKS, TEMPLATE_START, renderDashboard, type TemplatePackV1 } from "./templates"
import type { PluginSettings } from "./types"

const MANAGED_FRONTMATTER = /^notionhub_(?:template_id|template_version|service)\s*:/

export type TemplateVault = {
  notes?(): Promise<Array<{ path: string; content: string }>>
  read(path: string): Promise<string | null>
  writeAtomic(path: string, content: string): Promise<void>
}

export type TemplateInstallSummary = {
  created: number
  updated: number
  skipped: number
  conflicts: string[]
}

export class TemplateManager {
  constructor(private readonly vault: TemplateVault, private readonly settings: PluginSettings) {}

  async ensure(services: Iterable<string>, force = false): Promise<TemplateInstallSummary> {
    const summary: TemplateInstallSummary = { created: 0, updated: 0, skipped: 0, conflicts: [] }
    const notes = await this.vault.notes?.() || []
    for (const service of [...new Set(services)].sort()) {
      const pack = TEMPLATE_PACKS[service]
      if (!pack) continue
      const path = notes.find((note) => templateId(note.content) === pack.id)?.path || this.dashboardPath(pack)
      const generated = renderDashboard(pack, this.settings.serviceViews[service] || {})
      const existing = await this.vault.read(path)
      if (existing === null) {
        await this.vault.writeAtomic(path, generated)
        summary.created += 1
        continue
      }
      const merged = mergeTemplate(existing, generated, force)
      if (merged.status === "conflict") {
        const conflictPath = path.replace(/\.md$/, `.notionhub-conflict-v${pack.version}.md`)
        await this.vault.writeAtomic(conflictPath, generated)
        summary.conflicts.push(conflictPath)
      } else if (merged.content === existing) {
        summary.skipped += 1
      } else {
        await this.vault.writeAtomic(path, merged.content)
        summary.updated += 1
      }
    }
    return summary
  }

  dashboardPath(pack: TemplatePackV1): string {
    const configured = String(this.settings.serviceFolders[pack.service] || "").replace(/^\/+|\/+$/g, "")
    const serviceRoot = configured || `services/${pack.service}`
    return [this.settings.vaultRoot, serviceRoot, "首页.md"].filter(Boolean).join("/").replace(/\/+/g, "/")
  }
}

export function mergeTemplate(existing: string, generated: string, force = false): { status: "merged" | "conflict"; content: string } {
  const current = splitDocument(existing)
  const next = splitDocument(generated)
  const currentRegion = managedRegion(current.body)
  const nextRegion = managedRegion(next.body)
  if (!nextRegion) throw new Error("官方模板缺少受管锚点")
  if (!currentRegion) return { status: "conflict", content: existing }
  const before = current.body.slice(0, currentRegion.start)
  const after = current.body.slice(currentRegion.end)
  return {
    status: "merged",
    content: joinDocument(
      mergeFrontmatter(current.frontmatter, next.frontmatter),
      `${before}${nextRegion.content}${after}`.trim(),
    ),
  }
}

function templateId(content: string): string {
  const match = content.match(/^\s*"?notionhub_template_id"?\s*:\s*(.+)$/m)
  if (!match) return ""
  try { return String(JSON.parse(match[1]!)) } catch { return match[1]!.trim() }
}

function mergeFrontmatter(existing: string, generated: string): string {
  const managed = generated.split("\n").filter((line) => MANAGED_FRONTMATTER.test(line.trim()))
  const preserved = existing.split("\n").filter((line) => line.trim() && !MANAGED_FRONTMATTER.test(line.trim()))
  return [...managed, ...preserved].join("\n")
}

function managedRegion(body: string): { start: number; end: number; content: string } | null {
  const starts = indexes(body, TEMPLATE_START)
  const ends = indexes(body, TEMPLATE_END)
  if (starts.length !== 1 || ends.length !== 1 || ends[0]! < starts[0]!) return null
  const start = starts[0]!
  const end = ends[0]! + TEMPLATE_END.length
  return { start, end, content: body.slice(start, end) }
}

function indexes(value: string, needle: string): number[] {
  const result: number[] = []
  let offset = 0
  while (offset < value.length) {
    const found = value.indexOf(needle, offset)
    if (found < 0) break
    result.push(found)
    offset = found + needle.length
  }
  return result
}

function splitDocument(value: string): { frontmatter: string; body: string } {
  if (!value.startsWith("---\n")) return { frontmatter: "", body: value }
  const end = value.indexOf("\n---\n", 4)
  if (end < 0) return { frontmatter: "", body: value }
  return { frontmatter: value.slice(4, end), body: value.slice(end + 5).replace(/^\n+/, "") }
}

function joinDocument(frontmatter: string, body: string): string {
  return `---\n${frontmatter.trim()}\n---\n\n${body.trim()}\n`
}
