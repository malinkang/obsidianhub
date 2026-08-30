import { TEMPLATE_PACKS } from "./templates"
import type { AnalyticsPoint, AnalyticsSeries, CatalogEntry, ServiceAnalytics, ServiceCatalog, ViewSpecV1, ViewType } from "./types"

const VIEW_TYPES = new Set<ViewType>(["gallery", "heatmap", "kpi", "line", "bar", "stacked-bar", "area", "donut"])
const RANGES = new Set(["30d", "90d", "365d", "all"])
const SORTS = new Set(["newest", "oldest", "title"])
const COLOR = /^#[0-9a-f]{6}$/i

export function parseViewSpec(source: string): ViewSpecV1 {
  const raw = JSON.parse(source) as Partial<ViewSpecV1>
  if (raw.schemaVersion !== 1 || !raw.type || !VIEW_TYPES.has(raw.type) || !raw.service || !TEMPLATE_PACKS[raw.service]) {
    throw new Error("不支持的 NotionHub 视图配置")
  }
  if (raw.range && !RANGES.has(raw.range)) throw new Error("视图时间范围无效")
  if (raw.sort && !SORTS.has(raw.sort)) throw new Error("视图排序无效")
  if (raw.color && !COLOR.test(raw.color)) throw new Error("视图颜色无效")
  if (raw.limit !== undefined && (!Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 200)) throw new Error("Gallery 数量必须为 1–200")
  for (const key of [raw.id, raw.title, raw.entityType, raw.seriesKey, raw.dateField, raw.measure, raw.groupBy]) {
    if (key !== undefined && (typeof key !== "string" || key.length > 120)) throw new Error("视图字段无效")
  }
  if (raw.seriesKeys && (!Array.isArray(raw.seriesKeys) || raw.seriesKeys.length > 12 || raw.seriesKeys.some((key) => typeof key !== "string" || key.length > 120))) {
    throw new Error("视图序列无效")
  }
  return { ...raw, schemaVersion: 1, type: raw.type, service: raw.service } as ViewSpecV1
}

export function resolveSeries(analytics: ServiceAnalytics | null, spec: ViewSpecV1): AnalyticsSeries[] {
  if (!analytics) return []
  const requested = [...(spec.seriesKeys || []), ...(spec.seriesKey ? [spec.seriesKey] : [])]
  if (requested.length) return requested.flatMap((key) => analytics.series.filter((item) => item.key === key))
  const kind = spec.type === "heatmap" ? "heatmap"
    : spec.type === "kpi" ? "kpi"
      : spec.type === "donut" ? "category"
        : spec.type === "line" || spec.type === "area" ? "timeSeries"
          : spec.type === "bar" || spec.type === "stacked-bar" ? "category"
            : null
  return kind ? analytics.series.filter((item) => item.kind === kind).slice(0, spec.type === "kpi" ? 4 : 6) : []
}

