import assert from "node:assert/strict"
import test from "node:test"

import { archiveManagedMarkdown, identityFromFrontmatter, mergeManagedMarkdown, sha256Hex } from "../src/markdown"

const remote = `---
notionhub_service: weread
notionhub_entity_type: book
notionhub_entity_id: book-1
notionhub_title: New title
---
<!-- notionhub-managed-start -->
new managed body
<!-- notionhub-managed-end -->
`

test("reserved frontmatter and managed body update while handwritten content survives", () => {
  const local = `---
rating: 5
notionhub_service: weread
notionhub_entity_type: book
notionhub_entity_id: book-1
notionhub_title: Old title
---
My introduction

<!-- notionhub-managed-start -->
old managed body
<!-- notionhub-managed-end -->

My conclusion
`
  const merged = mergeManagedMarkdown(local, remote)
  assert.match(merged, /rating: 5/)
  assert.match(merged, /notionhub_title: New title/)
  assert.doesNotMatch(merged, /Old title|old managed body/)
  assert.match(merged, /My introduction[\s\S]*new managed body[\s\S]*My conclusion/)
  assert.deepEqual(identityFromFrontmatter({ notionhub_service: "weread", notionhub_entity_type: "book", notionhub_entity_id: "book-1" }), {
    service: "weread", entityType: "book", entityId: "book-1",
  })
})

test("tombstones delete purely managed notes and archive notes with user content", () => {
  assert.equal(archiveManagedMarkdown(remote).pureManaged, true)
  const withUserContent = remote.replace("<!-- notionhub-managed-end -->", "<!-- notionhub-managed-end -->\nhandwritten")
  const archived = archiveManagedMarkdown(withUserContent)
  assert.equal(archived.pureManaged, false)
  assert.match(archived.content, /handwritten/)
  assert.match(archived.content, /notionhub_archived: true/)
  assert.doesNotMatch(archived.content, /new managed body/)
})

test("hashes are deterministic", async () => {
  assert.equal(await sha256Hex(remote), await sha256Hex(remote))
  assert.notEqual(await sha256Hex(remote), await sha256Hex(`${remote}changed`))
})
