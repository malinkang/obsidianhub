import assert from "node:assert/strict"
import test from "node:test"

import { toFetchResponse } from "../src/fetch-response"

const body = new TextEncoder().encode("content").buffer

for (const status of [204, 205, 304]) {
  test(`Obsidian request bridge preserves bodyless ${status} responses`, async () => {
    const response = toFetchResponse("GET", { arrayBuffer: body, status, headers: {} })
    assert.equal(response.status, status)
    assert.equal(await response.text(), "")
  })
}

test("Obsidian request bridge preserves ordinary response bodies", async () => {
  const response = toFetchResponse("GET", { arrayBuffer: body, status: 200, headers: { ETag: '"vault"' } })
  assert.equal(await response.text(), "content")
  assert.equal(response.headers.get("ETag"), '"vault"')
})

test("Obsidian request bridge strips bodies from HEAD responses", async () => {
  const response = toFetchResponse("HEAD", { arrayBuffer: body, status: 200, headers: {} })
  assert.equal(await response.text(), "")
})
