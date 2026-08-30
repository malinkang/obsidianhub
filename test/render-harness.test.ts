import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"

import { renderView } from "../src/view-renderer"
import type { ServiceAnalytics, ServiceCatalog, ViewSpecV1, ViewType } from "../src/types"

const catalog: ServiceCatalog = {
  schemaVersion: 1, service: "weread", label: "微信读书", icon: "📚", color: "#2f7d32", primaryEntities: ["book"],
  entries: [{
    key: "weread:book:1", entityType: "book", entityId: "1", title: "<script>alert(1)</script> 中文长标题 📚".repeat(4),
    path: "services/weread/book/1.md", updatedAt: "2026-08-29",
    view: { schemaVersion: 1, dates: { occurredAt: "2026-08-29" }, dimensions: { category: "历史" }, measures: { durationMinutes: 30 }, media: { cover: ["javascript:alert(1)"] } },
  }],
}
const analytics: ServiceAnalytics = {
  schemaVersion: 1, service: "weread", series: [
    { key: "total:book", kind: "kpi", label: "书架", unit: "本", points: [{ key: "book", value: 1 }] },
    { key: "heatmap:occurredAt", kind: "heatmap", label: "阅读", unit: "分钟", points: [{ key: "2026-08-29", value: 30 }] },
    { key: "category:category", kind: "category", label: "分类", unit: "本", points: [{ key: "历史", value: 3 }, { key: "小说", value: 2 }] },
    { key: "monthly:durationMinutes", kind: "timeSeries", label: "阅读", unit: "分钟", points: [{ key: "2026-07", value: 20 }, { key: "2026-08", value: 30 }] },
  ],
}

for (const width of [1280, 390]) {
  test(`desktop/mobile-compatible DOM harness renders all native views at ${width}px`, () => {
    const window = new Window({ width, height: 844 })
    const document = window.document
    const types: ViewType[] = ["gallery", "kpi", "heatmap", "line", "bar", "stacked-bar", "area", "donut"]
    for (const type of types) {
      const container = document.createElement("section")
      document.body.append(container)
      const spec: ViewSpecV1 = { schemaVersion: 1, type, service: "weread", range: "all" }
      renderView(container as unknown as HTMLElement, spec, catalog, analytics, () => {})
      assert.ok(container.childElementCount > 0, type)
      assert.equal(container.querySelector("script"), null, `${type} script injection`)
      assert.doesNotMatch(container.innerHTML, /javascript:/, `${type} unsafe media`)
      if (["line", "bar", "stacked-bar", "area", "donut"].includes(type)) assert.ok(container.querySelector("svg"), `${type} SVG`)
      if (type === "gallery") assert.ok(container.querySelector("button"), "keyboard-operable Gallery card")
      if (type === "heatmap") assert.ok(container.querySelector('[aria-label^="2026-08-29"]'), "accessible heatmap tooltip")
    }
    window.close()
  })
}
