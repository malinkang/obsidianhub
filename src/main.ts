import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian"

import { NotionHubApi } from "./api"
import { identityFromFrontmatter } from "./markdown"
import { SyncEngine, type VaultAdapter, type VaultNote } from "./sync-engine"
import { DEFAULT_SETTINGS, type DeviceCredentials, type PluginSettings, type SyncProgress } from "./types"

export default class NotionHubPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS
  private abortController: AbortController | null = null
  private intervalId: number | null = null
  private status = this.addStatusBarItem()

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<PluginSettings> | null || {}) }
    this.addSettingTab(new NotionHubSettingTab(this.app, this))
    this.addRibbonIcon("refresh-cw", "同步 NotionHub", () => void this.sync())
    this.addCommand({ id: "sync-now", name: "立即同步", callback: () => void this.sync() })
    this.addCommand({ id: "cancel-sync", name: "取消当前同步", callback: () => this.cancelSync() })
    this.configureInterval()
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.syncOnStartup && this.settings.credentials) void this.sync()
    })
    this.updateStatus({ phase: "idle", completed: 0, total: 0, message: "NotionHub 就绪" })
  }

  onunload(): void {
    this.cancelSync()
    if (this.intervalId !== null) window.clearInterval(this.intervalId)
  }

  async saveSettings(patch: Partial<PluginSettings> = {}): Promise<void> {
    this.settings = { ...this.settings, ...patch }
    await this.saveData(this.settings)
    this.configureInterval()
  }

  api(): NotionHubApi {
    return new NotionHubApi(this.settings.integrationBaseUrl, this.settings.credentials, async (credentials) => {
      await this.saveSettings({ credentials })
    })
  }

  async sync(): Promise<void> {
    if (this.abortController) {
      new Notice("NotionHub 正在同步中。")
      return
    }
    if (!this.settings.credentials) {
      new Notice("请先在 NotionHub 设置中连接设备。")
      return
    }
    this.abortController = new AbortController()
    try {
      const engine = new SyncEngine(
        this.api(),
        new ObsidianVaultAdapter(this.app),
        this.settings,
        (patch) => this.saveSettings(patch),
        (progress) => this.updateStatus(progress),
      )
      const result = await engine.run(this.abortController.signal)
      new Notice(`NotionHub 同步完成：新增 ${result.created}，更新 ${result.updated}，归档 ${result.deleted}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      const message = error instanceof Error ? error.message : "未知错误"
      this.updateStatus({ phase: "error", completed: 0, total: 0, message })
      new Notice(`NotionHub 同步失败：${message}`, 10_000)
    } finally {
      this.abortController = null
    }
  }

  cancelSync(): void {
    this.abortController?.abort()
  }

  private updateStatus(progress: SyncProgress): void {
    const count = progress.total ? ` ${progress.completed}/${progress.total}` : ""
    this.status.setText(`NotionHub: ${progress.message}${count}`)
    this.status.setAttribute("aria-label", `NotionHub ${progress.phase}`)
  }

  private configureInterval(): void {
    if (this.intervalId !== null) window.clearInterval(this.intervalId)
    this.intervalId = null
    if (this.settings.intervalMinutes <= 0) return
    this.intervalId = window.setInterval(() => void this.sync(), Math.max(5, this.settings.intervalMinutes) * 60_000)
  }
}

class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private readonly app: App) {}

  async notes(): Promise<VaultNote[]> {
    return Promise.all(this.app.vault.getMarkdownFiles().map(async (file) => ({
      path: file.path,
      content: await this.app.vault.cachedRead(file),
      identity: identityFromFrontmatter(this.app.metadataCache.getFileCache(file)?.frontmatter),
    })))
  }

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path))
    return file instanceof TFile ? this.app.vault.cachedRead(file) : null
  }

  async writeAtomic(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path)
    await this.ensureFolders(normalized)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (file instanceof TFile) {
      await this.app.vault.process(file, () => content)
      return
    }
    const temporary = `${normalized}.notionhub-tmp`
    const stale = this.app.vault.getAbstractFileByPath(temporary)
    if (stale instanceof TFile) await this.app.vault.delete(stale)
    const created = await this.app.vault.create(temporary, content)
    await this.app.fileManager.renameFile(created, normalized)
  }

  async remove(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path))
    if (file instanceof TFile) await this.app.vault.delete(file)
  }

  async writeBinary(path: string, content: ArrayBuffer): Promise<void> {
    const normalized = normalizePath(path)
    await this.ensureFolders(normalized)
    const file = this.app.vault.getAbstractFileByPath(normalized)
    if (file instanceof TFile) await this.app.vault.modifyBinary(file, content)
    else await this.app.vault.createBinary(normalized, content)
  }

  private async ensureFolders(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1)
    let current = ""
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current)
    }
  }
}

class DeviceModal extends Modal {
  private active = false
  constructor(app: App, private readonly plugin: NotionHubPlugin) { super(app) }

  async onOpen(): Promise<void> {
    this.active = true
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl("h2", { text: "连接 NotionHub" })
    const device = await this.plugin.api().startDevice(`${this.app.vault.getName()} Vault`)
    contentEl.createEl("p", { text: `授权码：${device.userCode}` })
    const button = contentEl.createEl("button", { text: "打开授权页面" })
    button.onclick = () => window.open(`${device.verificationUri}?user_code=${encodeURIComponent(device.userCode)}`, "_blank")
    const status = contentEl.createEl("p", { text: "等待授权…" })
    const expiresAt = Date.parse(device.expiresAt)
    while (this.active && Date.now() < expiresAt) {
      await delay(Math.max(5, device.interval) * 1000)
      if (!this.active) return
      try {
        const result = await this.plugin.api().pollDevice(device.deviceCode)
        if (result.status === "authorized") {
          status.setText("连接成功")
          new Notice("NotionHub 已连接")
          this.close()
          return
        }
      } catch (error) {
        status.setText(error instanceof Error ? error.message : "授权失败")
      }
    }
    if (this.active) status.setText("授权码已过期，请关闭后重试。")
  }

  onClose(): void { this.active = false }
}

class NotionHubSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: NotionHubPlugin) { super(app, plugin) }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    new Setting(containerEl).setName("设备连接").setDesc(this.plugin.settings.credentials ? "已连接；仓库令牌仅在同步时短期获取。" : "使用浏览器确认设备授权。")
      .addButton((button) => button.setButtonText(this.plugin.settings.credentials ? "重新连接" : "连接").onClick(() => new DeviceModal(this.app, this.plugin).open()))
      .addButton((button) => button.setButtonText("断开").setDisabled(!this.plugin.settings.credentials).onClick(async () => { await this.plugin.api().revoke(); this.display() }))
    new Setting(containerEl).setName("Vault 根目录").setDesc("生成内容写入此目录。")
      .addText((text) => text.setValue(this.plugin.settings.vaultRoot).onChange(async (value) => this.plugin.saveSettings({ vaultRoot: value.trim() || "NotionHub" })))
    new Setting(containerEl).setName("启动时同步").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => this.plugin.saveSettings({ syncOnStartup: value })))
    new Setting(containerEl).setName("检查间隔（分钟）").setDesc("最短 5 分钟；0 表示关闭定时检查。")
      .addText((text) => text.setValue(String(this.plugin.settings.intervalMinutes)).onChange(async (value) => this.plugin.saveSettings({ intervalMinutes: Math.max(0, Number(value) || 0) })))
    new Setting(containerEl).setName("下载外部图片").setDesc("开启后把可访问的外部图片缓存到 Vault；下载失败时保留原始 URL。")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.downloadImages).onChange(async (value) => this.plugin.saveSettings({ downloadImages: value })))
    new Setting(containerEl).setName("服务目录映射").setDesc("JSON 对象，例如 {\"weread\":\"阅读\"}。")
      .addTextArea((text) => text.setValue(JSON.stringify(this.plugin.settings.serviceFolders, null, 2)).onChange(async (value) => {
        try { await this.plugin.saveSettings({ serviceFolders: JSON.parse(value || "{}") }) } catch { /* keep editing until valid */ }
      }))
    new Setting(containerEl).setName("手动同步").addButton((button) => button.setCta().setButtonText("立即同步").onClick(() => void this.plugin.sync()))
      .addButton((button) => button.setButtonText("取消").onClick(() => this.plugin.cancelSync()))
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
