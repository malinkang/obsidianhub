import assert from "node:assert/strict"
import test from "node:test"

import { NOTIONHUB_DEVICE_AUTHORIZE_URL, NotionHubApi } from "../src/api"
import type { DeviceCredentials, VaultManifest } from "../src/types"

const COMMIT = "a".repeat(40)
const MANIFEST: VaultManifest = { schemaVersion: 2, entries: {} }

test("device approval always uses the fixed first-party authorize page", () => {
  assert.equal(NOTIONHUB_DEVICE_AUTHORIZE_URL, "https://www.notionhub.app/obsidian/authorize")
})

test("expired device access refreshes before Worker-backed Vault reads", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "expired-access", refreshToken: "refresh-secret",
    accessExpiresAt: new Date(0).toISOString(), refreshExpiresAt: "2030-01-01T00:00:00Z",
  }
  const calls: Array<{ url: string; authorization: string; body: string }> = []
  let saved: DeviceCredentials | null = null
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    calls.push({ url, authorization: new Headers(init?.headers).get("Authorization") || "", body: String(init?.body || "") })
    if (url.endsWith("/refresh")) {
      return Response.json({ code: 200, data: {
        accessToken: "fresh-access", refreshToken: "rotated-refresh",
        accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: credentials.refreshExpiresAt,
      } })
    }
    return Response.json({ code: 200, data: { commit: COMMIT, branch: "main" } })
  }
  const api = new NotionHubApi("https://integration.test/v1", credentials, async (value) => { saved = value }, fetcher as typeof fetch)
  assert.equal(await api.headCommit(), COMMIT)
  assert.ok(saved)
  assert.equal((saved as DeviceCredentials).accessToken, "fresh-access")
  assert.equal((saved as DeviceCredentials).refreshToken, "rotated-refresh")
  assert.equal((saved as DeviceCredentials).refreshExpiresAt, credentials.refreshExpiresAt)
  assert.match(calls[0]!.body, /refresh-secret/)
  assert.equal(calls[1]!.authorization, "Bearer fresh-access")
  assert.ok(calls.every((call) => call.url.startsWith("https://integration.test/v1/obsidian/device/")))
})

test("Vault reads use commit SHA, ETag and only the NotionHub device bearer", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const calls: Array<{ url: string; headers: Headers }> = []
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    calls.push({ url, headers: new Headers(init?.headers) })
    if (url.includes("/vault/head")) return Response.json({ code: 200, data: { commit: COMMIT, branch: "main" } })
    if (url.includes("/vault/manifest")) return new Response(null, { status: 304, headers: { ETag: `"${COMMIT}"` } })
    return new Response("body", { headers: { ETag: `"${COMMIT}"` } })
  }
  const api = new NotionHubApi("https://integration.test/v1", credentials, async () => {}, fetcher as typeof fetch)
  assert.equal(await api.headCommit(), COMMIT)
  assert.equal((await api.manifest(COMMIT, '"manifest-etag"')).unchanged, true)
  assert.equal(await api.file("services/weread/book/1.md", COMMIT), "body")
  assert.ok(calls.every((call) => call.headers.get("Authorization") === "Bearer device-access"))
  assert.ok(calls.every((call) => call.url.startsWith("https://integration.test/v1/obsidian/device/vault/")))
  assert.match(calls[1]!.url, new RegExp(`commit=${COMMIT}`))
  assert.equal(calls[1]!.headers.get("If-None-Match"), '"manifest-etag"')
  assert.match(calls[2]!.url, /path=services%2Fweread%2Fbook%2F1\.md/)
})

test("Vault files are read in bounded Worker batches and oversized responses are split", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const requests: string[][] = []
  const fetcher = async (_request: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as { commit: string; paths: string[] }
    requests.push(body.paths)
    if (body.paths.length > 2) return Response.json({ code: 413, message: "too large", data: null }, { status: 413 })
    return Response.json({
      code: 200,
      data: {
        commit: body.commit,
        files: body.paths.map((path) => ({ path, content: `content:${path}` })),
      },
    })
  }
  const paths = Array.from({ length: 5 }, (_, index) => `services/weread/book/${index}.md`)
  const api = new NotionHubApi("https://integration.test/v1", credentials, async () => {}, fetcher as typeof fetch)
  const files = await api.readFiles(paths, COMMIT)
  assert.deepEqual([...files.keys()], paths)
  assert.equal(files.get(paths[4]!), `content:${paths[4]}`)
  assert.deepEqual(requests.map((batch) => batch.length), [5, 3, 2, 1, 2])
})

