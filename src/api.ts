import type { DeviceCredentials, RepositoryStatus, ServiceAnalytics, ServiceCatalog, VaultManifest } from "./types"

type ApiEnvelope<T> = { code: number; message?: string; data: T }

export class NotionHubApi {
  constructor(
    private readonly baseUrl: string,
    private credentials: DeviceCredentials | null,
    private readonly persistCredentials: (credentials: DeviceCredentials | null) => Promise<void>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async startDevice(deviceLabel: string): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresAt: string; interval: number }> {
    return this.integration("/obsidian/device/start", { method: "POST", body: JSON.stringify({ deviceLabel }) }, false)
  }

  async pollDevice(deviceCode: string): Promise<{ status: "pending" } | ({ status: "authorized" } & DeviceCredentials)> {
    const result = await this.integration<{ status: "pending" } | ({ status: "authorized" } & DeviceCredentials)>(
      "/obsidian/device/poll",
      { method: "POST", body: JSON.stringify({ deviceCode }) },
      false,
    )
    if (result.status === "authorized") {
      this.credentials = result
      await this.persistCredentials(result)
    }
    return result
  }

  async revoke(): Promise<void> {
    if (this.credentials) await this.integration("/obsidian/device/current", { method: "DELETE" })
    this.credentials = null
    await this.persistCredentials(null)
  }

  async repositoryToken(): Promise<{ repository: RepositoryStatus; token: string; expiresAt: string; permissions: { contents: "read" } }> {
    return this.integration("/obsidian/device/token", { method: "POST", body: "{}" })
  }

  async ensureDeviceAccess(): Promise<string> {
    if (!this.credentials) throw new Error("请先连接 NotionHub")
    if (Date.parse(this.credentials.accessExpiresAt) - Date.now() > 60_000) return this.credentials.accessToken
    const refreshed = await this.integration<{ accessToken: string; accessExpiresAt: string }>(
      "/obsidian/device/refresh",
      { method: "POST", body: JSON.stringify({ refreshToken: this.credentials.refreshToken }) },
      false,
    )
    this.credentials = { ...this.credentials, ...refreshed }
    await this.persistCredentials(this.credentials)
    return refreshed.accessToken
  }

  private async integration<T>(path: string, init: RequestInit, authenticated = true): Promise<T> {
    const token = authenticated ? await this.ensureDeviceAccess() : ""
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    })
    const envelope = await response.json().catch(() => null) as ApiEnvelope<T> | null
    if (!response.ok || !envelope || envelope.code !== 200) throw new Error(envelope?.message || `NotionHub 请求失败 (${response.status})`)
    return envelope.data
  }
}

export class GithubRepositoryReader {
  constructor(
    private readonly repository: RepositoryStatus,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async headCommit(signal?: AbortSignal): Promise<string> {
    const data = await this.json<{ object?: { sha?: string } }>(
      `/git/ref/heads/${encodeURIComponent(this.repository.defaultBranch || "main")}`,
      signal,
    )
    const sha = data.object?.sha
    if (!sha) throw new Error("GitHub 未返回仓库提交版本")
    return sha
  }

  async manifest(commitSha: string, etag: string, signal?: AbortSignal): Promise<{ manifest: VaultManifest | null; etag: string; unchanged: boolean }> {
    const response = await this.request(`/.notionhub/manifest.json?ref=${encodeURIComponent(commitSha)}`, {
      signal,
      headers: { Accept: "application/vnd.github.raw+json", ...(etag ? { "If-None-Match": etag } : {}) },
    })
    if (response.status === 304) return { manifest: null, etag, unchanged: true }
    if (!response.ok) throw new Error(`读取 manifest 失败 (${response.status})`)
    const manifest = JSON.parse(await response.text()) as VaultManifest
    if (![1, 2].includes(manifest.schemaVersion) || !manifest.entries || typeof manifest.entries !== "object") throw new Error("不支持的 NotionHub manifest")
    return { manifest, etag: response.headers.get("ETag") || "", unchanged: false }
  }

  async catalog(path: string, commitSha: string, signal?: AbortSignal): Promise<ServiceCatalog> {
    return this.artifact<ServiceCatalog>(path, commitSha, 1, signal)
  }

  async analytics(path: string, commitSha: string, signal?: AbortSignal): Promise<ServiceAnalytics> {
    return this.artifact<ServiceAnalytics>(path, commitSha, 1, signal)
  }

  async file(path: string, commitSha: string, signal?: AbortSignal): Promise<string> {
    const response = await this.request(`/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(commitSha)}`, {
      signal,
      headers: { Accept: "application/vnd.github.raw+json" },
    })
    if (!response.ok) throw new Error(`读取 ${path} 失败 (${response.status})`)
    return response.text()
  }

  private async artifact<T extends { schemaVersion?: number }>(path: string, commitSha: string, schemaVersion: number, signal?: AbortSignal): Promise<T> {
    const raw = await this.file(path, commitSha, signal)
    const value = JSON.parse(raw) as T
    if (!value || value.schemaVersion !== schemaVersion) throw new Error(`不支持的可视化数据：${path}`)
    return value
  }

  private async json<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.request(path, { signal })
    if (!response.ok) throw new Error(`GitHub 请求失败 (${response.status})`)
    return response.json() as Promise<T>
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return this.fetcher(`https://api.github.com/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.name)}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers || {}),
      },
    })
  }
}
