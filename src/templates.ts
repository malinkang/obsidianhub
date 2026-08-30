import type { ServiceViewSettings, ViewSpecV1, ViewType } from "./types"

export const TEMPLATE_START = "<!-- notionhub-template-managed-start -->"
export const TEMPLATE_END = "<!-- notionhub-template-managed-end -->"
export const TEMPLATE_SCHEMA_VERSION = 1

export type TemplatePackV1 = {
  schemaVersion: 1
  id: string
  version: number
  service: string
  label: string
  icon: string
  color: string
  primaryEntities: string[]
  detailEntities: string[]
  views: ViewSpecV1[]
}

type PackInput = Omit<TemplatePackV1, "schemaVersion" | "id" | "version" | "views"> & {
  views: Array<readonly [ViewType, string, Partial<ViewSpecV1>?]>
}

function pack(input: PackInput): TemplatePackV1 {
  return {
    schemaVersion: 1,
    id: `notionhub.${input.service}.dashboard`,
    version: 1,
    service: input.service,
    label: input.label,
    icon: input.icon,
    color: input.color,
    primaryEntities: input.primaryEntities,
    detailEntities: input.detailEntities,
    views: input.views.map(([type, title, extra], index) => ({
      schemaVersion: 1,
      id: `${input.service}.${type}.${index + 1}`,
      type,
      title,
      service: input.service,
      color: input.color,
      ...extra,
    })),
  }
}

