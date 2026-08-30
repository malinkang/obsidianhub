import assert from "node:assert/strict"
import test from "node:test"

import { REFRESH_TOKEN_SECRET_ID, migrateLegacyCredentials, persistCredentials, runtimeCredentials } from "../src/credential-store"
import { normalizePluginSettings, type DeviceCredentials } from "../src/types"

class Secrets {
  values = new Map<string, string>()
  getSecret(id: string) { return this.values.get(id) || null }
  setSecret(id: string, value: string) { this.values.set(id, value) }
}

const credentials: DeviceCredentials = {
  accessToken: "access-secret",
  accessExpiresAt: "2030-01-01T00:00:00Z",
  refreshToken: "refresh-secret",
  refreshExpiresAt: "2031-01-01T00:00:00Z",
}

test("persistent settings retain only non-secret connection metadata", () => {
  const secrets = new Secrets()
  const connection = persistCredentials(credentials, secrets)
  assert.deepEqual(connection, { refreshExpiresAt: credentials.refreshExpiresAt })
  assert.equal(secrets.getSecret(REFRESH_TOKEN_SECRET_ID), "refresh-secret")
  assert.deepEqual(runtimeCredentials(connection, secrets), {
    accessToken: "", accessExpiresAt: "", refreshToken: "refresh-secret", refreshExpiresAt: credentials.refreshExpiresAt,
  })
  assert.doesNotMatch(JSON.stringify(connection), /access-secret|refresh-secret/)
})

test("legacy plaintext settings migrate once into SecretStorage", () => {
  const secrets = new Secrets()
  const result = migrateLegacyCredentials(credentials, secrets)
  assert.equal(result.migrated, true)
  assert.deepEqual(result.connection, { refreshExpiresAt: credentials.refreshExpiresAt })
  assert.equal(secrets.getSecret(REFRESH_TOKEN_SECRET_ID), "refresh-secret")
})

test("disconnect clears the stored refresh credential", () => {
  const secrets = new Secrets()
  persistCredentials(credentials, secrets)
  assert.equal(persistCredentials(null, secrets), null)
  assert.equal(secrets.getSecret(REFRESH_TOKEN_SECRET_ID), null)
})

test("settings normalization removes all historical repository credentials", () => {
  const normalized = normalizePluginSettings({
    vaultRoot: "Notes",
    credentials: { refreshToken: "legacy-refresh" },
    githubToken: "legacy-github",
    repositoryToken: "legacy-repository",
    repositoryCredential: { token: "legacy-object" },
    integrationBaseUrl: "https://attacker.invalid/v1",
    unknownSetting: "drop-me",
  }, { refreshExpiresAt: "2031-01-01T00:00:00Z" })
  assert.equal(normalized.vaultRoot, "Notes")
  assert.deepEqual(normalized.credentials, { refreshExpiresAt: "2031-01-01T00:00:00Z" })
  assert.doesNotMatch(JSON.stringify(normalized), /legacy|githubToken|repositoryToken|repositoryCredential|integrationBaseUrl|attacker|unknownSetting/)
})
