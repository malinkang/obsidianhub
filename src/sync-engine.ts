import { archiveManagedMarkdown, entityKey, mergeManagedMarkdown, sha256Hex, type EntityIdentity } from "./markdown"
import { TemplateManager } from "./template-manager"
import { materializeDetailLayout } from "./detail-template"
import { TEMPLATE_PACKS } from "./templates"
import { MAX_CACHED_IMAGE_BYTES, safeExternalUrl } from "./network-policy"
import { joinVaultPath, safeConfiguredPath, safeRelativePath, safeVaultWritePath, serviceEntryVaultPath } from "./path-policy"
import type { ManifestArtifact, ManifestEntry, PluginSettings, SyncProgress, SyncSummary, VaultManifest } from "./types"

export type VaultNote = { path: string; content: string; identity: EntityIdentity | null }

export interface VaultAdapter {
  notes(): Promise<VaultNote[]>
  read(path: string): Promise<string | null>
  writeAtomic(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  writeBinary?(path: string, content: ArrayBuffer): Promise<void>
}

export interface VaultContentReader {
  headCommit(signal?: AbortSignal): Promise<string>
  manifest(commitSha: string, etag: string, signal?: AbortSignal): Promise<{ manifest: VaultManifest | null; etag: string; unchanged: boolean }>
  file(path: string, commitSha: string, signal?: AbortSignal): Promise<string>
  readFiles?(paths: string[], commitSha: string, signal?: AbortSignal): Promise<Map<string, string>>
}

const DEVICE_FILE_BATCH_SIZE = 50

export class SyncEngine {
  constructor(
    private readonly reader: VaultContentReader,
    private readonly vault: VaultAdapter,
    private settings: PluginSettings,
    private readonly saveSettings: (patch: Partial<PluginSettings>) => Promise<void>,
    private readonly progress: (progress: SyncProgress) => void,
    private readonly assetFetcher: typeof fetch = fetch,
  ) {}