test("a singleton batch rejected for size falls back to the bounded single-file route", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const path = ".notionhub/catalog/bilibili.json"
  const calls: Array<{ url: string; method: string; authorization: string }> = []
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    const method = init?.method || "GET"
    calls.push({
      url,
      method,
      authorization: new Headers(init?.headers).get("Authorization") || "",
    })
    if (method === "POST") {
      return Response.json({ code: 413, message: "too large", data: null }, { status: 413 })
    }
    return new Response("large catalog")
  }
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async () => {},
    fetcher as typeof fetch,
  )

  const files = await api.readFiles([path], COMMIT)

  assert.equal(files.get(path), "large catalog")
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"])
  assert.ok(calls[1]!.url.includes(`/obsidian/device/vault/file?commit=${COMMIT}`))
  assert.ok(calls[1]!.url.includes("path=.notionhub%2Fcatalog%2Fbilibili.json"))
  assert.ok(calls.every((call) => call.authorization === "Bearer device-access"))
})

test("Vault batch responses cannot inject or omit paths", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const path = "services/weread/book/1.md"
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async () => {},
    (async () => Response.json({ code: 200, data: { commit: COMMIT, files: [{ path: "services/douban/book/1.md", content: "x" }] } })) as typeof fetch,
  )
  await assert.rejects(api.readFiles([path], COMMIT), /响应无效/)
})

test("a rejected device access token is refreshed and retried once", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "stale-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const authorizations: string[] = []
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    if (url.endsWith("/refresh")) {
      return Response.json({ code: 200, data: {
        accessToken: "renewed-access", refreshToken: "renewed-refresh",
        accessExpiresAt: "2030-02-01T00:00:00Z", refreshExpiresAt: credentials.refreshExpiresAt,
      } })
    }
    authorizations.push(new Headers(init?.headers).get("Authorization") || "")
    if (authorizations.length === 1) return Response.json({ code: 401, message: "expired", data: null }, { status: 401 })
    return Response.json({ code: 200, data: { commit: COMMIT, branch: "main" } })
  }
  const api = new NotionHubApi("https://integration.test/v1", credentials, async () => {}, fetcher as typeof fetch)
  assert.equal(await api.headCommit(), COMMIT)
  assert.deepEqual(authorizations, ["Bearer stale-access", "Bearer renewed-access"])
})

test("device refresh rejects a response that does not rotate and return the refresh credential", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "expired-access", refreshToken: "refresh-secret",
    accessExpiresAt: new Date(0).toISOString(), refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  let saved = false
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async () => { saved = true },
    (async () => Response.json({
      code: 200,
      data: { accessToken: "fresh-access", accessExpiresAt: "2030-01-01T00:00:00Z" },
    })) as typeof fetch,
  )

  await assert.rejects(api.ensureDeviceAccess(), /未提供轮换后的设备凭证/)
  assert.equal(saved, false)
})

test("Worker failures are surfaced without returning private repository details", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async () => {},
    (async () => Response.json({ code: 503, message: "Vault 暂时不可用", data: null }, { status: 503 })) as typeof fetch,
  )
  await assert.rejects(api.headCommit(), /Vault 暂时不可用/)
})

test("manifest parsing rejects unsupported payloads", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async () => {},
    (async () => Response.json({ ...MANIFEST, schemaVersion: 99 })) as typeof fetch,
  )
  await assert.rejects(api.manifest(COMMIT, ""), /不支持/)
})

test("disconnect clears local credentials even when remote revocation fails", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "device-access", refreshToken: "refresh-secret",
    accessExpiresAt: "2030-01-01T00:00:00Z", refreshExpiresAt: "2031-01-01T00:00:00Z",
  }
  let saved: DeviceCredentials | null | undefined
  const api = new NotionHubApi(
    "https://integration.test/v1",
    credentials,
    async (value) => { saved = value },
    (async () => Response.json({ code: 503, message: "暂时无法撤销", data: null }, { status: 503 })) as typeof fetch,
  )

  await assert.rejects(api.revoke(), /暂时无法撤销/)
  assert.equal(saved, null)
  await assert.rejects(api.headCommit(), /请先连接 NotionHub/)
})
