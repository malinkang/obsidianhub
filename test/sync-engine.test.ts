import assert from "node:assert/strict"
import test from "node:test"

import { cacheExternalImages, SyncEngine, type VaultAdapter, type VaultNote } from "../src/sync-engine"
import { DEFAULT_SETTINGS, type ManifestEntry, type PluginSettings, type VaultManifest } from "../src/types"
import { sha256Hex } from "../src/markdown"

class MemoryVault implements VaultAdapter {
  files = new Map<string, string>()
  binaries = new Map<string, ArrayBuffer>()
  failNextWrite = false

  async notes(): Promise<VaultNote[]> {
    return [...this.files].filter(([path]) => path.endsWith(".md")).map(([path, content]) => ({ path, content, identity: identity(content) }))
  }
  async read(path: string): Promise<string | null> { return this.files.get(path) ?? null }
  async writeAtomic(path: string, content: string): Promise<void> {
    if (this.failNextWrite) { this.failNextWrite = false; throw new Error("interrupted") }
    this.files.set(path, content)
  }
  async remove(path: string): Promise<void> { this.files.delete(path) }
  async writeBinary(path: string, content: ArrayBuffer): Promise<void> { this.binaries.set(path, content) }
}

class Reader {
  commit = "commit-1"
  manifestValue!: VaultManifest
  files = new Map<string, string>()
  async headCommit() { return this.commit }
  async manifest() { return { manifest: this.manifestValue, etag: `"${this.commit}"`, unchanged: false } }
  async file(path: string) { const value = this.files.get(path); if (!value) throw new Error("missing"); return value }
}

const api = { repositoryToken: async () => ({ repository: { bound: true, status: "ready", owner: "u", name: "v", fullName: "u/v", defaultBranch: "main" }, token: "read", expiresAt: "2030", permissions: { contents: "read" as const } }) }

test("first sync, no-change, update after move, and user-preserving tombstone are idempotent", async () => {
  const vault = new MemoryVault()
  const reader = new Reader()
  const remote1 = note("v1")
  reader.files.set("services/weread/book/book-1.md", remote1)
  reader.manifestValue = await manifest(remote1)
  let settings: PluginSettings = { ...DEFAULT_SETTINGS, serviceFolders: {}, lastManifest: null }
  const engine = new SyncEngine(api as any, vault, settings, async (patch) => { settings = { ...settings, ...patch } }, () => {}, () => reader as any)

  const first = await engine.run()
  assert.equal(first.created, 1)
  const generatedPath = "NotionHub/services/weread/book/book-1.md"
  assert.ok(vault.files.has(generatedPath))

  const second = await engine.run()
  assert.equal(second.skipped, 1)
  assert.equal(second.created + second.updated + second.deleted, 0)

  const movedPath = "Hand Sorted/My Book.md"
  vault.files.set(movedPath, `${vault.files.get(generatedPath)}\nhandwritten`)
  vault.files.delete(generatedPath)
  const remote2 = note("v2")
  reader.commit = "commit-2"
  reader.files.set("services/weread/book/book-1.md", remote2)
  reader.manifestValue = await manifest(remote2)
  const updated = await engine.run()
  assert.equal(updated.updated, 1)
  assert.match(vault.files.get(movedPath) || "", /fixture v2[\s\S]*handwritten/)
  assert.equal(vault.files.has(generatedPath), false)

  reader.commit = "commit-3"
  reader.manifestValue = { schemaVersion: 1, entries: {} }
  const archived = await engine.run()
  assert.equal(archived.deleted, 1)
  assert.match(vault.files.get(movedPath) || "", /notionhub_archived: true/)
  assert.match(vault.files.get(movedPath) || "", /handwritten/)
})

test("interruption does not advance checkpoint and retry completes", async () => {
  const vault = new MemoryVault()
  vault.failNextWrite = true
  const reader = new Reader()
  const content = note("v1")
  reader.files.set("services/weread/book/book-1.md", content)
  reader.manifestValue = await manifest(content)
  let saves = 0
  const engine = new SyncEngine(api as any, vault, { ...DEFAULT_SETTINGS }, async () => { saves += 1 }, () => {}, () => reader as any)
  await assert.rejects(engine.run(), /interrupted/)
  assert.equal(saves, 0)
  assert.equal((await engine.run()).created, 1)
  assert.equal(saves, 1)
})

