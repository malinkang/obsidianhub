import assert from "node:assert/strict"
import test from "node:test"

import { filterCatalog, heatmapStreak, parseViewSpec, resolveSeries } from "../src/view-renderer"
import type { ServiceAnalytics, ServiceCatalog } from "../src/types"

test("ViewSpecV1 accepts every native view and rejects code injection fields", () => {
  for (const type of ["gallery", "heatmap", "kpi", "line", "bar", "stacked-bar", "area", "donut"] as const) {
    assert.equal(parseViewSpec(JSON.stringify({ schemaVersion: 1, type, service: "weread" })).type, type)
  }
  assert.throws(() => parseViewSpec(JSON.stringify({ schemaVersion: 1, type: "html", service: "weread" })), /不支持/)
  assert.throws(() => parseViewSpec(JSON.stringify({ schemaVersion: 1, type: "gallery", service: "weread", color: "url(javascript:1)" })), /颜色/)
  assert.throws(() => parseViewSpec(JSON.stringify({ schemaVersion: 1, type: "gallery", service: "weread", limit: 1000 })), /1–200/)
})

test("series resolution uses explicit keys and safe defaults", () => {
  const analytics: ServiceAnalytics = {
    schemaVersion: 1, service: "weread", series: [
      { key: "total:book", kind: "kpi", label: "book", unit: "条", points: [{ key: "book", value: 2 }] },
      { key: "heatmap:occurredAt", kind: "heatmap", label: "occurredAt", unit: "分钟", points: [{ key: "2026-08-29", value: 30 }] },
      { key: "monthly:durationMinutes", kind: "timeSeries", label: "durationMinutes", unit: "分钟", points: [{ key: "2026-08", value: 30 }] },
    ],
  }
  assert.equal(resolveSeries(analytics, parseViewSpec('{"schemaVersion":1,"type":"line","service":"weread"}'))[0]!.key, "monthly:durationMinutes")
  assert.equal(resolveSeries(analytics, parseViewSpec('{"schemaVersion":1,"type":"heatmap","service":"weread","seriesKey":"heatmap:occurredAt"}'))[0]!.points[0]!.value, 30)
})

test("gallery filtering applies entity, range, order and limit", () => {
  const catalog: ServiceCatalog = {
    schemaVersion: 1, service: "weread", label: "微信读书", icon: "📚", color: "#2f7d32", primaryEntities: ["book"], entries: [
      entry("old", "2020-01-01"), entry("new", "2026-08-29"), entry("chapter", "2026-08-30", "chapter"),
    ],
  }
  const spec = parseViewSpec('{"schemaVersion":1,"type":"gallery","service":"weread","entityType":"book","range":"365d","limit":1}')
  const values = filterCatalog(catalog, spec, new Date("2026-08-30T00:00:00Z"))
  assert.deepEqual(values.map((value) => value.entityId), ["new"])
})

test("10,000-entry cached catalog filtering stays below one second", () => {
  const catalog: ServiceCatalog = {
    schemaVersion: 1, service: "weread", label: "微信读书", icon: "📚", color: "#2f7d32", primaryEntities: ["book"],
    entries: Array.from({ length: 10_000 }, (_, index) => entry(String(index), "2026-08-29")),
  }
  const spec = parseViewSpec('{"schemaVersion":1,"type":"gallery","service":"weread","entityType":"book","range":"365d","limit":60}')
  const started = performance.now()
  const values = filterCatalog(catalog, spec, new Date("2026-08-30T00:00:00Z"))
  const elapsed = performance.now() - started
  assert.equal(values.length, 60)
  assert.ok(elapsed < 1_000, `filter took ${elapsed}ms`)
})

test("heatmap streak reports current and longest runs", () => {
  const points = ["2026-08-24", "2026-08-25", "2026-08-27", "2026-08-28", "2026-08-29"].map((key) => ({ key, value: 1 }))
  assert.deepEqual(heatmapStreak(points, new Date("2026-08-29T12:00:00Z")), { current: 3, longest: 3 })
})

function entry(id: string, date: string, entityType = "book") {
  return {
    key: `weread:${entityType}:${id}`, entityType, entityId: id, title: id,
    path: `services/weread/${entityType}/${id}.md`, updatedAt: date,
    view: { schemaVersion: 1, dates: { occurredAt: date }, dimensions: {}, measures: {}, media: {} },
  }
}
