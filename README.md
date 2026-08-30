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