export const TEMPLATE_PACKS: Record<string, TemplatePackV1> = Object.fromEntries([
  pack({ service: "weread", label: "微信读书", icon: "📚", color: "#2f7d32", primaryEntities: ["bookshelf", "book"], detailEntities: ["bookshelf", "book", "chapter", "bookmark", "review", "booklist", "mp_article"], views: [["kpi", "阅读概览"], ["gallery", "我的书架", { entityType: "bookshelf", sort: "newest" }], ["heatmap", "阅读热力图", { seriesKey: "heatmap:occurredAt" }], ["line", "阅读时长趋势", { seriesKey: "monthly:durationMinutes" }], ["donut", "阅读分类", { seriesKey: "category:category" }]] }),
  pack({ service: "podcast", label: "小宇宙", icon: "🎧", color: "#8b5cf6", primaryEntities: ["episode", "podcast"], detailEntities: ["podcast", "episode", "author", "transcript", "mindmap"], views: [["kpi", "收听概览"], ["gallery", "播客订阅", { entityType: "podcast" }], ["heatmap", "收听热力图"], ["area", "收听时长趋势", { seriesKey: "monthly:durationMinutes" }], ["donut", "主播分布", { seriesKey: "category:author" }]] }),
  pack({ service: "douban", label: "豆瓣", icon: "🎬", color: "#16a34a", primaryEntities: ["movie", "reading_bookshelf", "music", "game", "podcast", "stage"], detailEntities: ["movie", "reading_bookshelf", "music", "game", "podcast", "stage", "movie_actor", "reading_author"], views: [["kpi", "收藏概览"], ["gallery", "影音书游", { entityType: "movie" }], ["heatmap", "收藏热力图"], ["bar", "年度趋势"], ["donut", "分类分布", { seriesKey: "category:category" }], ["line", "评分趋势", { seriesKey: "monthly:rating" }]] }),
  pack({ service: "keep", label: "Keep", icon: "🏃", color: "#22c55e", primaryEntities: ["workout", "sleep"], detailEntities: ["workout", "type", "split", "equipment", "sleep", "sleep_segment", "sleep_stage", "heart_rate", "blood_oxygen", "vo2max", "weight"], views: [["kpi", "健康概览"], ["heatmap", "运动热力图"], ["stacked-bar", "运动类型与时长", { seriesKey: "category:type" }], ["line", "运动时长趋势", { seriesKey: "monthly:durationMinutes" }], ["area", "体重与健康趋势", { seriesKeys: ["monthly:weight", "monthly:heartRate", "monthly:bloodOxygen", "monthly:vo2max"] }]] }),
  pack({ service: "dida", label: "滴答清单", icon: "✅", color: "#3b82f6", primaryEntities: ["task", "habit", "pomodoro", "countdown"], detailEntities: ["task", "list", "tag", "habit", "checkin", "pomodoro", "countdown"], views: [["kpi", "效率概览"], ["bar", "任务状态", { seriesKey: "category:status" }], ["heatmap", "任务与番茄热力图"], ["line", "专注趋势", { seriesKey: "monthly:durationMinutes" }], ["donut", "清单分布", { seriesKey: "category:playlist" }]] }),
  pack({ service: "flomo", label: "Flomo", icon: "📝", color: "#f59e0b", primaryEntities: ["notes", "memo"], detailEntities: ["notes", "memo", "tag", "resources"], views: [["kpi", "记录概览"], ["gallery", "Memo 卡片流", { entityType: "notes" }], ["heatmap", "记录热力图"], ["bar", "标签分布", { seriesKey: "category:tags" }]] }),
  pack({ service: "duolingo", label: "多邻国", icon: "🦉", color: "#58cc02", primaryEntities: ["day", "words", "mistakes"], detailEntities: ["day", "words", "mistakes"], views: [["kpi", "学习概览"], ["heatmap", "XP 热力图"], ["line", "XP 趋势", { seriesKey: "monthly:xp" }], ["bar", "课程分布", { seriesKey: "category:category" }]] }),
  pack({ service: "bbdc", label: "不背单词", icon: "🔤", color: "#06b6d4", primaryEntities: ["day"], detailEntities: ["day"], views: [["kpi", "学习概览"], ["heatmap", "学习热力图"], ["line", "学习时长趋势", { seriesKey: "monthly:durationMinutes" }], ["bar", "单词数量趋势", { seriesKey: "monthly:count" }]] }),
  pack({ service: "bilibili", label: "哔哩哔哩", icon: "📺", color: "#fb7299", primaryEntities: ["bilibili", "video", "bangumi"], detailEntities: ["bilibili", "video", "bangumi", "up", "folder"], views: [["kpi", "收藏概览"], ["gallery", "视频收藏", { entityType: "bilibili" }], ["heatmap", "收藏热力图"], ["bar", "UP 主分布", { seriesKey: "category:author" }], ["donut", "收藏夹分布", { seriesKey: "category:playlist" }]] }),
  pack({ service: "neteasemusic", label: "网易云音乐", icon: "🎵", color: "#ef4444", primaryEntities: ["music", "song", "album"], detailEntities: ["music", "song", "artist", "album", "playlist"], views: [["kpi", "音乐概览"], ["gallery", "专辑与歌曲", { entityType: "music" }], ["heatmap", "收藏热力图"], ["line", "收藏趋势"], ["donut", "歌手分布", { seriesKey: "category:artist" }]] }),
  pack({ service: "forest", label: "Forest", icon: "🌳", color: "#16a34a", primaryEntities: ["notes", "plant", "tree"], detailEntities: ["notes", "plant", "tree", "tag"], views: [["kpi", "专注概览"], ["heatmap", "专注热力图"], ["area", "专注时长趋势", { seriesKey: "monthly:durationMinutes" }], ["donut", "专注分类", { seriesKey: "category:category" }], ["gallery", "我的森林", { entityType: "tree" }]] }),
  pack({ service: "toggl", label: "Toggl", icon: "⏱️", color: "#e11d48", primaryEntities: ["time", "time_entry"], detailEntities: ["time", "time_entry", "project", "client", "tag"], views: [["kpi", "时间概览"], ["heatmap", "时间热力图"], ["line", "时间趋势", { seriesKey: "monthly:durationMinutes" }], ["stacked-bar", "项目分布", { seriesKey: "category:project" }], ["donut", "客户分布", { seriesKey: "category:client" }]] }),
  pack({ service: "applemusic", label: "Apple Music", icon: "🎶", color: "#fa2d48", primaryEntities: ["music", "song", "album"], detailEntities: ["music", "song", "artist", "album", "playlist"], views: [["kpi", "音乐概览"], ["gallery", "专辑与歌曲", { entityType: "music" }], ["heatmap", "收藏热力图"], ["line", "收藏趋势"], ["donut", "歌手分布", { seriesKey: "category:artist" }]] }),
  pack({ service: "strava", label: "Strava", icon: "🚴", color: "#fc4c02", primaryEntities: ["workout", "activity"], detailEntities: ["workout", "activity", "type", "split"], views: [["kpi", "运动概览"], ["heatmap", "运动热力图"], ["line", "距离趋势", { seriesKey: "monthly:distanceKm" }], ["area", "运动时长趋势", { seriesKey: "monthly:durationMinutes" }], ["donut", "运动类型", { seriesKey: "category:type" }]] }),
  pack({ service: "trakt", label: "Trakt", icon: "🍿", color: "#ed1c24", primaryEntities: ["movie", "show", "episode"], detailEntities: ["movie", "show", "episode"], views: [["kpi", "观看概览"], ["gallery", "影视收藏", { entityType: "movie" }], ["heatmap", "观看热力图"], ["bar", "影视类型", { seriesKey: "category:category" }], ["donut", "评分分布", { seriesKey: "category:rating" }]] }),
  pack({ service: "youtube", label: "YouTube", icon: "▶️", color: "#ff0000", primaryEntities: ["video", "bilibili"], detailEntities: ["video", "bilibili", "channel", "playlist"], views: [["kpi", "收藏概览"], ["gallery", "视频收藏", { entityType: "video" }], ["heatmap", "收藏热力图"], ["bar", "频道分布", { seriesKey: "category:author" }], ["donut", "播放列表", { seriesKey: "category:playlist" }]] }),
  pack({ service: "spotify", label: "Spotify", icon: "🎼", color: "#1db954", primaryEntities: ["music", "song", "album"], detailEntities: ["music", "song", "artist", "album", "playlist", "files"], views: [["kpi", "音乐概览"], ["gallery", "专辑与歌曲", { entityType: "music" }], ["heatmap", "收藏热力图"], ["line", "收藏趋势"], ["donut", "歌手分布", { seriesKey: "category:artist" }]] }),
  pack({ service: "xiaohongshu", label: "小红书", icon: "📕", color: "#ff2442", primaryEntities: ["notes", "memo"], detailEntities: ["notes", "memo", "tag", "resources", "author"], views: [["kpi", "收藏概览"], ["gallery", "笔记瀑布流", { entityType: "notes", limit: 60 }], ["heatmap", "收藏热力图"], ["bar", "作者分布", { seriesKey: "category:author" }], ["donut", "标签分布", { seriesKey: "category:tags" }]] }),
  pack({ service: "douyin", label: "抖音", icon: "🎞️", color: "#111827", primaryEntities: ["douyin", "video"], detailEntities: ["douyin", "video", "douyin_resource", "author", "collection"], views: [["kpi", "收藏概览"], ["gallery", "视频与图集", { entityType: "douyin", limit: 60 }], ["bar", "互动指标", { seriesKeys: ["sum:likeCount", "sum:commentCount", "sum:shareCount"] }], ["donut", "作者分布", { seriesKey: "category:author" }]] }),
  pack({ service: "github", label: "GitHub", icon: "🐙", color: "#6e5494", primaryEntities: ["github_repository", "repository"], detailEntities: ["github_repository", "repository", "list", "author"], views: [["kpi", "仓库概览"], ["gallery", "Starred Repositories", { entityType: "github_repository" }], ["heatmap", "Star 热力图"], ["bar", "Star 与 Fork 排名", { seriesKeys: ["sum:stars", "sum:forks"] }], ["donut", "语言分布", { seriesKey: "category:language" }]] }),
  pack({ service: "guwendao", label: "古文岛", icon: "🏮", color: "#b45309", primaryEntities: ["shiwen", "annotation", "beisong"], detailEntities: ["shiwen", "author", "collection", "shidan", "annotation", "beisong", "tag"], views: [["kpi", "古文学习概览"], ["gallery", "诗文收藏", { entityType: "shiwen" }], ["heatmap", "收藏与背诵热力图"], ["bar", "作者分布", { seriesKey: "category:author" }], ["donut", "标签分布", { seriesKey: "category:tags" }]] }),
  pack({ service: "daily", label: "Daily", icon: "📅", color: "#0ea5e9", primaryEntities: ["journal"], detailEntities: ["journal", "book", "movie", "keep", "todo", "tomato", "toggl", "weread", "bill"], views: [["kpi", "每日概览"], ["heatmap", "日记热力图"], ["gallery", "照片回顾", { entityType: "journal" }], ["stacked-bar", "每日活动汇总", { seriesKeys: ["monthly:durationMinutes", "monthly:count"] }], ["area", "生活趋势"]] }),
].map((value) => [value.service, value]))