  async run(signal?: AbortSignal): Promise<SyncSummary> {
    this.progress({ phase: "fetching", completed: 0, total: 0, message: "正在读取私有仓库" })
    this.assertActive(signal)
    const commitSha = await this.reader.headCommit(signal)
    const remote = await this.reader.manifest(commitSha, this.settings.lastManifestEtag, signal)
    const manifest = remote.manifest || this.settings.lastManifest
    if (!manifest) throw new Error("仓库 manifest 不可用")
    validateManifestPaths(manifest)

    const previous = this.settings.lastManifest || emptyManifest()
    validateManifestPaths(previous)
    const changed = remote.unchanged ? [] : changedEntries(previous, manifest)
    const deleted = remote.unchanged ? [] : deletedEntries(previous, manifest)
    const notes = await this.vault.notes()
    const byEntity = new Map(notes.flatMap((note) => note.identity ? [[entityKey(note.identity), note] as const] : []))
    let created = 0
    let updated = 0
    let removed = 0
    let skipped = Object.keys(manifest.entries).length - changed.length
    const total = changed.length + deleted.length
    let completed = 0

    let remoteBatch = new Map<string, string>()
    for (let entryIndex = 0; entryIndex < changed.length; entryIndex += 1) {
      const entry = changed[entryIndex]!
      this.assertActive(signal)
      this.progress({ phase: "applying", completed, total, message: `${entry.service}: ${entry.entityId}` })
      if (entry.tombstone) {
        removed += await this.archive(byEntity.get(entryKey(entry)))
      } else {
        if (typeof this.reader.readFiles === "function" && !remoteBatch.has(entry.path)) {
          const paths: string[] = []
          for (let candidateIndex = entryIndex; candidateIndex < changed.length && paths.length < DEVICE_FILE_BATCH_SIZE; candidateIndex += 1) {
            const candidate = changed[candidateIndex]!
            if (!candidate.tombstone) paths.push(candidate.path)
          }
          remoteBatch = await this.reader.readFiles(paths, commitSha, signal)
        }
        const remoteContent = remoteBatch.get(entry.path) ?? await this.reader.file(entry.path, commitSha, signal)
        remoteBatch.delete(entry.path)
        const digest = await sha256Hex(remoteContent)
        if (digest !== entry.contentHash) throw new Error(`${entry.path} 内容校验失败`)
        const existing = byEntity.get(entryKey(entry))
        const target = existing?.path || this.targetPath(entry)
        const local = existing?.content ?? await this.vault.read(target)
        const detailed = materializeDetailLayout(remoteContent, TEMPLATE_PACKS[entry.service], entry.entityType)
        const materialized = this.settings.downloadImages
          ? await cacheExternalImages(detailed, entry, this.settings.vaultRoot, this.vault, this.assetFetcher, signal)
          : detailed
        await this.vault.writeAtomic(target, mergeManagedMarkdown(local, materialized))
        if (existing || local !== null) updated += 1
        else created += 1
      }
      completed += 1
    }

    for (const entry of deleted) {
      this.assertActive(signal)
      this.progress({ phase: "applying", completed, total, message: `归档 ${entry.service}: ${entry.entityId}` })
      removed += await this.archive(byEntity.get(entryKey(entry)))
      completed += 1
    }

    await this.syncArtifacts(this.reader, commitSha, manifest, previous, signal)
    const services = new Set([
      ...Object.keys(manifest.catalogs || {}),
      ...Object.values(manifest.entries).map((entry) => entry.service),
    ])
    const templates = await new TemplateManager(this.vault, this.settings).ensure(services)

    const etag = remote.etag || this.settings.lastManifestEtag
    await this.saveSettings({ lastCommitSha: commitSha, lastManifestEtag: etag, lastManifest: manifest })
    this.settings = { ...this.settings, lastCommitSha: commitSha, lastManifestEtag: etag, lastManifest: manifest }
    const summary = {
      commitSha, created, updated, deleted: removed, skipped,
      templatesCreated: templates.created,
      templatesUpdated: templates.updated,
      templateConflicts: templates.conflicts.length,
    }
    this.progress({ phase: "complete", completed: total, total, message: `新增 ${created}，更新 ${updated}，归档 ${removed}，模板 ${templates.created + templates.updated}` })
    return summary
  }

  private async syncArtifacts(
    reader: VaultContentReader,
    commitSha: string,
    manifest: VaultManifest,
    previous: VaultManifest,
    signal?: AbortSignal,
  ): Promise<void> {
    const groups: Array<[Record<string, ManifestArtifact>, Record<string, ManifestArtifact>]> = [
      [manifest.catalogs || {}, previous.catalogs || {}],
      [manifest.analytics || {}, previous.analytics || {}],
    ]
    for (const [current, before] of groups) {
      for (const [service, artifact] of Object.entries(current)) {
        this.assertActive(signal)
        const target = joinVaultPath(safeConfiguredPath(this.settings.vaultRoot, "NotionHub"), artifact.path)
        const local = await this.vault.read(target)
        if (before[service]?.contentHash === artifact.contentHash && local !== null && await sha256Hex(local) === artifact.contentHash) continue
        const content = await reader.file(artifact.path, commitSha, signal)
        if (await sha256Hex(content) !== artifact.contentHash) throw new Error(`${artifact.path} 可视化数据校验失败`)
        JSON.parse(content)
        await this.vault.writeAtomic(target, content)
      }
    }
  }

  private async archive(note: VaultNote | undefined): Promise<number> {
    if (!note) return 0
    const archived = archiveManagedMarkdown(note.content)
    if (archived.pureManaged) await this.vault.remove(note.path)
    else await this.vault.writeAtomic(note.path, archived.content)
    return 1
  }

  private targetPath(entry: ManifestEntry): string {
    return serviceEntryVaultPath(this.settings.vaultRoot, this.settings.serviceFolders, entry.service, entry.path)
  }

