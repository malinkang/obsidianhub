import { safeExternalUrl } from "./network-policy"
import { renderView } from "./view-renderer"
import type { CatalogEntry, ServiceAnalytics, ServiceCatalog, ViewSpecV1 } from "./types"

export type WereadViewActions = {
  openEntry(path: string, entry?: CatalogEntry): void
  openBookshelf?(): void
  openStats?(): void
  sync?(): void
}

type ShelfGroup = "none" | "category" | "status" | "year"
type ShelfSort = "recent" | "title" | "progress"

export function renderWereadBookshelf(
  container: HTMLElement,
  catalog: ServiceCatalog | null,
  actions: WereadViewActions,
): void {
  container.replaceChildren()
  container.classList.add("notionhub-weread-page")
  const document = container.ownerDocument
  renderHero(container, "我的微信读书", "书架、进度与本地笔记，都在一个安静的阅读空间里。", [
    actionButton(document, "阅读统计", "bar-chart-3", actions.openStats),
    actionButton(document, "同步", "refresh-cw", actions.sync),
  ])

  const entries = [...new Map(
    (catalog?.entries || [])
      .filter((entry) => ["bookshelf", "book"].includes(entry.entityType))
      .map((entry) => [entry.entityId, entry]),
  ).values()]
  if (!entries.length) {
    renderEmpty(container, "还没有书架数据。连接 NotionHub 并完成一次微信读书同步后，这里会出现你的书籍。")
    return
  }

  const controls = document.createElement("div")
  controls.className = "notionhub-weread-controls"
  const search = document.createElement("input")
  search.type = "search"
  search.placeholder = "搜索书名、作者或分类"
  search.setAttribute("aria-label", "搜索微信读书书架")
  const group = selectControl(document, "分组", [
    ["category", "按分类"], ["status", "按阅读状态"], ["year", "按年份"], ["none", "不分组"],
  ])
  const sort = selectControl(document, "排序", [
    ["recent", "最近更新"], ["title", "书名"], ["progress", "阅读进度"],
  ])
  controls.append(search, group, sort)
  container.append(controls)

  const summary = document.createElement("p")
  summary.className = "notionhub-weread-summary"
  const shelves = document.createElement("div")
  shelves.className = "notionhub-weread-shelves"
  container.append(summary, shelves)

  const draw = () => {
    const query = search.value.trim().toLocaleLowerCase()
    const visible = entries.filter((entry) => searchableText(entry).includes(query))
    visible.sort(sortEntries(sort.value as ShelfSort))
    summary.textContent = `${visible.length} / ${entries.length} 本 · 数据更新于 ${formatDate(catalog?.generatedAt)}`
    shelves.replaceChildren()
    const grouped = groupEntries(visible, group.value as ShelfGroup)
    for (const [label, values] of grouped) {
      const section = document.createElement("section")
      section.className = "notionhub-weread-shelf"
      if (group.value !== "none") {
        const heading = document.createElement("h2")
        heading.textContent = `${label} · ${values.length}`
        section.append(heading)
      }
      const grid = document.createElement("div")
      grid.className = "notionhub-weread-grid"
      for (const entry of values) grid.append(bookCard(document, entry, actions.openEntry))
      section.append(grid)
      shelves.append(section)
    }
    if (!visible.length) renderEmpty(shelves, "没有找到匹配的书。")
  }
  search.addEventListener("input", draw)
  group.addEventListener("change", draw)
  sort.addEventListener("change", draw)
  draw()
}

export function renderWereadStats(
  container: HTMLElement,
  catalog: ServiceCatalog | null,
  analytics: ServiceAnalytics | null,
  actions: WereadViewActions,
): void {
  container.replaceChildren()
  container.classList.add("notionhub-weread-page", "notionhub-weread-stats")
  const document = container.ownerDocument
  renderHero(container, "阅读轨迹", "时间留下的不只是数字，也是你一页页走过的路。", [
    actionButton(document, "返回书架", "library", actions.openBookshelf),
    actionButton(document, "同步", "refresh-cw", actions.sync),
  ])
  const sections: Array<[string, string, ViewSpecV1]> = [
    ["此刻概览", "累计阅读、书籍和活跃天数", spec("kpi")],
    ["每日足迹", "按年份和指标查看阅读连续性", spec("heatmap", "heatmap:occurredAt")],
    ["时间趋势", "月度阅读时长变化", spec("line", "monthly:durationMinutes")],
    ["阅读偏好", "书架分类分布", spec("donut", "category:category")],
  ]
  for (const [title, description, viewSpec] of sections) {
    const section = document.createElement("section")
    section.className = "notionhub-weread-stat-section"
    const heading = document.createElement("div")
    heading.className = "notionhub-weread-section-heading"
    const h2 = document.createElement("h2")
    h2.textContent = title
    const text = document.createElement("p")
    text.textContent = description
    heading.append(h2, text)
    const view = document.createElement("div")
    renderView(view, viewSpec, catalog, analytics, (path) => actions.openEntry(path))
    section.append(heading, view)
    container.append(section)
  }
}

