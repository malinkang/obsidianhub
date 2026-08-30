# Security Policy

## Supported versions

Security fixes are provided for the latest published ObsidianHub version. Users should update through Obsidian Community plugins or the latest GitHub Release.

## Reporting a vulnerability

After this repository is public, report vulnerabilities privately through **Security → Report a vulnerability** in the GitHub repository. Do not publish credentials, private repository names, synchronized records, or exploit details in a public issue.

Include the affected version, platform, reproduction steps, impact, and a minimal redacted proof of concept. Receipt should be acknowledged within seven days. A fix and disclosure timeline will be coordinated according to severity.

## Credential model

- The long-lived refresh credential is stored through Obsidian SecretStorage.
- Access credentials stay in memory and are refreshed when needed.
- GitHub credentials remain inside NotionHub's server-side trust boundary and are never returned to the plugin.
- Vault reads use the revocable NotionHub device session and are constrained by the versioned manifest.
- Disconnecting revokes the device session and clears the local refresh credential.

No credential, Vault export, private manifest, or real user fixture belongs in this repository. Test credentials must remain obviously synthetic.
