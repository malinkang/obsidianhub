export type ManifestEntry = {
  service: string
  entityType: string
  entityId: string
  path: string
  contentHash: string
  updatedAt: string
  title?: string
  view?: VisualMetadata
  tombstone?: boolean
}
export type VaultManifest = {
  schemaVersion: number
  sourceRevision?: string
  generatedAt?: string | null
  entries: Record<string, ManifestEntry>
  entryShards?: Record<string, ManifestShardDescriptor[]>
  catalogs?: Record<string, ManifestArtifact>
  analytics?: Record<string, ManifestArtifact>
}

export type ManifestShardDescriptor = ManifestArtifact & {
  size: number
  entryCount: number
}

export type VaultManifestShard = {
  schemaVersion: 1
  service: string
  entries: Record<string, ManifestEntry>
}

export type ManifestArtifact = {
  path: string
  contentHash: string
  schemaVersion: number
}

export type VisualMetadata = {
  schemaVersion: number
  dates: Record<string, string>
  dimensions: Record<string, string | string[] | boolean>
  measures: Record<string, number>
  media: Record<string, string[]>
}

export type CatalogEntry = {
  key: string
  entityType: string
  entityId: string
  title: string
  path: string
  updatedAt: string
  view: VisualMetadata
}

export type ServiceCatalog = {
  schemaVersion: number
  service: string
  label: string
  icon: string
  color: string
  primaryEntities: string[]
  generatedAt?: string
  entries: CatalogEntry[]
}

export type AnalyticsPoint = { key: string; value: number; series?: string }
export type AnalyticsSeries = {
  key: string
  kind: "kpi" | "heatmap" | "category" | "timeSeries"
  label: string
  unit: string
  points: AnalyticsPoint[]
}
export type ServiceAnalytics = {
  schemaVersion: number
  service: string
  generatedAt?: string
  series: AnalyticsSeries[]
  reported?: Record<string, unknown>
}

export type ViewType = "gallery" | "heatmap" | "kpi" | "line" | "bar" | "stacked-bar" | "area" | "donut"
export type ViewSpecV1 = {
  schemaVersion: 1
  id?: string
  title?: string
  type: ViewType
  service: string
  entityType?: string
  seriesKey?: string
  seriesKeys?: string[]
  dateField?: string
  measure?: string
  groupBy?: string
  range?: "30d" | "90d" | "365d" | "all"
  sort?: "newest" | "oldest" | "title"
  limit?: number
  color?: string
}

export type ServiceViewSettings = {
  range: "30d" | "90d" | "365d" | "all"
  sort: "newest" | "oldest" | "title"
  color: string
  groupBy: string
  hiddenViews: string[]
}

export type DeviceCredentials = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
  refreshExpiresAt: string
}

export type StoredDeviceConnection = {
  refreshExpiresAt: string
}

export type PluginSettings = {
  credentials: StoredDeviceConnection | null
  syncOnStartup: boolean
  intervalMinutes: number
  vaultRoot: string
  downloadImages: boolean
  serviceFolders: Record<string, string>
  lastCommitSha: string
  lastManifestEtag: string
  lastManifest: VaultManifest | null
  serviceViews: Record<string, Partial<ServiceViewSettings>>
}

export const DEFAULT_SETTINGS: PluginSettings = {
  credentials: null,
  syncOnStartup: true,
  intervalMinutes: 30,
  vaultRoot: "NotionHub",
  downloadImages: false,
  serviceFolders: {},
  lastCommitSha: "",
  lastManifestEtag: "",
  lastManifest: null,
  serviceViews: {}
}

export function normalizePluginSettings(value: unknown, credentials: StoredDeviceConnection | null): PluginSettings {
  const source = isRecord(value) ? value : {}
  return {
    credentials,
    syncOnStartup: typeof source.syncOnStartup === "boolean" ? source.syncOnStartup : DEFAULT_SETTINGS.syncOnStartup,
    intervalMinutes: finiteNumber(source.intervalMinutes, DEFAULT_SETTINGS.intervalMinutes),
    vaultRoot: nonEmptyString(source.vaultRoot, DEFAULT_SETTINGS.vaultRoot),
    downloadImages: typeof source.downloadImages === "boolean" ? source.downloadImages : DEFAULT_SETTINGS.downloadImages,
    serviceFolders: stringMap(source.serviceFolders),
    lastCommitSha: typeof source.lastCommitSha === "string" ? source.lastCommitSha : "",
    lastManifestEtag: typeof source.lastManifestEtag === "string" ? source.lastManifestEtag : "",
    lastManifest: normalizeVaultManifest(source.lastManifest),
    serviceViews: normalizeServiceViews(source.serviceViews),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
}

function normalizeServiceViews(value: unknown): Record<string, Partial<ServiceViewSettings>> {
  if (!isRecord(value)) return {}
  const result: Record<string, Partial<ServiceViewSettings>> = {}
  for (const [service, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue
    const settings: Partial<ServiceViewSettings> = {}
    if (["30d", "90d", "365d", "all"].includes(String(candidate.range))) settings.range = candidate.range as ServiceViewSettings["range"]
    if (["newest", "oldest", "title"].includes(String(candidate.sort))) settings.sort = candidate.sort as ServiceViewSettings["sort"]
    if (typeof candidate.color === "string") settings.color = candidate.color
    if (typeof candidate.groupBy === "string") settings.groupBy = candidate.groupBy
    if (Array.isArray(candidate.hiddenViews)) settings.hiddenViews = candidate.hiddenViews.filter((item): item is string => typeof item === "string")
    result[service] = settings
  }
  return result
}

export function normalizeVaultManifest(value: unknown): VaultManifest | null {
  if (!isRecord(value) || ![1, 2, 3].includes(value.schemaVersion as number) || !isRecord(value.entries)) return null
  const entries = normalizeManifestEntries(value.entries)
  if (!entries) return null
  const entryShards = normalizeManifestShards(value.entryShards)
  if (value.schemaVersion === 3 && !entryShards) return null
  return {
    schemaVersion: value.schemaVersion as number,
    entries,
    ...(typeof value.sourceRevision === "string" ? { sourceRevision: value.sourceRevision } : {}),
    ...(typeof value.generatedAt === "string" || value.generatedAt === null ? { generatedAt: value.generatedAt as string | null } : {}),
    ...(entryShards ? { entryShards } : {}),
    ...(normalizeArtifacts(value.catalogs) ? { catalogs: normalizeArtifacts(value.catalogs)! } : {}),
    ...(normalizeArtifacts(value.analytics) ? { analytics: normalizeArtifacts(value.analytics)! } : {}),
  }
}

export function normalizeVaultManifestShard(value: unknown, expectedService: string): VaultManifestShard | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.service !== expectedService || !isRecord(value.entries)) return null
  const entries = normalizeManifestEntries(value.entries)
  return entries ? { schemaVersion: 1, service: expectedService, entries } : null
}

