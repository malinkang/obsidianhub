import { readFileSync } from "node:fs"

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"))
const versions = JSON.parse(readFileSync(new URL("../versions.json", import.meta.url), "utf8"))
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
const tag = process.argv[2] || ""

if (manifest.version !== packageJson.version) throw new Error("manifest.json and package.json versions differ")
if (versions[manifest.version] !== manifest.minAppVersion) throw new Error("versions.json does not match manifest.json")
if (tag && tag !== manifest.version) throw new Error(`release tag ${tag} must exactly equal ${manifest.version}`)
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("plugin version must use semantic versioning")

console.log(`release metadata verified: ${manifest.version} (Obsidian ${manifest.minAppVersion}+)`)
