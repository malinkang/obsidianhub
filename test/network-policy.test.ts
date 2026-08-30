import assert from "node:assert/strict"
import test from "node:test"

import { safeExternalUrl } from "../src/network-policy"

test("external media policy accepts only public credential-free HTTPS URLs", () => {
  assert.equal(safeExternalUrl("https://images.example/cover.jpg"), "https://images.example/cover.jpg")
  for (const value of [
    "http://images.example/cover.jpg",
    "https://user:pass@images.example/cover.jpg",
    "https://localhost/a.png",
    "https://service.internal/a.png",
    "https://127.0.0.1/a.png",
    "https://10.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.2/a.png",
    "https://[::1]/a.png",
    "javascript:alert(1)",
  ]) assert.equal(safeExternalUrl(value), null, value)
})
