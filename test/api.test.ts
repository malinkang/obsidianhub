import assert from "node:assert/strict"
import test from "node:test"

import { GithubRepositoryReader, NotionHubApi } from "../src/api"
import type { DeviceCredentials } from "../src/types"

test("expired device access refreshes without exposing the refresh token to GitHub", async () => {
  const credentials: DeviceCredentials = {
    accessToken: "expired-access", refreshToken: "refresh-secret",
    accessExpiresAt: new Date(0).toISOString(), refreshExpiresAt: "2030-01-01T00:00:00Z",
  }
  const calls: Array<{ url: string; authorization: string; body: string }> = []
  let saved: DeviceCredentials | null = null
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(request), authorization: new Headers(init?.headers).get("Authorization") || "", body: String(init?.body || "") })
    if (String(request).endsWith("/refresh")) return Response.json({ code: 200, data: { accessToken: "fresh-access", accessExpiresAt: "2030-01-01T00:00:00Z" } })
    return Response.json({ code: 200, data: { repository: { owner: "u", name: "v", fullName: "u/v", defaultBranch: "main", bound: true, status: "ready" }, token: "github-read", expiresAt: "2030-01-01T00:00:00Z", permissions: { contents: "read" } } })
  }
  const api = new NotionHubApi("https://integration.test/v1", credentials, async (value) => { saved = value }, fetcher as typeof fetch)
  const token = await api.repositoryToken()
  assert.equal(token.token, "github-read")
  assert.ok(saved)
  assert.equal((saved as DeviceCredentials).accessToken, "fresh-access")
  assert.match(calls[0]!.body, /refresh-secret/)
  assert.equal(calls[1]!.authorization, "Bearer fresh-access")
})

test("GitHub reader uses commit SHA, ETag and read-only bearer requests", async () => {
  const calls: Array<{ url: string; headers: Headers }> = []
  const fetcher = async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    calls.push({ url, headers: new Headers(init?.headers) })
    if (url.includes("/git/ref/heads/")) return Response.json({ object: { sha: "commit-1" } })
    if (url.includes("manifest.json")) return new Response(null, { status: 304, headers: { ETag: '"etag-1"' } })
    return new Response("body")
  }
  const reader = new GithubRepositoryReader({ bound: true, status: "ready", owner: "u", name: "v", fullName: "u/v", defaultBranch: "main" }, "github-read", fetcher as typeof fetch)
  assert.equal(await reader.headCommit(), "commit-1")
  assert.equal((await reader.manifest("commit-1", '"etag-1"')).unchanged, true)
  await reader.file("services/weread/book/1.md", "commit-1")
  assert.ok(calls.every((call) => call.headers.get("Authorization") === "Bearer github-read"))
  assert.match(calls[1]!.url, /ref=commit-1/)
  assert.equal(calls[1]!.headers.get("If-None-Match"), '"etag-1"')
})

test("repository network failures are surfaced without replacing local state", async () => {
  const reader = new GithubRepositoryReader(
    { bound: true, status: "ready", owner: "u", name: "v", fullName: "u/v", defaultBranch: "main" },
    "github-read",
    (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
  )
  await assert.rejects(reader.headCommit(), /503/)
})