export function filterCatalog(catalog: ServiceCatalog | null, spec: ViewSpecV1, now = new Date()): CatalogEntry[] {
  if (!catalog) return []
  const aliases = new Set(spec.entityType ? [spec.entityType] : TEMPLATE_PACKS[spec.service]?.primaryEntities || [])
  const cutoff = rangeCutoff(spec.range || "365d", now)
  const entries = catalog.entries.filter((entry) => {
    if (aliases.size && !aliases.has(entry.entityType)) return false
    if (!cutoff) return true
    const dates = entry.view?.dates || {}
    const value = dates.occurredAt || dates.finishedAt || dates.createdAt || dates.startedAt || entry.updatedAt
    const time = Date.parse(value)
    return Number.isNaN(time) || time >= cutoff
  })
  entries.sort(spec.sort === "title"
    ? (a, b) => a.title.localeCompare(b.title, "zh-CN")
    : spec.sort === "oldest"
      ? (a, b) => a.updatedAt.localeCompare(b.updatedAt)
      : (a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return entries.slice(0, spec.limit || 60)
}

export function renderView(
  container: HTMLElement,
  spec: ViewSpecV1,
  catalog: ServiceCatalog | null,
  analytics: ServiceAnalytics | null,
  openPath: (path: string) => void,
): void {
  container.replaceChildren()
  container.classList.add("notionhub-view", `notionhub-view-${spec.type}`)
  container.style.setProperty("--notionhub-accent", spec.color || TEMPLATE_PACKS[spec.service]?.color || "#3b82f6")
  if (spec.type === "gallery") {
    renderGallery(container, filterCatalog(catalog, spec), openPath)
    return
  }
  const series = resolveSeries(analytics, spec)
  if (!series.length || series.every((item) => !item.points.length)) {
    renderEmpty(container, "暂无可用于此视图的数据")
    return
  }
  if (spec.type === "kpi") renderKpis(container, series)
  else if (spec.type === "heatmap") renderHeatmap(container, series)
  else renderChart(container, spec.type, series)
}

function renderGallery(container: HTMLElement, entries: CatalogEntry[], openPath: (path: string) => void): void {
  if (!entries.length) return renderEmpty(container, "暂无可展示的卡片")
  const document = container.ownerDocument
  const search = document.createElement("input")
  search.type = "search"
  search.placeholder = "筛选当前 Gallery"
  search.className = "notionhub-gallery-search"
  search.setAttribute("aria-label", "筛选 Gallery")
  const grid = document.createElement("div")
  grid.className = "notionhub-gallery-grid"
  container.append(search, grid)
  const draw = () => {
    grid.replaceChildren()
    const query = search.value.trim().toLocaleLowerCase()
    for (const entry of entries.filter((item) => !query || item.title.toLocaleLowerCase().includes(query))) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "notionhub-gallery-card"
      button.addEventListener("click", () => openPath(entry.path))
      const imageUrl = firstMedia(entry)
      if (imageUrl) {
        const image = document.createElement("img")
        image.loading = "lazy"
        image.alt = ""
        image.src = imageUrl
        image.addEventListener("error", () => image.remove())
        button.append(image)
      } else {
        const placeholder = document.createElement("span")
        placeholder.className = "notionhub-gallery-placeholder"
        placeholder.textContent = "NotionHub"
        button.append(placeholder)
      }
      const title = document.createElement("span")
      title.className = "notionhub-gallery-title"
      title.textContent = entry.title
      button.append(title)
      grid.append(button)
    }
  }
  search.addEventListener("input", draw)
  draw()
}

function renderKpis(container: HTMLElement, series: AnalyticsSeries[]): void {
  const document = container.ownerDocument
  const grid = document.createElement("div")
  grid.className = "notionhub-kpi-grid"
  for (const item of series.slice(0, 8)) {
    const card = document.createElement("div")
    card.className = "notionhub-kpi-card"
    const value = document.createElement("strong")
    value.textContent = formatNumber(item.points.reduce((sum, point) => sum + safeNumber(point.value), 0))
    const label = document.createElement("span")
    label.textContent = `${item.label}${item.unit ? ` · ${item.unit}` : ""}`
    card.append(value, label)
    grid.append(card)
  }
  container.append(grid)
}

function renderHeatmap(container: HTMLElement, seriesValues: AnalyticsSeries[]): void {
  const document = container.ownerDocument
  const years = [...new Set(seriesValues.flatMap((series) => series.points.map((point) => point.key.slice(0, 4))).filter((value) => /^\d{4}$/.test(value)))].sort().reverse()
  if (!years.length) return renderEmpty(container, "暂无有效日期")
  const controls = document.createElement("div")
  controls.className = "notionhub-heatmap-controls"
  const select = document.createElement("select")
  select.setAttribute("aria-label", "热力图年份")
  for (const year of years) {
    const option = document.createElement("option")
    option.value = year
    option.textContent = year
    select.append(option)
  }
  const metric = document.createElement("select")
  metric.setAttribute("aria-label", "热力图指标")
  for (const series of seriesValues) {
    const option = document.createElement("option")
    option.value = series.key
    option.textContent = series.label
    metric.append(option)
  }
  const summary = document.createElement("span")
  controls.append(select, metric, summary)
  const grid = document.createElement("div")
  grid.className = "notionhub-heatmap-grid"
  container.append(controls, grid)
  const draw = () => {
    grid.replaceChildren()
    const series = seriesValues.find((item) => item.key === metric.value) || seriesValues[0]!
    const points = series.points.filter((point) => point.key.startsWith(`${select.value}-`))
    const values = new Map(points.map((point) => [point.key, safeNumber(point.value)]))
    const max = Math.max(1, ...values.values())
    const start = new Date(`${select.value}-01-01T00:00:00Z`)
    const end = new Date(`${select.value}-12-31T00:00:00Z`)
    for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
      const key = new Date(time).toISOString().slice(0, 10)
      const value = values.get(key) || 0
      const cell = document.createElement("span")
      cell.className = "notionhub-heatmap-cell"
      cell.style.setProperty("--notionhub-level", String(value / max))
      cell.title = `${key} · ${formatNumber(value)}${series.unit}`
      cell.setAttribute("aria-label", cell.title)
      if (value > 0) cell.tabIndex = 0
      grid.append(cell)
    }
    const total = points.reduce((sum, point) => sum + safeNumber(point.value), 0)
    const streak = heatmapStreak(points)
    summary.textContent = `${formatNumber(total)} ${series.unit} · 连续 ${streak.current} 天 · 最长 ${streak.longest} 天`.trim()
  }
  select.addEventListener("change", draw)
  metric.addEventListener("change", draw)
  draw()
}