function normalizeManifestEntries(value: Record<string, unknown>): Record<string, ManifestEntry> | null {
  const entries: Record<string, ManifestEntry> = {}
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) return null
    const required = ["service", "entityType", "entityId", "path", "contentHash", "updatedAt"] as const
    if (required.some((field) => typeof candidate[field] !== "string")) return null
    entries[key] = {
      service: candidate.service as string,
      entityType: candidate.entityType as string,
      entityId: candidate.entityId as string,
      path: candidate.path as string,
      contentHash: candidate.contentHash as string,
      updatedAt: candidate.updatedAt as string,
      ...(typeof candidate.title === "string" ? { title: candidate.title } : {}),
      ...(typeof candidate.tombstone === "boolean" ? { tombstone: candidate.tombstone } : {}),
      ...(normalizeVisualMetadata(candidate.view) ? { view: normalizeVisualMetadata(candidate.view)! } : {}),
    }
  }
  return entries
}

function normalizeManifestShards(value: unknown): Record<string, ManifestShardDescriptor[]> | null {
  if (value === undefined) return null
  if (!isRecord(value)) return null
  const result: Record<string, ManifestShardDescriptor[]> = {}
  for (const [service, descriptors] of Object.entries(value)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(service)
      || !Array.isArray(descriptors)
      || !descriptors.length
      || descriptors.length > 16) return null
    const buckets = new Set<string>()
    const normalized: ManifestShardDescriptor[] = []
    for (const candidate of descriptors) {
      if (!isRecord(candidate)
        || typeof candidate.path !== "string"
        || typeof candidate.contentHash !== "string"
        || candidate.schemaVersion !== 1
        || typeof candidate.size !== "number"
        || !Number.isSafeInteger(candidate.size)
        || candidate.size <= 0
        || candidate.size > 8 * 1024 * 1024
        || typeof candidate.entryCount !== "number"
        || !Number.isSafeInteger(candidate.entryCount)
        || candidate.entryCount <= 0
        || candidate.entryCount > 20_000) return null
      const match = candidate.path.match(new RegExp(`^\\.notionhub/manifests/${escapeRegExp(service)}/([0-9a-f])\\.json$`))
      if (!match || buckets.has(match[1]!) || !/^[0-9a-f]{64}$/.test(candidate.contentHash)) return null
      buckets.add(match[1]!)
      normalized.push({
        path: candidate.path,
        contentHash: candidate.contentHash,
        schemaVersion: 1,
        size: candidate.size,
        entryCount: candidate.entryCount,
      })
    }
    result[service] = normalized
  }
  return result
}

function normalizeArtifacts(value: unknown): Record<string, ManifestArtifact> | null {
  if (value === undefined) return null
  if (!isRecord(value)) return null
  const result: Record<string, ManifestArtifact> = {}
  for (const [service, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate.path !== "string" || typeof candidate.contentHash !== "string" || typeof candidate.schemaVersion !== "number") return null
    result[service] = { path: candidate.path, contentHash: candidate.contentHash, schemaVersion: candidate.schemaVersion }
  }
  return result
}

function normalizeVisualMetadata(value: unknown): VisualMetadata | null {
  if (!isRecord(value) || typeof value.schemaVersion !== "number") return null
  if (!isRecord(value.dates) || !isRecord(value.dimensions) || !isRecord(value.measures) || !isRecord(value.media)) return null
  const dates = Object.fromEntries(Object.entries(value.dates).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  const dimensions = Object.fromEntries(Object.entries(value.dimensions).filter((entry): entry is [string, string | string[] | boolean] => {
    const item = entry[1]
    return typeof item === "string" || typeof item === "boolean" || (Array.isArray(item) && item.every((part) => typeof part === "string"))
  }))
  const measures = Object.fromEntries(Object.entries(value.measures).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
  const media = Object.fromEntries(Object.entries(value.media).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((part) => typeof part === "string")))
  return { schemaVersion: value.schemaVersion, dates, dimensions, measures, media }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export type SyncProgress = {
  phase: "idle" | "authorizing" | "fetching" | "applying" | "complete" | "cancelled" | "error"
  completed: number
  total: number
  message: string
}

export type SyncSummary = {
  commitSha: string
  created: number
  updated: number
  deleted: number
  skipped: number
  templatesCreated?: number
  templatesUpdated?: number
  templateConflicts?: number
}
