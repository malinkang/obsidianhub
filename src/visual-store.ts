import type { PluginSettings, ServiceAnalytics, ServiceCatalog } from "./types"

export type VisualVault = { read(path: string): Promise<string | null> }

export class VisualDataStore {
  private catalogs = new Map<string, Promise<ServiceCatalog | null>>()
  private analytics = new Map<string, Promise<ServiceAnalytics | null>>()

  constructor(private readonly vault: VisualVault, private readonly settings: PluginSettings) {}

  catalog(service: string): Promise<ServiceCatalog | null> {
    const existing = this.catalogs.get(service)
    if (existing) return existing
    const value = this.load<ServiceCatalog>(`.notionhub/catalog/${service}.json`, service)
    this.catalogs.set(service, value)
    return value
  }

  analysis(service: string): Promise<ServiceAnalytics | null> {
    const existing = this.analytics.get(service)
    if (existing) return existing
    const value = this.load<ServiceAnalytics>(`.notionhub/analytics/${service}.json`, service)
    this.analytics.set(service, value)
    return value
  }

  clear(): void {
    this.catalogs.clear()
    this.analytics.clear()
  }

  private async load<T extends { schemaVersion: number; service: string }>(relative: string, service: string): Promise<T | null> {
    const path = `${this.settings.vaultRoot}/${relative}`.replace(/\/+/g, "/")
    const raw = await this.vault.read(path)
    if (raw === null) return null
    const value = JSON.parse(raw) as T
    if (value.schemaVersion !== 1 || value.service !== service) throw new Error(`可视化数据不兼容：${service}`)
    return value
  }
}
