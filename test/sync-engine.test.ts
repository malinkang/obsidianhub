import assert from "node:assert/strict"
import test from "node:test"

import { NotionHubApi } from "../src/api"
import { cacheExternalImages, SyncEngine, type VaultAdapter, type VaultNote } from "../src/sync-engine"
import { DEFAULT_SETTINGS, type DeviceCredentials, type ManifestEntry, type PluginSettings, type VaultManifest } from "../src/types"
import { sha256Hex } from "../src/markdown"
import { TEMPLATE_PACKS } from "../src/templates"

class MemoryVault implements VaultAdapter {
  files = new Map<string, string>()
  binaries = new Map<string, ArrayBuffer>()
  failNextWrite = false
  writeCount = 0

  async notes(): Promise<VaultNote[]> {
    return [...this.files].filter(([path]) => path.endsWith(".md")).map(([path, content]) => ({ path, content, identity: identity(content) }))
  }
  async read(path: string): Promise<string | null> { return this.files.get(path) ?? null }
  async writeAtomic(path: string, content: string): Promise<void> {
    if (this.failNextWrite) { this.failNextWrite = false; throw new Error("interrupted") }
    this.writeCount += 1
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

test("first sync, no-change, update after move, and user-preserving tombstone are idempotent", async () => {
  const vault = new MemoryVault()
  const reader = new Reader()
  const remote1 = note("v1")
  reader.files.set("services/weread/book/book-1.md", remote1)
  reader.manifestValue = await manifest(remote1)
  let settings: PluginSettings = { ...DEFAULT_SETTINGS, serviceFolders: {}, lastManifest: null }
  const engine = new SyncEngine(reader, vault, settings, async (patch) => { settings = { ...settings, ...patch } }, () => {})

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

test("a second pull follows the HTTP 304 path without fetching or rewriting files", async () => {
  const vault = new MemoryVault()
  const commit = "a".repeat(40)
  const content = note("v1")
  const manifestValue = await manifest(content)
  const etag = '"manifest-v1"'
  const credentials: DeviceCredentials = {
    accessToken: "device-access",
    refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z",
    refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const requests: Array<{ url: string; method: string; ifNoneMatch: string }> = []
  let manifestRequests = 0
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(request)
    const headers = new Headers(init?.headers)
    requests.push({ url, method: init?.method || "GET", ifNoneMatch: headers.get("If-None-Match") || "" })
    if (url.includes("/vault/head")) {
      return Response.json({ code: 200, data: { commit, branch: "main" } })
    }
    if (url.includes("/vault/manifest")) {
      manifestRequests += 1
      if (manifestRequests === 2) return new Response(null, { status: 304 })
      return Response.json(manifestValue, { headers: { ETag: etag } })
    }
    if (url.endsWith("/vault/files")) {
      const body = JSON.parse(String(init?.body)) as { commit: string; paths: string[] }
      return Response.json({
        code: 200,
        data: { commit: body.commit, files: body.paths.map((path) => ({ path, content })) },
      })
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const api = new NotionHubApi("https://integration.test/v1", credentials, async () => {}, fetcher as typeof fetch)
  const engine = new SyncEngine(api, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})

  const first = await engine.run()
  assert.equal(first.created, 1)
  const entryPath = "NotionHub/services/weread/book/book-1.md"
  const firstEntry = vault.files.get(entryPath)
  const writesAfterFirstPull = vault.writeCount
  const requestsAfterFirstPull = requests.length

  const second = await engine.run()
  assert.deepEqual(
    { created: second.created, updated: second.updated, deleted: second.deleted, skipped: second.skipped },
    { created: 0, updated: 0, deleted: 0, skipped: 1 },
  )
  assert.equal(vault.writeCount, writesAfterFirstPull)
  assert.equal(vault.files.get(entryPath), firstEntry)
  assert.deepEqual(requests.slice(requestsAfterFirstPull).map(({ url }) => new URL(url).pathname), [
    "/v1/obsidian/device/vault/head",
    "/v1/obsidian/device/vault/manifest",
  ])
  assert.deepEqual(requests.filter(({ url }) => url.includes("/vault/manifest")).map(({ ifNoneMatch }) => ifNoneMatch), ["", etag])
  assert.equal(requests.filter(({ url }) => url.endsWith("/vault/files") || url.includes("/vault/file?")).length, 1)
})

test("interruption does not advance checkpoint and retry completes", async () => {
  const vault = new MemoryVault()
  vault.failNextWrite = true
  const reader = new Reader()
  const content = note("v1")
  reader.files.set("services/weread/book/book-1.md", content)
  reader.manifestValue = await manifest(content)
  let saves = 0
  const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => { saves += 1 }, () => {})
  await assert.rejects(engine.run(), /interrupted/)
  assert.equal(saves, 0)
  assert.equal((await engine.run()).created, 1)
  assert.equal(saves, 1)
})

test("cancellation stops before repository access", async () => {
  const controller = new AbortController()
  controller.abort()
  let requested = false
  const cancelledReader = {
    headCommit: async () => { requested = true; return "a".repeat(40) },
    manifest: async () => { throw new Error("unexpected") },
    file: async () => { throw new Error("unexpected") },
  }
  const engine = new SyncEngine(cancelledReader, new MemoryVault(), { ...DEFAULT_SETTINGS }, async () => {}, () => {})
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

test("image caching blocks private, insecure, oversized and active image content", async () => {
  const vault = new MemoryVault()
  const entry = (await manifest(note("v1"))).entries["weread:book:book-1"]!
  let requests = 0
  const fetcher = async () => { requests += 1; return new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png" } }) }
  const unsafe = "![a](http://images.example/a.png) ![b](https://127.0.0.1/b.png)"
  assert.equal(await cacheExternalImages(unsafe, entry, "NotionHub", vault, fetcher as typeof fetch), unsafe)
  assert.equal(requests, 0)

  const svg = "![svg](https://images.example/a.svg)"
  assert.equal(await cacheExternalImages(svg, entry, "NotionHub", vault, async () => new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }) as any), svg)
  const large = "![large](https://images.example/a.png)"
  assert.equal(await cacheExternalImages(large, entry, "NotionHub", vault, async () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png", "Content-Length": String(16 * 1024 * 1024) } }) as any), large)
  assert.equal(vault.binaries.size, 0)
})

test("all 23 active service namespaces are consumed atomically from one manifest", async () => {
  const services = [
    "weread", "podcast", "douban", "keep", "dida", "flomo", "duolingo", "bbdc",
    "bilibili", "neteasemusic", "forest", "toggl", "applemusic", "applepodcast", "trakt", "youtube",
    "spotify", "douyin", "weibo", "github", "guwendao", "jike", "daily",
  ]
  const vault = new MemoryVault()
  const reader = new Reader()
  const entries: Record<string, ManifestEntry> = {}
  for (const service of services) {
    const entityType = TEMPLATE_PACKS[service]!.detailEntities[0]!
    const path = `services/${service}/${entityType}/${service}-1.md`
    const content = serviceNote(service, entityType)
    reader.files.set(path, content)
    entries[`${service}:fixture:${service}-1`] = {
      service, entityType, entityId: `${service}-1`, path,
      contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
    }
  }
  reader.manifestValue = { schemaVersion: 1, entries }
  let settings: PluginSettings = { ...DEFAULT_SETTINGS, serviceFolders: {}, lastManifest: null }
  const engine = new SyncEngine(reader, vault, settings, async (patch) => { settings = { ...settings, ...patch } }, () => {})
  const result = await engine.run()
  assert.equal(result.created, services.length)
  assert.equal(vault.files.size, services.length * 2)
  for (const service of services) {
    const entityType = TEMPLATE_PACKS[service]!.detailEntities[0]!
    const detail = vault.files.get(`NotionHub/services/${service}/${entityType}/${service}-1.md`) || ""
    assert.match(detail, /notionhub-detail-template-start/, `${service} detail template`)
    assert.ok(vault.files.has(`NotionHub/services/${service}/首页.md`), `${service} template`)
  }
})

test("Jike and Weibo namespaces are accepted while retired and undeclared services are rejected", async () => {
  for (const [service, entityType] of [["jike", "posts"], ["weibo", "weibo"]] as const) {
    const vault = new MemoryVault()
    const reader = new Reader()
    const content = serviceNote(service, entityType)
    const path = `services/${service}/${entityType}/${service}-1.md`
    reader.files.set(path, content)
    reader.manifestValue = {
      schemaVersion: 1,
      entries: {
        [`${service}:${entityType}:${service}-1`]: {
          service, entityType, entityId: `${service}-1`, path,
          contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
        },
      },
    }
    const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
    assert.equal((await engine.run()).created, 1)
    assert.ok(vault.files.has(`NotionHub/services/${service}/${entityType}/${service}-1.md`))
  }

  for (const service of ["strava", "xiaohongshu", "unknown"]) {
    const vault = new MemoryVault()
    const reader = new Reader()
    const content = serviceNote(service, "posts")
    const path = `services/${service}/posts/${service}-1.md`
    reader.files.set(path, content)
    reader.manifestValue = {
      schemaVersion: 1,
      entries: {
        [`${service}:posts:${service}-1`]: {
          service, entityType: "posts", entityId: `${service}-1`, path,
          contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
        },
      },
    }
    const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
    await assert.rejects(engine.run(), new RegExp(`manifest 包含未知服务：${service}`))
    assert.equal(vault.files.size, 0)
  }
})

test("large initial sync uses bounded Worker batches instead of one request per note", async () => {
  const vault = new MemoryVault()
  const reader = new Reader()
  const entries: Record<string, ManifestEntry> = {}
  for (let index = 0; index < 121; index += 1) {
    const path = `services/weread/book/book-${index}.md`
    const content = noteForId(`book-${index}`)
    reader.files.set(path, content)
    entries[`weread:book:book-${index}`] = {
      service: "weread", entityType: "book", entityId: `book-${index}`, path,
      contentHash: await sha256Hex(content), updatedAt: "2026-08-29T00:00:00Z",
    }
  }
  reader.manifestValue = { schemaVersion: 2, entries }
  const batches: number[] = []
  const batchReader = {
    headCommit: () => reader.headCommit(),
    manifest: () => reader.manifest(),
    file: async () => { throw new Error("singular file fallback should not run") },
    readFiles: async (paths: string[]) => {
      batches.push(paths.length)
      return new Map(paths.map((path) => [path, reader.files.get(path)!]))
    },
  }
  const engine = new SyncEngine(batchReader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
  const result = await engine.run()
  assert.equal(result.created, 121)
  assert.deepEqual(batches, [50, 50, 21])
})

test("manifest v2 visual artifacts are hash-verified, cached and install templates", async () => {
  const vault = new MemoryVault()
  const reader = new Reader()
  const noteContent = note("v2")
  const catalogContent = JSON.stringify({ schemaVersion: 1, service: "weread", label: "微信读书", icon: "📚", color: "#2f7d32", primaryEntities: ["book"], entries: [] }) + "\n"
  const analyticsContent = JSON.stringify({ schemaVersion: 1, service: "weread", series: [] }) + "\n"
  reader.files.set("services/weread/book/book-1.md", noteContent)
  reader.files.set(".notionhub/catalog/weread.json", catalogContent)
  reader.files.set(".notionhub/analytics/weread.json", analyticsContent)
  const base = await manifest(noteContent)
  reader.manifestValue = {
    ...base,
    schemaVersion: 2,
    catalogs: { weread: { path: ".notionhub/catalog/weread.json", contentHash: await sha256Hex(catalogContent), schemaVersion: 1 } },
    analytics: { weread: { path: ".notionhub/analytics/weread.json", contentHash: await sha256Hex(analyticsContent), schemaVersion: 1 } },
  }
  const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
  const result = await engine.run()
  assert.equal(result.templatesCreated, 1)
  assert.equal(vault.files.get("NotionHub/.notionhub/catalog/weread.json"), catalogContent)
  assert.equal(vault.files.get("NotionHub/.notionhub/analytics/weread.json"), analyticsContent)
  assert.match(vault.files.get("NotionHub/services/weread/首页.md") || "", /```notionhub-view/)
})

test("manifest paths cannot escape their service or target Obsidian configuration", async () => {
  const unsafePaths = [
    "services/weread/../../.obsidian/plugins/evil.md",
    "services/weread/book\\..\\evil.md",
    ".obsidian/plugins/evil.md",
    "services/douban/book/book-1.md",
  ]
  for (const path of unsafePaths) {
    const vault = new MemoryVault()
    const reader = new Reader()
    const content = note("unsafe")
    const base = await manifest(content)
    base.entries["weread:book:book-1"]!.path = path
    reader.manifestValue = base
    reader.files.set(path, content)
    const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
    await assert.rejects(engine.run(), /路径|不安全/)
    assert.equal(vault.files.size, 0)
  }
})

test("configured output paths cannot escape the vault or write into .obsidian", async () => {
  for (const settings of [
    { vaultRoot: "../outside" },
    { vaultRoot: ".obsidian/plugins/notionhub" },
    { serviceFolders: { weread: "../../outside" } },
  ]) {
    const vault = new MemoryVault()
    const reader = new Reader()
    const content = note("unsafe settings")
    reader.manifestValue = await manifest(content)
    reader.files.set("services/weread/book/book-1.md", content)
    const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS, ...settings }, async () => {}, () => {})
    await assert.rejects(engine.run(), /路径|Obsidian 配置目录/)
    assert.equal(vault.files.size, 0)
  }
})

test("visual artifact paths must match their exact service destination", async () => {
  const vault = new MemoryVault()
  const reader = new Reader()
  reader.manifestValue = {
    schemaVersion: 2,
    entries: {},
    catalogs: { weread: { path: ".notionhub/catalog/../../.obsidian/evil.json", contentHash: "unused", schemaVersion: 1 } },
  }
  const engine = new SyncEngine(reader, vault, { ...DEFAULT_SETTINGS }, async () => {}, () => {})
  await assert.rejects(engine.run(), /可视化路径无效/)
  assert.equal(vault.files.size, 0)
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

function noteForId(entityId: string): string {
  return `---\nnotionhub_service: weread\nnotionhub_entity_type: book\nnotionhub_entity_id: ${entityId}\n---\n<!-- notionhub-managed-start -->\n${entityId}\n<!-- notionhub-managed-end -->\n`
}

function serviceNote(service: string, entityType: string): string {
  return `---\nnotionhub_service: ${service}\nnotionhub_entity_type: ${entityType}\nnotionhub_entity_id: ${service}-1\n---\n<!-- notionhub-managed-start -->\n${service}\n<!-- notionhub-managed-end -->\n`
}

function identity(content: string) {
  const value = (key: string) => content.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1] || ""
  const service = value("notionhub_service")
  const entityType = value("notionhub_entity_type")
  const entityId = value("notionhub_entity_id")
  return service && entityType && entityId ? { service, entityType, entityId } : null
}
