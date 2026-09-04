# ObsidianHub

ObsidianHub is the pull-only Obsidian client for NotionHub. It connects through the NotionHub device flow and incrementally imports generated Markdown through the NotionHub read proxy. GitHub credentials stay inside the hosted NotionHub service and are never delivered to the plugin.

The plugin supports desktop and mobile (`isDesktopOnly=false`) and uses only Obsidian Vault APIs and `fetch`. It never requires Git, Node.js, Electron, or a shell on the device, and it never uploads handwritten Vault content.

## Requirements and data access

- Obsidian 1.11.4 or newer. This version is required for Obsidian SecretStorage.
- A NotionHub account with a generated private sync repository.
- Network access to `i.notionhub.app` and any public HTTPS image hosts referenced by synchronized records.

The refresh credential is stored through Obsidian SecretStorage, never in the plugin `data.json`. The plugin sends only its NotionHub device access credential to `i.notionhub.app`; it does not receive or store a GitHub credential. ObsidianHub has no analytics, advertising SDK, or telemetry. See [Privacy](PRIVACY.md) and [Security](SECURITY.md) before connecting an account.

## Use

1. Enable NotionHub in Obsidian Community plugins.
2. Open **Settings → NotionHub**, select **Connect**, and approve the one-time code in the browser.
3. Run **NotionHub: Sync now** or leave startup and interval sync enabled.
4. Use **Disconnect** to revoke the device session and clear the locally stored refresh credential.

Synchronized notes are written under `NotionHub/` by default. The plugin replaces only marked managed regions; custom frontmatter and handwritten content outside those regions remain local.

### WeRead workspace

Use **NotionHub: 打开微信读书书架** or the library ribbon icon to open the native WeRead workspace. It provides searchable book cards, category/status/year grouping, progress sorting, and safe links to the synchronized local notes. **NotionHub: 打开微信读书阅读统计** opens KPI, heatmap, monthly trend, and category views backed by the synchronized catalog and analytics files. These views never request or store a WeRead Cookie or API key in Obsidian.

Local development:

```bash
npm install
npm test
npm run typecheck
npm run build
```

For a local manual install, copy `manifest.json`, the generated `main.js`, and `styles.css` into `<Vault>/.obsidian/plugins/notionhub/`, reload Obsidian, then enable NotionHub under Community plugins.

## Native service templates

The plugin ships one curated dashboard and entity-detail layout for each of 23 active NotionHub Runner services. The packs are installed or safely upgraded under `NotionHub/services/<service>/` during sync. Official managed regions are replaced on upgrade; custom frontmatter and handwritten content outside those regions remain untouched. A malformed or removed managed anchor creates a conflict copy instead of overwriting the note.

Supported service IDs are `applemusic`, `applepodcast`, `bbdc`, `bilibili`, `daily`, `dida`, `douban`, `douyin`, `duolingo`, `flomo`, `forest`, `github`, `guwendao`, `jike`, `keep`, `neteasemusic`, `podcast`, `spotify`, `toggl`, `trakt`, `weibo`, `weread`, and `youtube`.

Supported native views are Gallery, KPI, calendar heatmap, line, bar, stacked bar, area, and donut. They are rendered by the plugin from versioned catalog and analytics JSON; no Dataview, Tracker, Charts, Heatmap Calendar, Templater, or other community plugin is required. The Markdown headings, links, callouts, and entity bodies remain readable when ObsidianHub is disabled.

Per-service range, sort, grouping, accent color, and hidden-view settings are available in the plugin settings. The renderer uses only Obsidian APIs, DOM/SVG primitives, and `fetch`, so the same bundle supports desktop and mobile.

If an official homepage was moved or renamed, upgrades follow its template ID. If managed anchors were damaged, the original is left untouched and a `notionhub-conflict-v<version>.md` copy is created. Use “恢复官方服务模板” after reviewing the conflict. Entity notes follow the same managed-region rule: custom properties and text outside the region survive updates and deletions.

Reference material:

- [Notion template audit](docs/notion-template-audit.md)
- [Sample Vault and screenshots](samples/README.md)

## Release process

Tags must exactly equal the version in `manifest.json`, without a `v` prefix. Pushing a semantic-version tag runs the release workflow, verifies version alignment, runs all tests, builds `main.js`, and publishes `main.js`, `manifest.json`, and `styles.css` as GitHub Release assets.

## Legal

ObsidianHub is licensed under the [MIT License](LICENSE). Third-party service names are used only to describe compatibility. ObsidianHub is not affiliated with or endorsed by Obsidian, Notion, Apple, Spotify, Google, ByteDance, Douban, Keep, or the other supported services; see [Third-party notices](NOTICE.md).
