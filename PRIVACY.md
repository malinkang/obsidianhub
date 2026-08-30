# ObsidianHub Privacy Notice

Last updated: 2026-08-30

This notice describes data processing performed by the open-source ObsidianHub plugin. Use of the hosted NotionHub service is also subject to the privacy terms published on the NotionHub website.

## Data stored on the device

- The NotionHub refresh credential is stored using Obsidian SecretStorage. It is not written to the plugin `data.json` file.
- Non-secret connection expiry metadata, sync preferences, the last repository commit, ETag, and manifest are stored in the plugin settings.
- Synchronized Markdown, visual catalogs, analytics, templates, and optionally cached images are stored in the selected Vault folder.

Vault content may be included in any third-party sync or backup product configured by the user. ObsidianHub does not control those products.

## Network requests

ObsidianHub makes the following requests only to provide features requested by the user:

1. `i.notionhub.app` for device authorization, credential refresh, revocation, and issuance of a short-lived repository credential.
2. `api.github.com` to read the commit, manifest, Markdown, catalog, and analytics files from the private generated repository returned by NotionHub.
3. Public HTTPS image hosts referenced by synchronized records when a Gallery is rendered. If image caching is enabled, the plugin downloads supported raster images to the Vault. Private-network, insecure HTTP, credential-bearing, SVG, and oversized image URLs are rejected.

The plugin does not contain analytics, advertising, fingerprinting, crash reporting, or telemetry SDKs. It does not sell personal information.

## Data not uploaded

ObsidianHub does not upload handwritten notes, custom frontmatter, arbitrary Vault files, or cached images to NotionHub or GitHub. It reads Vault Markdown locally only to identify managed NotionHub records and preserve user-owned regions during updates.

## Retention and deletion

Selecting **Disconnect** asks NotionHub to revoke the current device session and clears the refresh credential from Obsidian SecretStorage. Removing the plugin deletes its settings when Obsidian removes the plugin directory; synchronized notes remain in the Vault until the user deletes them.

For hosted-account access, correction, export, or deletion requests, use the support channel published at <https://www.notionhub.app>.

## Changes

Material changes to network destinations or data handling will be documented in this file and in the relevant release notes.