test("cancellation stops before repository access", async () => {
  const controller = new AbortController()
  controller.abort()
  let requested = false
  const cancelledApi = { repositoryToken: async () => { requested = true; return api.repositoryToken() } }
  const engine = new SyncEngine(cancelledApi as any, new MemoryVault(), { ...DEFAULT_SETTINGS }, async () => {}, () => {})
  await assert.rejects(engine.run(controller.signal), (error: unknown) => error instanceof DOMException && error.name === "AbortError")
  assert.equal(requested, false)
})

test("optional image download is deterministic and failures stay non-blocking", async () => {
  const vault = new MemoryVault()
  const entry = (await manifest(note("v1"))).entries["weread:book:book-1"]!
  const markdown = "![cover](https://images.example/cover.jpg)"
  const downloaded = await cacheExternalImages(markdown, entry, "NotionHub", vault, async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }) as any)
  assert.match(downloaded, /^!\[\[NotionHub\/assets\/weread\/[a-f0-9]{20}\.jpg\|cover\]\]$/)
  assert.equal(vault.binaries.size, 1)
  const preserved = await cacheExternalImages(markdown, entry, "NotionHub", vault, async () => { throw new Error("offline") })
  assert.equal(preserved, markdown)
})

test("all 22 service namespaces are consumed atomically from one manifest", async () => {
  const services = [
    "weread", "podcast", "douban", "keep", "dida", "flomo", "duolingo", "bbdc",
    "bilibili", "neteasemusic", "forest", "toggl", "applemusic", "strava", "trakt",
    "youtube", "spotify", "xiaohongshu", "douyin", "github", "guwendao", "daily",
  ]
  const vault = new MemoryVault()
  const reader = new Reader()
  const entries: Record<string, ManifestEntry> = {}
  for (const service of services) {
    const path = `services/${service}/fixture/${service}-1.md`
    const content = serviceNote(service)
    reader.files.set(path, content)
    entries[`${service}:fixture:${service}-1`] = {
      service, entityType: "fixture", entityId: `${service}-1`, path,
      contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
    }
  }
  reader.manifestValue = { schemaVersion: 1, entries }
  let settings: PluginSettings = { ...DEFAULT_SETTINGS, serviceFolders: {}, lastManifest: null }
  const engine = new SyncEngine(api as any, vault, settings, async (patch) => { settings = { ...settings, ...patch } }, () => {}, () => reader as any)
  const result = await engine.run()
  assert.equal(result.created, services.length)
  assert.equal(vault.files.size, services.length)
  for (const service of services) {
    assert.ok(vault.files.has(`NotionHub/services/${service}/fixture/${service}-1.md`), service)
  }
})

async function manifest(content: string): Promise<VaultManifest> {
  const entry: ManifestEntry = {
    service: "weread", entityType: "book", entityId: "book-1",
    path: "services/weread/book/book-1.md", contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
  }
  return { schemaVersion: 1, entries: { "weread:book:book-1": entry } }
}

function note(version: string): string {
  return `---\nnotionhub_service: weread\nnotionhub_entity_type: book\nnotionhub_entity_id: book-1\n---\n<!-- notionhub-managed-start -->\nfixture ${version}\n<!-- notionhub-managed-end -->\n`
}

function serviceNote(service: string): string {
  return `---\nnotionhub_service: ${service}\nnotionhub_entity_type: fixture\nnotionhub_entity_id: ${service}-1\n---\n<!-- notionhub-managed-start -->\n${service}\n<!-- notionhub-managed-end -->\n`
}

function identity(content: string) {
  const value = (key: string) => content.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1] || ""
  const service = value("notionhub_service")
  const entityType = value("notionhub_entity_type")
  const entityId = value("notionhub_entity_id")
  return service && entityType && entityId ? { service, entityType, entityId } : null
}
