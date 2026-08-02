// packages/plugin-cli/src/lint-rules/i18n-coverage.ts
//
// Thin I/O wrapper. The coverage rule itself lives in
// @motrix/plugin-manifest-schema so the builtin-plugins release pipeline runs
// the exact same check — see that package's validate.ts header for why. Keep
// this file limited to filesystem access.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { checkLocaleCoverage, type ManifestZodOutput } from '../manifest-schema'

export async function validateLocaleCoverage(
  projectDir: string,
  manifest: Pick<ManifestZodOutput, 'l10n' | 'name' | 'description'> &
    Partial<Pick<ManifestZodOutput, 'contributes'>>
): Promise<void> {
  if (!manifest.l10n) return
  // An unreadable or malformed base locale is reported as "absent": from the
  // author's side both mean there is no usable en-US.json to translate against.
  let baseLocale: Record<string, unknown> | null = null
  try {
    baseLocale = JSON.parse(
      await readFile(path.join(projectDir, manifest.l10n, 'en-US.json'), 'utf8')
    )
  } catch {
    baseLocale = null
  }
  checkLocaleCoverage(manifest, baseLocale)
}
