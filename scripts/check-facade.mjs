// scripts/check-facade.mjs
//
// Sanity check: packages/plugin-cli/src/manifest-schema.ts must remain a pure
// re-export of @motrix/plugin-manifest-schema. The schema itself lives in
// packages/plugin-manifest-schema/ — the single source of truth this repo
// publishes. motrix-turbo's scripts/check-schema-parity.mjs guards the host
// façade on its side of the split.
//
// If this check fails, do NOT copy schema code into the façade — change
// packages/plugin-manifest-schema/ instead.

import { readFile } from 'node:fs/promises'

const FACADE = 'packages/plugin-cli/src/manifest-schema.ts'
const REQUIRED_LINE = `export * from '@motrix/plugin-manifest-schema'`

const content = await readFile(FACADE, 'utf8')
let failed = false
if (!content.includes(REQUIRED_LINE)) {
  console.error(`drift: ${FACADE} is missing the required re-export.`)
  console.error(`       expected to find: ${REQUIRED_LINE}`)
  failed = true
} else {
  // Strip comments and the required line, then ensure nothing else of
  // substance remains (no top-level statements, no zod imports, etc.).
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(REQUIRED_LINE, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped !== '') {
    console.error(
      `drift: ${FACADE} contains unexpected content beyond the re-export.`
    )
    const display =
      stripped.length > 200 ? `${stripped.slice(0, 200)}...` : stripped
    console.error(`       residue: ${display}`)
    failed = true
  }
}

if (failed) {
  console.error('')
  console.error(
    'Manifest schema must live in @motrix/plugin-manifest-schema only.'
  )
  process.exit(1)
}
console.log('CLI schema façade sanity OK')
