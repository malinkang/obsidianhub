import type { DeviceCredentials, StoredDeviceConnection } from "./types"

export const REFRESH_TOKEN_SECRET_ID = "notionhub-refresh-token"

export type SecretStorageLike = {
  getSecret(id: string): string | null
  setSecret(id: string, secret: string): void
}

export function runtimeCredentials(connection: StoredDeviceConnection | null, secrets: SecretStorageLike): DeviceCredentials | null {
  const refreshToken = secrets.getSecret(REFRESH_TOKEN_SECRET_ID) || ""
  if (!connection || !refreshToken) return null
  return {
    accessToken: "",
    accessExpiresAt: "",
    refreshToken,
    refreshExpiresAt: connection.refreshExpiresAt,
  }
}

export function persistCredentials(credentials: DeviceCredentials | null, secrets: SecretStorageLike): StoredDeviceConnection | null {
  secrets.setSecret(REFRESH_TOKEN_SECRET_ID, credentials?.refreshToken || "")
  return credentials ? { refreshExpiresAt: credentials.refreshExpiresAt } : null
}

export function migrateLegacyCredentials(value: unknown, secrets: SecretStorageLike): { connection: StoredDeviceConnection | null; migrated: boolean } {
  if (!value || typeof value !== "object") return { connection: null, migrated: false }
  const candidate = value as Partial<DeviceCredentials & StoredDeviceConnection>
  if (typeof candidate.refreshToken === "string" && candidate.refreshToken) {
    secrets.setSecret(REFRESH_TOKEN_SECRET_ID, candidate.refreshToken)
    return {
      connection: { refreshExpiresAt: typeof candidate.refreshExpiresAt === "string" ? candidate.refreshExpiresAt : "" },
      migrated: true,
    }
  }
  if (typeof candidate.refreshExpiresAt === "string") {
    return { connection: { refreshExpiresAt: candidate.refreshExpiresAt }, migrated: false }
  }
  return { connection: null, migrated: true }
}
