export type ManifestEntry = {
  service: string
  entityType: string
  entityId: string
  path: string
  contentHash: string
  updatedAt: string
  tombstone?: boolean
}
export type VaultManifest = {
  schemaVersion: number
  sourceRevision?: string
  generatedAt?: string | null
  entries: Record<string, ManifestEntry>
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

export type PluginSettings = {
  integrationBaseUrl: string
  credentials: DeviceCredentials | null
  syncOnStartup: boolean
  intervalMinutes: number
  vaultRoot: string
  downloadImages: boolean
  serviceFolders: Record<string, string>
  lastCommitSha: string
  lastManifestEtag: string
  lastManifest: VaultManifest | null
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
  lastManifest: null
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
}