export function renderDashboard(packValue: TemplatePackV1, settings: Partial<ServiceViewSettings> = {}): string {
  const hidden = new Set(settings.hiddenViews || [])
  const views = packValue.views.filter((view) => !hidden.has(view.id || "")).map((view) => ({
    ...view,
    range: settings.range || view.range || "365d",
    sort: settings.sort || view.sort || "newest",
    color: settings.color || view.color || packValue.color,
    groupBy: settings.groupBy || view.groupBy,
  }))
  const managed = [
    `# ${packValue.icon} ${packValue.label}`,
    "",
    `> 由 NotionHub 自动维护 · 最近数据请查看 [[_index]]。`,
    "",
    ...views.flatMap((view) => [
      `## ${view.title || view.type}`,
      "",
      "```notionhub-view",
      JSON.stringify(view, null, 2),
      "```",
      "",
    ]),
    "## 最近条目",
    "",
    "- [[_index|打开完整索引]]",
  ].join("\n")
  return [
    "---",
    `notionhub_template_id: ${JSON.stringify(packValue.id)}`,
    `notionhub_template_version: ${packValue.version}`,
    `notionhub_service: ${JSON.stringify(packValue.service)}`,
    "---",
    "",
    TEMPLATE_START,
    managed,
    TEMPLATE_END,
    "",
  ].join("\n")
}

export function validateTemplateRegistry(): string[] {
  const errors: string[] = []
  for (const [service, value] of Object.entries(TEMPLATE_PACKS)) {
    if (value.service !== service) errors.push(`${service}: service mismatch`)
    if (!value.primaryEntities.length || !value.detailEntities.length) errors.push(`${service}: missing entities`)
    if (!value.views.some((view) => view.type === "kpi")) errors.push(`${service}: missing KPI`)
    for (const view of value.views) {
      if (view.schemaVersion !== 1 || view.service !== service || !view.id) errors.push(`${service}: invalid view`)
    }
  }
  return errors
}