export function heatmapStreak(points: AnalyticsPoint[], today = new Date()): { current: number; longest: number } {
  const active = [...new Set(points.filter((point) => safeNumber(point.value) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(point.key)).map((point) => point.key))].sort()
  let longest = 0
  let run = 0
  let previous = Number.NaN
  for (const key of active) {
    const time = Date.parse(`${key}T00:00:00Z`)
    run = time - previous === 86_400_000 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = time
  }
  const dates = new Set(active)
  let cursor = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (!dates.has(new Date(cursor).toISOString().slice(0, 10))) cursor -= 86_400_000
  let current = 0
  while (dates.has(new Date(cursor).toISOString().slice(0, 10))) { current += 1; cursor -= 86_400_000 }
  return { current, longest }
}

function renderChart(container: HTMLElement, type: Exclude<ViewType, "gallery" | "heatmap" | "kpi">, series: AnalyticsSeries[]): void {
  const document = container.ownerDocument
  const width = 720
  const height = 280
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`)
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", series.map((item) => item.label).join("、"))
  svg.classList.add("notionhub-chart")
  if (type === "donut") drawDonut(document, svg, series[0]!, width, height)
  else if (type === "line" || type === "area") drawLine(document, svg, series, width, height, type === "area")
  else drawBars(document, svg, series, width, height, type === "stacked-bar")
  container.append(svg)
  renderLegend(container, series)
}

function drawLine(document: Document, svg: SVGSVGElement, series: AnalyticsSeries[], width: number, height: number, area: boolean): void {
  const all = series.flatMap((item) => item.points.map((point) => safeNumber(point.value)))
  const max = Math.max(1, ...all)
  series.forEach((item, seriesIndex) => {
    const points = item.points.map((point, index) => {
      const x = 28 + index * ((width - 56) / Math.max(1, item.points.length - 1))
      const y = height - 28 - (safeNumber(point.value) / max) * (height - 56)
      return `${x},${y}`
    }).join(" ")
    if (!points) return
    if (area && seriesIndex === 0) {
      const path = document.createElementNS(svg.namespaceURI, "polygon")
      path.setAttribute("points", `28,${height - 28} ${points} ${width - 28},${height - 28}`)
      path.setAttribute("class", "notionhub-chart-area")
      svg.append(path)
    }
    const line = document.createElementNS(svg.namespaceURI, "polyline")
    line.setAttribute("points", points)
    line.setAttribute("class", `notionhub-chart-line notionhub-series-${seriesIndex % 6}`)
    line.setAttribute("fill", "none")
    svg.append(line)
  })
}

function drawBars(document: Document, svg: SVGSVGElement, series: AnalyticsSeries[], width: number, height: number, stacked: boolean): void {
  const keys = [...new Set(series.flatMap((item) => item.points.map((point) => point.key)))]
  const values = series.map((item) => new Map(item.points.map((point) => [point.key, safeNumber(point.value)])))
  const max = Math.max(1, ...keys.map((key) => stacked
    ? values.reduce((sum, item) => sum + (item.get(key) || 0), 0)
    : Math.max(...values.map((item) => item.get(key) || 0))))
  const slot = (width - 56) / Math.max(1, keys.length)
  keys.forEach((key, keyIndex) => {
    let stackHeight = 0
    values.forEach((item, seriesIndex) => {
      const value = item.get(key) || 0
      const barHeight = (value / max) * (height - 70)
      const barWidth = stacked ? slot * 0.72 : slot * 0.72 / Math.max(1, values.length)
      const x = 28 + keyIndex * slot + slot * 0.14 + (stacked ? 0 : seriesIndex * barWidth)
      const y = height - 36 - barHeight - (stacked ? stackHeight : 0)
      const rect = document.createElementNS(svg.namespaceURI, "rect")
      rect.setAttribute("x", String(x))
      rect.setAttribute("y", String(y))
      rect.setAttribute("width", String(Math.max(1, barWidth - 2)))
      rect.setAttribute("height", String(Math.max(0, barHeight)))
      rect.setAttribute("rx", "3")
      rect.setAttribute("class", `notionhub-chart-bar notionhub-series-${seriesIndex % 6}`)
      const title = document.createElementNS(svg.namespaceURI, "title")
      title.textContent = `${key} · ${series[seriesIndex]!.label}: ${formatNumber(value)}${series[seriesIndex]!.unit}`
      rect.append(title)
      svg.append(rect)
      if (stacked) stackHeight += barHeight
    })
  })
}

function drawDonut(document: Document, svg: SVGSVGElement, series: AnalyticsSeries, width: number, height: number): void {
  const total = Math.max(1, series.points.reduce((sum, point) => sum + safeNumber(point.value), 0))
  const radius = 82
  const circumference = 2 * Math.PI * radius
  let offset = 0
  series.points.slice(0, 12).forEach((point, index) => {
    const length = safeNumber(point.value) / total * circumference
    const circle = document.createElementNS(svg.namespaceURI, "circle")
    circle.setAttribute("cx", String(width / 2))
    circle.setAttribute("cy", String(height / 2))
    circle.setAttribute("r", String(radius))
    circle.setAttribute("fill", "none")
    circle.setAttribute("stroke-width", "34")
    circle.setAttribute("stroke-dasharray", `${length} ${circumference - length}`)
    circle.setAttribute("stroke-dashoffset", String(-offset))
    circle.setAttribute("transform", `rotate(-90 ${width / 2} ${height / 2})`)
    circle.setAttribute("class", `notionhub-chart-donut notionhub-series-${index % 6}`)
    const title = document.createElementNS(svg.namespaceURI, "title")
    title.textContent = `${point.key} · ${formatNumber(point.value)}${series.unit}`
    circle.append(title)
    svg.append(circle)
    offset += length
  })
}

function renderLegend(container: HTMLElement, series: AnalyticsSeries[]): void {
  const document = container.ownerDocument
  const legend = document.createElement("div")
  legend.className = "notionhub-chart-legend"
  series.slice(0, 8).forEach((item, index) => {
    const label = document.createElement("span")
    label.className = `notionhub-series-${index % 6}`
    label.textContent = `${item.label}${item.unit ? ` · ${item.unit}` : ""}`
    legend.append(label)
  })
  container.append(legend)
}

function renderEmpty(container: HTMLElement, text: string): void {
  const element = container.ownerDocument.createElement("p")
  element.className = "notionhub-empty"
  element.textContent = text
  container.append(element)
}

function firstMedia(entry: CatalogEntry): string {
  for (const value of [...(entry.view?.media?.cover || []), ...(entry.view?.media?.gallery || [])]) {
    try {
      const url = new URL(value)
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
    } catch { /* ignore unsafe or malformed media URL */ }
  }
  return ""
}

function rangeCutoff(range: ViewSpecV1["range"], now: Date): number | null {
  if (!range || range === "all") return null
  const days = Number.parseInt(range, 10)
  return now.getTime() - days * 86_400_000
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(safeNumber(value))
}
