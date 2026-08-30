import assert from "node:assert/strict"
import test from "node:test"

import { materializeDetailLayout } from "../src/detail-template"
import { mergeManagedMarkdown } from "../src/markdown"
import { TEMPLATE_PACKS } from "../src/templates"

const remote = `---
"notionhub_service": "keep"
"notionhub_entity_type": "workout"
"notionhub_view": {"schemaVersion":1,"dates":{"occurredAt":"2026-08-29"},"dimensions":{"type":"跑步"},"measures":{"durationMinutes":42},"media":{"gallery":["https://img.example/a.jpg","javascript:alert(1)"]}}
---

<!-- notionhub-managed-start -->
# 晨跑
<!-- notionhub-managed-end -->
`

test("detail layout materializes service summary and safe media in the managed region", () => {
  const result = materializeDetailLayout(remote, TEMPLATE_PACKS.keep, "workout")
  assert.match(result, /Keep · workout/)
  assert.match(result, /\*\*日期\*\*：2026-08-29/)
  assert.match(result, /\*\*时长（分钟）\*\*：42/)
  assert.match(result, /https:\/\/img\.example\/a\.jpg/)
  assert.doesNotMatch(result, /!\[[^\]]+\]\(javascript:/)
})

test("detail layout is limited to declared service entities", () => {
  assert.equal(materializeDetailLayout(remote, TEMPLATE_PACKS.keep, "unknown"), remote)
})

test("quoted managed frontmatter replaces cleanly while preserving user fields", () => {
  const local = remote.replace('"notionhub_service": "keep"', 'favorite: true\n"notionhub_service": "old"').replace("# 晨跑", "# 旧正文")
  const merged = mergeManagedMarkdown(local, remote)
  assert.match(merged, /favorite: true/)
  assert.match(merged, /"notionhub_service": "keep"/)
  assert.doesNotMatch(merged, /"notionhub_service": "old"/)
})