  private assertActive(signal?: AbortSignal): void {
    if (signal?.aborted) {
      this.progress({ phase: "cancelled", completed: 0, total: 0, message: "同步已取消" })
      throw new DOMException("Sync cancelled", "AbortError")
    }
  }
}

export async function cacheExternalImages(
  markdown: string,
  entry: ManifestEntry,
  vaultRoot: string,
  vault: VaultAdapter,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  if (!vault.writeBinary) return markdown
  const matches = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)]
  let output = markdown
  for (const match of matches) {
    try {
      const url = safeExternalUrl(match[2]!)
      if (!url) continue
      const response = await fetcher(url, { signal })
      if (!response.ok) continue
      const contentType = response.headers.get("Content-Type") || ""
      const extension = imageExtension(contentType)
      if (!extension || (response.url && !safeExternalUrl(response.url))) continue
      const declaredSize = Number(response.headers.get("Content-Length") || "0")
      if (declaredSize > MAX_CACHED_IMAGE_BYTES) continue
      const content = await response.arrayBuffer()
      if (content.byteLength > MAX_CACHED_IMAGE_BYTES) continue
      const assetId = (await sha256Hex(url)).slice(0, 20)
      const path = joinVaultPath(safeConfiguredPath(vaultRoot, "NotionHub"), "assets", safeRelativePath(entry.service), `${assetId}.${extension}`)
      await vault.writeBinary(path, content)
      output = output.replace(match[0], `![[${path}|${match[1] || "image"}]]`)
    } catch (error) {
      if (signal?.aborted) throw error
      // Images are auxiliary: preserve the original external URL when a download fails.
    }
  }
  return output
}

function changedEntries(previous: VaultManifest, current: VaultManifest): ManifestEntry[] {
  return Object.entries(current.entries)
    .filter(([key, value]) => previous.entries[key]?.contentHash !== value.contentHash || previous.entries[key]?.tombstone !== value.tombstone)
    .map(([, value]) => value)
    .sort((left, right) => entryKey(left).localeCompare(entryKey(right)))
}

function deletedEntries(previous: VaultManifest, current: VaultManifest): ManifestEntry[] {
  return Object.entries(previous.entries)
    .filter(([key]) => !current.entries[key])
    .map(([, value]) => value)
    .sort((left, right) => entryKey(left).localeCompare(entryKey(right)))
}

function entryKey(entry: ManifestEntry): string {
  return `${entry.service}:${entry.entityType}:${entry.entityId}`
}

function emptyManifest(): VaultManifest {
  return { schemaVersion: 1, entries: {} }
}

function validateManifestPaths(manifest: VaultManifest): void {
  for (const entry of Object.values(manifest.entries)) {
    if (!TEMPLATE_PACKS[entry.service]) throw new Error(`manifest 包含未知服务：${entry.service}`)
    const prefix = `services/${entry.service}/`
    if (!entry.path.startsWith(prefix)) throw new Error(`manifest 条目路径与服务不匹配：${entry.path}`)
    safeRelativePath(entry.path.slice(prefix.length))
  }
  validateArtifacts(manifest.catalogs || {}, "catalog")
  validateArtifacts(manifest.analytics || {}, "analytics")
}

function validateArtifacts(artifacts: Record<string, ManifestArtifact>, kind: "catalog" | "analytics"): void {
  for (const [service, artifact] of Object.entries(artifacts)) {
    if (!TEMPLATE_PACKS[service]) throw new Error(`manifest 包含未知服务：${service}`)
    const expected = `.notionhub/${kind}/${service}.json`
    if (artifact.path !== expected) throw new Error(`manifest 可视化路径无效：${artifact.path}`)
    safeVaultWritePath(artifact.path)
  }
}

function imageExtension(contentType: string): string {
  const subtype = contentType.split("/", 2)[1]?.split(";", 1)[0]?.toLowerCase()
  return ({ jpeg: "jpg", png: "png", gif: "gif", webp: "webp", avif: "avif" } as Record<string, string>)[subtype || ""] || ""
}
