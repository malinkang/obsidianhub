import type { DeviceCredentials, VaultManifest } from "./types"

export const NOTIONHUB_INTEGRATION_BASE_URL = "https://i.notionhub.app/v1"
export const NOTIONHUB_DEVICE_AUTHORIZE_URL = "https://www.notionhub.app/obsidian/authorize"
const MAX_DEVICE_FILE_BATCH = 50
const MAX_DEVICE_FILE_BYTES = 1024 * 1024
const MAX_DEVICE_BATCH_BYTES = 8 * 1024 * 1024

type ApiEnvelope<T> = { code: number; message?: string; data: T }

type ManifestResponse = {
  manifest: VaultManifest | null
  etag: string
  unchanged: boolean
}

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
    let revokeError: unknown = null
    try {
      if (this.credentials) await this.integration("/obsidian/device/current", { method: "DELETE" })
    } catch (error) {
      revokeError = error
    }
    this.credentials = null
    await this.persistCredentials(null)
    if (revokeError) throw revokeError
  }

  async headCommit(signal?: AbortSignal): Promise<string> {
    const result = await this.integration<{ commit: string; branch: string }>(
      "/obsidian/device/vault/head",
      { method: "GET", signal },
    )
    if (!isCommitSha(result.commit)) throw new Error("NotionHub 未返回有效的 Vault 版本")
    return result.commit
  }

  async manifest(commitSha: string, etag: string, signal?: AbortSignal): Promise<ManifestResponse> {
    assertCommitSha(commitSha)
    const query = new URLSearchParams({ commit: commitSha })
    const response = await this.authenticatedRequest(`/obsidian/device/vault/manifest?${query}`, {
      method: "GET",
      signal,
      headers: etag ? { "If-None-Match": etag } : undefined,
    })
    if (response.status === 304) return { manifest: null, etag, unchanged: true }
    if (!response.ok) throw await responseError(response, "读取 Vault manifest 失败")
    const manifest = await response.json().catch(() => null) as VaultManifest | null
    if (!manifest || ![1, 2].includes(manifest.schemaVersion) || !manifest.entries || typeof manifest.entries !== "object") {
      throw new Error("不支持的 NotionHub manifest")
    }
    return { manifest, etag: response.headers.get("ETag") || "", unchanged: false }
  }

  async file(path: string, commitSha: string, signal?: AbortSignal): Promise<string> {
    assertCommitSha(commitSha)
    assertVaultPath(path)
    const query = new URLSearchParams({ commit: commitSha, path })
    const response = await this.authenticatedRequest(`/obsidian/device/vault/file?${query}`, { method: "GET", signal })
    if (!response.ok) throw await responseError(response, `读取 ${path} 失败`)
    return response.text()
  }

  async readFiles(paths: string[], commitSha: string, signal?: AbortSignal): Promise<Map<string, string>> {
    assertCommitSha(commitSha)
    if (!paths.length || paths.length > MAX_DEVICE_FILE_BATCH || new Set(paths).size !== paths.length) {
      throw new Error("Vault 批量文件请求无效")
    }
    paths.forEach(assertVaultPath)
    return this.fileBatch(paths, commitSha, signal)
  }

  async ensureDeviceAccess(forceRefresh = false): Promise<string> {
    if (!this.credentials) throw new Error("请先连接 NotionHub")
    if (!forceRefresh && this.credentials.accessToken && Date.parse(this.credentials.accessExpiresAt) - Date.now() > 60_000) {
      return this.credentials.accessToken
    }
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
    const response = authenticated
      ? await this.authenticatedRequest(path, init)
      : await this.request(path, init, "")
    const envelope = await response.json().catch(() => null) as ApiEnvelope<T> | null
    if (!response.ok || !envelope || envelope.code !== 200) {
      throw new Error(envelope?.message || `NotionHub 请求失败 (${response.status})`)
    }
    return envelope.data
  }

  private async authenticatedRequest(path: string, init: RequestInit): Promise<Response> {
    let token = await this.ensureDeviceAccess()
    let response = await this.request(path, init, token)
    if (response.status !== 401) return response

    token = await this.ensureDeviceAccess(true)
    response = await this.request(path, init, token)
    return response
  }

  private async fileBatch(paths: string[], commitSha: string, signal?: AbortSignal): Promise<Map<string, string>> {
    const response = await this.authenticatedRequest("/obsidian/device/vault/files", {
      method: "POST",
      body: JSON.stringify({ commit: commitSha, paths }),
      signal,
    })
    if (response.status === 413 && paths.length > 1) {
      const middle = Math.ceil(paths.length / 2)
      const left = await this.fileBatch(paths.slice(0, middle), commitSha, signal)
      const right = await this.fileBatch(paths.slice(middle), commitSha, signal)
      return new Map([...left, ...right])
    }
    if ([404, 405, 501].includes(response.status)) {
      const fallback = new Map<string, string>()
      for (const path of paths) fallback.set(path, await this.file(path, commitSha, signal))
      return fallback
    }
    if (!response.ok) throw await responseError(response, "批量读取 Vault 文件失败")
    const envelope = await response.json().catch(() => null) as ApiEnvelope<{
      commit: string
      files: Array<{ path: string; content: string }>
    }> | null
    if (!envelope || envelope.code !== 200 || envelope.data?.commit !== commitSha || !Array.isArray(envelope.data.files)) {
      throw new Error("NotionHub 批量文件响应无效")
    }
    const requested = new Set(paths)
    const result = new Map<string, string>()
    let totalBytes = 0
    for (const file of envelope.data.files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string"
        || !requested.has(file.path) || result.has(file.path)) {
        throw new Error("NotionHub 批量文件响应无效")
      }
      const size = new TextEncoder().encode(file.content).byteLength
      totalBytes += size
      if (size > MAX_DEVICE_FILE_BYTES || totalBytes > MAX_DEVICE_BATCH_BYTES) {
        throw new Error("NotionHub 批量文件响应过大")
      }
      result.set(file.path, file.content)
    }
    if (result.size !== paths.length) throw new Error("NotionHub 批量文件响应不完整")
    return result
  }

  private request(path: string, init: RequestInit, token: string): Promise<Response> {
    return this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    })
  }
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value)
}

function assertCommitSha(value: string): void {
  if (!isCommitSha(value)) throw new Error("Vault 版本无效")
}

function assertVaultPath(path: string): void {
  if (!path || path.includes("\\") || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`不安全的 Vault 文件路径：${path}`)
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const envelope = await response.clone().json().catch(() => null) as { message?: string } | null
  return new Error(envelope?.message || `${fallback} (${response.status})`)
}
