import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"

import { renderWereadBookshelf, renderWereadStats } from "../src/weread-renderer"
import type { ServiceAnalytics, ServiceCatalog } from "../src/types"

const catalog: ServiceCatalog = {
  schemaVersion: 1,
  service: "weread",
  label: "微信读书",
  icon: "📚",
  color: "#2f7d32",
  primaryEntities: ["bookshelf", "book"],
  generatedAt: "2026-08-30T12:00:00Z",
  entries: [
    entry("1", "长安的荔枝", "马伯庸", "文学", "在读", 68, "2026-08-30"),
    entry("2", "置身事内", "兰小欢", "经济", "读完", 100, "2026-07-12"),
    entry("3", "无效章节", "作者", "文学", "", 0, "2026-06-01", "chapter"),
  ],
}

const analytics: ServiceAnalytics = {
  schemaVersion: 1,
  service: "weread",
  generatedAt: "2026-08-30T12:00:00Z",
  series: [
    { key: "total:book", kind: "kpi", label: "书架", unit: "本", points: [{ key: "book", value: 2 }] },
    { key: "heatmap:occurredAt", kind: "heatmap", label: "阅读", unit: "分钟", points: [{ key: "2026-08-30", value: 45 }] },
    { key: "monthly:durationMinutes", kind: "timeSeries", label: "阅读", unit: "分钟", points: [{ key: "2026-07", value: 80 }, { key: "2026-08", value: 120 }] },
    { key: "category:category", kind: "category", label: "分类", unit: "本", points: [{ key: "文学", value: 1 }, { key: "经济", value: 1 }] },
  ],
}

for (const width of [1280, 390]) {
  test(`微信读书书架在 ${width}px 支持筛选、分组和安全打开本地条目`, () => {
    const window = new Window({ width, height: 844 })
    const container = window.document.createElement("main")
    const opened: string[] = []
    renderWereadBookshelf(container as unknown as HTMLElement, catalog, { openEntry: (path) => opened.push(path) })
    assert.equal(container.querySelectorAll(".notionhub-weread-book").length, 2)
    assert.match(container.textContent || "", /长安的荔枝/)
    assert.equal(container.querySelector("img"), null, "unsafe image URL is not rendered")
    const changanCard = [...container.querySelectorAll(".notionhub-weread-book")].find((card) => card.textContent?.includes("长安的荔枝"))
    assert.equal(changanCard?.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"), "68")

    const search = container.querySelector('input[type="search"]') as unknown as HTMLInputElement
    search.value = "兰小欢"
    search.dispatchEvent(new window.Event("input") as unknown as Event)
    assert.equal(container.querySelectorAll(".notionhub-weread-book").length, 1)
    assert.match(container.textContent || "", /置身事内/)
    ;(container.querySelector(".notionhub-weread-book") as unknown as HTMLButtonElement).click()
    assert.deepEqual(opened, ["services/weread/bookshelf/2.md"])
    window.close()
  })
}

test("微信读书统计组合现有 KPI、热力图、趋势和分类视图", () => {
  const window = new Window({ width: 1280, height: 900 })
  const container = window.document.createElement("main")
  renderWereadStats(container as unknown as HTMLElement, catalog, analytics, { openEntry: () => {} })
  assert.equal(container.querySelectorAll(".notionhub-weread-stat-section").length, 4)
  assert.ok(container.querySelector(".notionhub-kpi-card"))
  assert.ok(container.querySelector('[aria-label^="2026-08-30"]'))
  assert.equal(container.querySelectorAll("svg").length, 2)
  assert.equal(container.querySelector("script"), null)
  window.close()
})

test("微信读书视图在缺少同步数据时显示可恢复空态", () => {
  const window = new Window()
  const container = window.document.createElement("main")
  renderWereadBookshelf(container as unknown as HTMLElement, null, { openEntry: () => {} })
  assert.match(container.textContent || "", /完成一次微信读书同步/)
  assert.ok(container.querySelector(".notionhub-empty"))
  window.close()
})

function entry(
  id: string,
  title: string,
  author: string,
  category: string,
  status: string,
  progress: number,
  date: string,
  entityType = "bookshelf",
) {
  return {
    key: `weread:${entityType}:${id}`,
    entityType,
    entityId: id,
    title,
    path: `services/weread/${entityType}/${id}.md`,
    updatedAt: date,
    view: {
      schemaVersion: 1 as const,
      dates: { occurredAt: date },
      dimensions: { author, category, status },
      measures: { progress },
      media: { cover: ["javascript:alert(1)"] },
    },
  }
}
