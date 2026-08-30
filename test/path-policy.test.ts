import assert from "node:assert/strict"
import test from "node:test"

import { joinVaultPath, safeConfiguredPath, safeRelativePath, safeVaultWritePath } from "../src/path-policy"

test("safe paths preserve normal and NotionHub metadata paths", () => {
  assert.equal(safeRelativePath(".notionhub/catalog/weread.json"), ".notionhub/catalog/weread.json")
  assert.equal(safeConfiguredPath(" 阅读/微信读书 ", "NotionHub"), "阅读/微信读书")
  assert.equal(safeConfiguredPath("  ", "NotionHub"), "NotionHub")
  assert.equal(joinVaultPath("NotionHub", "services/weread/book.md"), "NotionHub/services/weread/book.md")
})

test("unsafe and Obsidian-internal paths are rejected", () => {
  for (const path of ["/tmp/file", "C:/tmp/file", "../file", "a/../file", "a//file", "a\\..\\file", "a\u0000/file"]) {
    assert.throws(() => safeRelativePath(path), /不安全的路径/)
  }
  for (const path of [".obsidian", ".obsidian/plugins/evil.js", ".OBSIDIAN/plugins/evil.js"]) {
    assert.throws(() => safeVaultWritePath(path), /禁止访问 Obsidian 配置目录/)
  }
})
