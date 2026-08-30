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
  catalogs?: Record<string, ManifestArtifact>
  analytics?: Record<string, ManifestArtifact>
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

export type RepositoryStatus = {
  bound: boolean
  status: string
  owner: string
  name: string
  fullName: string
  defaultBranch: string
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
  integrationBaseUrl: string
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
  integrationBaseUrl: "https://i.notionhub.app/v1",
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
