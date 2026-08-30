import type { TemplatePackV1 } from "./templates"
import type { VisualMetadata } from "./types"

const MANAGED_START = "<!-- notionhub-managed-start -->"
const DETAIL_START = "<!-- notionhub-detail-template-start -->"
const DETAIL_END = "<!-- notionhub-detail-template-end -->"

export function materializeDetailLayout(markdown: string, pack: TemplatePackV1 | undefined, entityType: string): string {
  if (!pack || !pack.detailEntities.includes(entityType)) return markdown
  const managed = markdown.indexOf(MANAGED_START)
  if (managed < 0) return markdown
  const view = readJsonFrontmatter<VisualMetadata>(markdown, "notionhub_view")
  const block = renderDetailSummary(pack, entityType, view)
  const insertion = managed + MANAGED_START.length
  return `${markdown.slice(0, insertion)}\n${block}\n${markdown.slice(insertion).replace(/^\n/, "")}`
}

export function renderDetailSummary(pack: TemplatePackV1, entityType: string, view?: VisualMetadata): string {
  const rows: string[] = []
  for (const [key, value] of Object.entries(view?.dates || {})) rows.push(`- **${label(key)}**：${escapeText(value)}`)
  for (const [key, value] of Object.entries(view?.dimensions || {})) rows.push(`- **${label(key)}**：${escapeText(Array.isArray(value) ? value.join("、") : String(value))}`)
  for (const [key, value] of Object.entries(view?.measures || {})) rows.push(`- **${label(key)}**：${Number(value).toLocaleString("zh-CN")}`)
  const media = Object.values(view?.media || {}).flat().map(safeMediaUrl).filter((value): value is string => Boolean(value)).slice(0, 8)
  return [
    DETAIL_START,
    `> [!summary] ${pack.icon} ${pack.label} · ${entityType}`,
    `> 此摘要由 NotionHub 原生模板生成；正文和用户手写内容会在升级时保留。`,
    ...(rows.length ? ["", ...rows] : []),
    ...(media.length ? ["", "### 媒体", "", ...media.map((url, index) => `![${pack.label} ${index + 1}](${url})`)] : []),
    DETAIL_END,
  ].join("\n")
}

function readJsonFrontmatter<T>(markdown: string, key: string): T | undefined {
  if (!markdown.startsWith("---\n")) return undefined
  const end = markdown.indexOf("\n---\n", 4)
  if (end < 0) return undefined
  for (const line of markdown.slice(4, end).split("\n")) {
    const match = line.match(/^\s*"?([A-Za-z0-9_-]+)"?\s*:\s*(.+)$/)
    if (match?.[1] !== key) continue
    try { return JSON.parse(match[2]!) as T } catch { return undefined }
  }
  return undefined
}

function safeMediaUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString().replace(/\)/g, "%29")
  } catch {
    return null
  }
}

function escapeText(value: string): string {
  return value.replace(/[\\`*_[\]<>|]/g, "\\$&").replace(/\r?\n/g, " ")
}

function label(value: string): string {
  return ({
    occurredAt: "日期", startedAt: "开始", endedAt: "结束", createdAt: "创建", updatedAt: "更新", finishedAt: "完成",
    category: "分类", type: "类型", author: "作者", artist: "艺术家", playlist: "清单", project: "项目", client: "客户", tags: "标签", status: "状态", language: "语言",
    durationMinutes: "时长（分钟）", distanceKm: "距离（公里）", rating: "评分", calories: "热量", xp: "XP", progress: "进度", count: "数量", weight: "体重",
  } as Record<string, string>)[value] || value
}
