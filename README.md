# ObsidianHub

ObsidianHub is the pull-only Obsidian client for NotionHub. It connects through the NotionHub device flow, receives short-lived read-only GitHub credentials, and incrementally imports a private generated Markdown repository.

The plugin supports desktop and mobile (`isDesktopOnly=false`) and uses only Obsidian Vault APIs and `fetch`. It never requires Git, Node.js, Electron, or a shell on the device, and it never uploads handwritten Vault content.

Local development:

```bash
npm install
npm test
npm run typecheck
npm run build
```

For a local manual install, copy `manifest.json`, the generated `main.js`, and `styles.css` into `<Vault>/.obsidian/plugins/notionhub/`, reload Obsidian, then enable NotionHub under Community plugins. This repository is still local-development only; no public release is produced by the current plan.

## Native service templates

The plugin ships one curated dashboard and entity-detail layout for every NotionHub Runner service. The 22 packs are installed or safely upgraded under `NotionHub/services/<service>/` during sync. Official managed regions are replaced on upgrade; custom frontmatter and handwritten content outside those regions remain untouched. A malformed or removed managed anchor creates a conflict copy instead of overwriting the note.

Supported native views are Gallery, KPI, calendar heatmap, line, bar, stacked bar, area, and donut. They are rendered by the plugin from versioned catalog and analytics JSON; no Dataview, Tracker, Charts, Heatmap Calendar, Templater, or other community plugin is required. The Markdown headings, links, callouts, and entity bodies remain readable when ObsidianHub is disabled.

Per-service range, sort, grouping, accent color, and hidden-view settings are available in the plugin settings. The renderer uses only Obsidian APIs, DOM/SVG primitives, and `fetch`, so the same bundle supports desktop and mobile.

If an official homepage was moved or renamed, upgrades follow its template ID. If managed anchors were damaged, the original is left untouched and a `notionhub-conflict-v<version>.md` copy is created. Use “恢复官方服务模板” after reviewing the conflict. Entity notes follow the same managed-region rule: custom properties and text outside the region survive updates and deletions.

Reference material:

- [Notion template audit](docs/notion-template-audit.md)
- [Sample Vault and screenshots](samples/README.md)
