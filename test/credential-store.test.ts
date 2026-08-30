import assert from "node:assert/strict"
import test from "node:test"

import { REFRESH_TOKEN_SECRET_ID, migrateLegacyCredentials, persistCredentials, runtimeCredentials } from "../src/credential-store"
import type { DeviceCredentials } from "../src/types"

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
