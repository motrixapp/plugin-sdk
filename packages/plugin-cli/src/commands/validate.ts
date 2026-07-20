// packages/plugin-cli/src/commands/validate.ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { validateLocaleCoverage } from '../lint-rules/i18n-coverage'
import { isReservedPublisher, ManifestSchema } from '../manifest-schema'

export async function validate(
  projectDir: string
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = []
  try {
    const raw = await readFile(
      path.join(projectDir, 'motrix-plugin.json'),
      'utf8'
    )
    const m = ManifestSchema.parse(JSON.parse(raw))
    // The plugin CLI only services community authors; reserved publishers
    // (motrix.*, verified.*, official.*, system.*) are reserved for built-in
    // plugins shipped inside the app bundle.
    if (isReservedPublisher(m.id)) {
      throw new Error(`publisher name is reserved: "${m.id}"`)
    }
    await validateLocaleCoverage(projectDir, m)
  } catch (e) {
    errors.push((e as Error).message)
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
