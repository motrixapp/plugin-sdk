// packages/plugin-cli/src/lint-rules/i18n-coverage.ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ManifestZodOutput } from '../manifest-schema'

export async function validateLocaleCoverage(
  projectDir: string,
  manifest: Pick<ManifestZodOutput, 'l10n' | 'name' | 'description'> &
    Partial<Pick<ManifestZodOutput, 'contributes'>>
): Promise<void> {
  if (!manifest.l10n) return
  const dir = path.join(projectDir, manifest.l10n)
  let enUS: Record<string, unknown>
  try {
    enUS = JSON.parse(await readFile(path.join(dir, 'en-US.json'), 'utf8'))
  } catch {
    throw new Error('plugin.manifest.locale.missing_en_us')
  }
  const keys = new Set<string>()
  function walk(o: Record<string, unknown>, prefix = ''): void {
    for (const [k, v] of Object.entries(o)) {
      const p = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'string') keys.add(p)
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>, p)
    }
  }
  walk(enUS)
  const collected: string[] = []
  const visit = (s: unknown) => {
    if (typeof s === 'string') {
      const m = s.match(/^%([^%]+)%$/)
      if (m) collected.push(m[1])
    }
  }
  visit(manifest.name)
  visit(manifest.description)
  for (const c of manifest.contributes?.commands ?? []) visit(c.title)
  const missing = collected.filter((k) => !keys.has(k))
  if (missing.length > 0) {
    throw new Error(
      `plugin.manifest.locale.missing_keys: ${missing.join(', ')}`
    )
  }
}
