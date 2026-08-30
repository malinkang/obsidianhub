# Sample Vault and visual previews

Run `npm run samples` to regenerate `fixtures.json`, the inspectable HTML previews, and a disposable Vault under the ignored `samples/generated-vault/` directory. The fixture contains at least one catalog and analytics payload for every one of the 22 service packs. If Playwright and a Chrome channel are available locally, `bash scripts/capture-samples.sh` regenerates the 22 service screenshots.

The preview is deliberately self-contained and has no account data or remote images:

- `dashboard-desktop.png`: 1440px desktop review surface.
- `dashboard-mobile.png`: 390px mobile review surface.
- `showcase.html`: inspectable source for the screenshots.
- `services/<service>.png`: one homepage-design snapshot for each service pack.

These screenshots are design evidence. Runtime behavior is separately exercised by the renderer, template-upgrade, 10,000-entry performance, and 22-service atomic-sync tests.
