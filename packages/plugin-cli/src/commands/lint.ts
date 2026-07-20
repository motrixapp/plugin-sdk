// packages/plugin-cli/src/commands/lint.ts
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { findToplevelEffectful } from '../lint-rules/effectful-toplevel'
import { ManifestSchema } from '../manifest-schema'

export async function lint(
  projectDir: string
): Promise<{ warnings: string[]; errors: string[] }> {
  const warnings: string[] = []
  const errors: string[] = []
  const manifest = ManifestSchema.parse(
    JSON.parse(
      await readFile(path.join(projectDir, 'motrix-plugin.json'), 'utf8')
    )
  )
  const invokesCommands = manifest.invokesCommands ?? []
  const pushInvokesWarning = () => {
    if (invokesCommands.length > 0) {
      warnings.push(
        `invokesCommands declared (${invokesCommands.length}) — callees may not be installed on user system`
      )
    }
  }

  const bundle = path.join(projectDir, manifest.main)
  let bundleStats: Awaited<ReturnType<typeof stat>>
  try {
    bundleStats = await stat(bundle)
  } catch {
    errors.push('bundle not found — run `motrix-plugin pack` first')
    pushInvokesWarning()
    return { warnings, errors }
  }

  if (bundleStats.size > 800 * 1024) {
    warnings.push(`bundle size ${bundleStats.size} bytes nearing 1MB cap`)
  }

  const src = await readFile(bundle, 'utf8')
  const found = findToplevelEffectful(src)
  for (const f of found) errors.push(`top-level effectful call: ${f}`)

  pushInvokesWarning()
  return { warnings, errors }
}
