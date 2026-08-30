import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { mergeTemplate, TemplateManager } from "../src/template-manager"
import { renderDashboard, TEMPLATE_PACKS, validateTemplateRegistry } from "../src/templates"
import { DEFAULT_SETTINGS } from "../src/types"

class Vault {
  files = new Map<string, string>()
  read(path: string) { return Promise.resolve(this.files.get(path) ?? null) }
  writeAtomic(path: string, content: string) { this.files.set(path, content); return Promise.resolve() }
  notes() { return Promise.resolve([...this.files].map(([path, content]) => ({ path, content }))) }
}

test("template registry atomically covers 22 services and all native view types", () => {
  assert.equal(Object.keys(TEMPLATE_PACKS).length, 22)
  assert.deepEqual(validateTemplateRegistry(), [])
  const types = new Set(Object.values(TEMPLATE_PACKS).flatMap((pack) => pack.views.map((view) => view.type)))
  assert.deepEqual([...types].sort(), ["area", "bar", "donut", "gallery", "heatmap", "kpi", "line", "stacked-bar"].sort())
})

test("tracked sample fixtures cover every service and every explicitly requested series", () => {
  const fixtures = JSON.parse(readFileSync(new URL("../samples/fixtures.json", import.meta.url), "utf8")) as Record<string, { analytics: { series: Array<{ key: string }> } }>
  assert.deepEqual(Object.keys(fixtures).sort(), Object.keys(TEMPLATE_PACKS).sort())
  for (const [service, pack] of Object.entries(TEMPLATE_PACKS)) {
    const keys = new Set(fixtures[service]!.analytics.series.map((series) => series.key))
    for (const view of pack.views) {
      for (const key of [...(view.seriesKeys || []), ...(view.seriesKey ? [view.seriesKey] : [])]) assert.ok(keys.has(key), `${service}: ${key}`)
    }
  }
})

test("dashboard has managed metadata, native views and markdown fallback", () => {
  const content = renderDashboard(TEMPLATE_PACKS.weread!)
  assert.match(content, /notionhub_template_id: "notionhub\.weread\.dashboard"/)
  assert.match(content, /```notionhub-view/)
  assert.match(content, /\[\[_index\|打开完整索引\]\]/)
})

test("template upgrades preserve custom frontmatter and handwritten regions", () => {
  const first = renderDashboard(TEMPLATE_PACKS.weread!)
  const customized = first.replace("---\n\n<!--", "favorite: true\n---\n\n我的手写说明\n\n<!--")
  const next = renderDashboard(TEMPLATE_PACKS.weread!, { color: "#123456", range: "90d" })
  const merged = mergeTemplate(customized, next)
  assert.equal(merged.status, "merged")
  assert.match(merged.content, /favorite: true/)
  assert.match(merged.content, /我的手写说明/)
  assert.match(merged.content, /#123456/)
  assert.match(merged.content, /"90d"/)
})

test("malformed anchors create a conflict copy without overwriting source", async () => {
  const vault = new Vault()
  const path = "NotionHub/services/weread/首页.md"
  vault.files.set(path, "---\ncustom: yes\n---\nhandwritten")
  const result = await new TemplateManager(vault, { ...DEFAULT_SETTINGS }).ensure(["weread"])
  assert.deepEqual(result.conflicts, ["NotionHub/services/weread/首页.notionhub-conflict-v1.md"])
  assert.equal(vault.files.get(path), "---\ncustom: yes\n---\nhandwritten")
  assert.match(vault.files.get(result.conflicts[0]!) || "", /notionhub-template-managed-start/)
})

test("automatic installation writes all requested service templates deterministically", async () => {
  const vault = new Vault()
  const manager = new TemplateManager(vault, { ...DEFAULT_SETTINGS })
  const first = await manager.ensure(Object.keys(TEMPLATE_PACKS))
  const second = await manager.ensure(Object.keys(TEMPLATE_PACKS))
  assert.equal(first.created, 22)
  assert.equal(second.skipped, 22)
  assert.equal(vault.files.size, 22)
})

test("template upgrades follow a user-moved dashboard instead of recreating the old path", async () => {
  const vault = new Vault()
  const manager = new TemplateManager(vault, { ...DEFAULT_SETTINGS })
  await manager.ensure(["weread"])
  const original = vault.files.get("NotionHub/services/weread/首页.md")!
  vault.files.delete("NotionHub/services/weread/首页.md")
  vault.files.set("我的阅读/仪表盘.md", `${original}\n我的说明\n`)
  const result = await manager.ensure(["weread"])
  assert.equal(result.skipped, 1)
  assert.equal(vault.files.has("NotionHub/services/weread/首页.md"), false)
  assert.match(vault.files.get("我的阅读/仪表盘.md") || "", /我的说明/)
})
