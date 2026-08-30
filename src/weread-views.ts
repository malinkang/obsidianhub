import { ItemView, WorkspaceLeaf } from "obsidian"

import { renderWereadBookshelf, renderWereadStats, type WereadViewActions } from "./weread-renderer"
import type { ServiceAnalytics, ServiceCatalog } from "./types"

export const WEREAD_BOOKSHELF_VIEW = "notionhub-weread-bookshelf"
export const WEREAD_STATS_VIEW = "notionhub-weread-stats"

export type WereadDataProvider = () => Promise<[ServiceCatalog | null, ServiceAnalytics | null]>

export class WereadBookshelfView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly data: WereadDataProvider,
    private readonly actions: WereadViewActions,
  ) { super(leaf) }

  getViewType(): string { return WEREAD_BOOKSHELF_VIEW }
  getDisplayText(): string { return "微信读书书架" }
  getIcon(): string { return "library" }
  async onOpen(): Promise<void> { await this.refresh() }

  async refresh(): Promise<void> {
    renderLoading(this.contentEl, "正在整理书架…")
    try {
      const [catalog] = await this.data()
      renderWereadBookshelf(this.contentEl, catalog, this.actions)
    } catch (error) {
      renderError(this.contentEl, error)
    }
  }
}

export class WereadStatsView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly data: WereadDataProvider,
    private readonly actions: WereadViewActions,
  ) { super(leaf) }

  getViewType(): string { return WEREAD_STATS_VIEW }
  getDisplayText(): string { return "微信读书统计" }
  getIcon(): string { return "bar-chart-3" }
  async onOpen(): Promise<void> { await this.refresh() }

  async refresh(): Promise<void> {
    renderLoading(this.contentEl, "正在计算阅读轨迹…")
    try {
      const [catalog, analytics] = await this.data()
      renderWereadStats(this.contentEl, catalog, analytics, this.actions)
    } catch (error) {
      renderError(this.contentEl, error)
    }
  }
}

function renderLoading(container: HTMLElement, message: string): void {
  container.replaceChildren()
  const loading = container.ownerDocument.createElement("p")
  loading.className = "notionhub-empty"
  loading.textContent = message
  container.append(loading)
}

function renderError(container: HTMLElement, error: unknown): void {
  renderLoading(container, error instanceof Error ? error.message : "微信读书视图加载失败")
}