function renderHero(container: HTMLElement, title: string, subtitle: string, buttons: HTMLButtonElement[]): void {
  const document = container.ownerDocument
  const hero = document.createElement("header")
  hero.className = "notionhub-weread-hero"
  const copy = document.createElement("div")
  const eyebrow = document.createElement("span")
  eyebrow.className = "notionhub-weread-eyebrow"
  eyebrow.textContent = "NOTIONHUB · WEREAD"
  const heading = document.createElement("h1")
  heading.textContent = title
  const description = document.createElement("p")
  description.textContent = subtitle
  copy.append(eyebrow, heading, description)
  const actions = document.createElement("div")
  actions.className = "notionhub-weread-actions"
  for (const button of buttons) if (!button.disabled) actions.append(button)
  hero.append(copy, actions)
  container.append(hero)
}

function actionButton(document: Document, label: string, icon: string, action?: () => void): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "notionhub-weread-action"
  button.dataset.icon = icon
  button.textContent = label
  button.disabled = !action
  if (action) button.addEventListener("click", action)
  return button
}

function selectControl(document: Document, label: string, options: Array<[string, string]>): HTMLSelectElement {
  const select = document.createElement("select")
  select.setAttribute("aria-label", label)
  for (const [value, text] of options) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = text
    select.append(option)
  }
  return select
}

function bookCard(document: Document, entry: CatalogEntry, openEntry: (path: string, entry?: CatalogEntry) => void): HTMLButtonElement {
  const card = document.createElement("button")
  card.type = "button"
  card.className = "notionhub-weread-book"
  card.addEventListener("click", () => openEntry(entry.path, entry))
  const cover = document.createElement("span")
  cover.className = "notionhub-weread-cover"
  const imageUrl = firstMedia(entry)
  if (imageUrl) {
    const image = document.createElement("img")
    image.loading = "lazy"
    image.referrerPolicy = "no-referrer"
    image.alt = ""
    image.src = imageUrl
    image.addEventListener("error", () => image.remove())
    cover.append(image)
  } else {
    const monogram = document.createElement("span")
    monogram.textContent = entry.title.trim().slice(0, 1) || "书"
    cover.append(monogram)
  }
  const body = document.createElement("span")
  body.className = "notionhub-weread-book-body"
  const title = document.createElement("strong")
  title.textContent = entry.title
  const author = document.createElement("span")
  author.className = "notionhub-weread-book-author"
  author.textContent = dimension(entry, "author") || dimension(entry, "category") || "微信读书"
  const badges = document.createElement("span")
  badges.className = "notionhub-weread-badges"
  for (const value of [dimension(entry, "status"), dimension(entry, "category")].filter(Boolean)) {
    const badge = document.createElement("span")
    badge.textContent = value
    badges.append(badge)
  }
  body.append(title, author, badges)
  const progress = clamp(measure(entry, "progress"), 0, 100)
  if (progress > 0) {
    const track = document.createElement("span")
    track.className = "notionhub-weread-progress"
    track.setAttribute("role", "progressbar")
    track.setAttribute("aria-valuemin", "0")
    track.setAttribute("aria-valuemax", "100")
    track.setAttribute("aria-valuenow", String(progress))
    const fill = document.createElement("span")
    fill.style.setProperty("--notionhub-progress", `${progress}%`)
    track.append(fill)
    body.append(track)
  }
  card.append(cover, body)
  return card
}

function groupEntries(entries: CatalogEntry[], group: ShelfGroup): Array<[string, CatalogEntry[]]> {
  if (group === "none") return [["全部书籍", entries]]
  const values = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const key = group === "year" ? entryDate(entry).slice(0, 4) || "未标日期" : dimension(entry, group) || (group === "status" ? "未标状态" : "未分类")
    values.set(key, [...(values.get(key) || []), entry])
  }
  return [...values].sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
}

function sortEntries(sort: ShelfSort): (left: CatalogEntry, right: CatalogEntry) => number {
  if (sort === "title") return (left, right) => left.title.localeCompare(right.title, "zh-CN")
  if (sort === "progress") return (left, right) => measure(right, "progress") - measure(left, "progress")
  return (left, right) => entryDate(right).localeCompare(entryDate(left))
}

function searchableText(entry: CatalogEntry): string {
  return [entry.title, ...Object.values(entry.view?.dimensions || {}).flat()].join(" ").toLocaleLowerCase()
}

function dimension(entry: CatalogEntry, key: string): string {
  const value = entry.view?.dimensions?.[key]
  return Array.isArray(value) ? value.join("、") : typeof value === "string" ? value : ""
}

function measure(entry: CatalogEntry, key: string): number {
  const value = entry.view?.measures?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function entryDate(entry: CatalogEntry): string {
  const dates = entry.view?.dates || {}
  return dates.occurredAt || dates.updatedAt || dates.finishedAt || dates.createdAt || entry.updatedAt || ""
}

function firstMedia(entry: CatalogEntry): string {
  for (const value of Object.values(entry.view?.media || {}).flat()) {
    const safe = safeExternalUrl(value)
    if (safe) return safe
  }
  return ""
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatDate(value?: string): string {
  if (!value) return "未知时间"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN")
}

function renderEmpty(container: HTMLElement, message: string): void {
  const empty = container.ownerDocument.createElement("p")
  empty.className = "notionhub-empty"
  empty.textContent = message
  container.append(empty)
}

function spec(type: ViewSpecV1["type"], seriesKey?: string): ViewSpecV1 {
  return { schemaVersion: 1, service: "weread", type, range: "all", color: "#2f7d32", seriesKey }
}
