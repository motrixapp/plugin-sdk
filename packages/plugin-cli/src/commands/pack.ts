// packages/plugin-cli/src/commands/pack.ts

import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
// yazl ships no TypeScript declarations; we import as unknown and cast below.
// @ts-expect-error — no @types/yazl available
import yazl from 'yazl'
import { validateLocaleCoverage } from '../lint-rules/i18n-coverage'
import { validateManifest } from '../manifest-schema'

export interface PackOptions {
  projectDir: string
  outDir?: string
  entry?: string
  manifest?: string
}

const BUNDLE_MAX = 1024 * 1024
const TOTAL_MAX = 5 * 1024 * 1024

interface YazlZipFile {
  addFile(realPath: string, metadataPath: string): void
  end(): void
  on(event: 'error', handler: (err: Error) => void): void
  outputStream: NodeJS.ReadableStream
}

export async function pack(
  opts: PackOptions
): Promise<{ outFile: string; bundleSize: number; totalSize: number }> {
  const projectDir = path.resolve(opts.projectDir)
  const manifestPath = path.join(
    projectDir,
    opts.manifest ?? 'motrix-plugin.json'
  )
  // Every manifest/asset gate runs BEFORE esbuild writes anything, so a
  // rejected plugin leaves no half-built bundle behind — and, more importantly,
  // so `pack` can never emit a .moext the host refuses to install.
  // validateManifest adds the cross-field hooks => hostPermissions invariant on
  // top of the schema parse; that rule used to live only in the separate
  // `validate-host-permissions` subcommand, which meant a plain `pack` shipped
  // exactly the manifest that made motrix.filename-template@1.1.0
  // uninstallable.
  const manifest = validateManifest(
    JSON.parse(await readFile(manifestPath, 'utf8'))
  )
  await validateLocaleCoverage(projectDir, manifest)

  const entry = opts.entry ?? 'src/index.ts'
  const outDir = path.join(projectDir, opts.outDir ?? 'dist')
  await mkdir(outDir, { recursive: true })
  const bundlePath = path.join(outDir, 'plugin.js')
  await build({
    entryPoints: [path.join(projectDir, entry)],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    platform: 'neutral',
    outfile: bundlePath,
    minify: true,
    sourcemap: false,
    external: ['motrix:plugin-api'],
    treeShaking: true,
  })
  const bundle = await readFile(bundlePath)
  if (bundle.byteLength > BUNDLE_MAX) {
    await unlink(bundlePath)
    throw new Error(
      `bundle ${bundle.byteLength} bytes > ${BUNDLE_MAX} byte cap`
    )
  }

  // build .moext
  const moextOut = path.join(outDir, `${manifest.id}-${manifest.version}.moext`)
  // yazl.ZipFile has no TS types — cast via unknown
  const z: YazlZipFile = new (
    yazl as { ZipFile: new () => YazlZipFile }
  ).ZipFile()
  z.addFile(manifestPath, 'motrix-plugin.json')
  z.addFile(bundlePath, 'dist/plugin.js')
  // include optional top-level assets when present
  for (const f of ['icon.png', 'LICENSE', 'CHANGELOG.md']) {
    try {
      await stat(path.join(projectDir, f))
      z.addFile(path.join(projectDir, f), f)
    } catch {}
  }
  // locale files
  if (manifest.l10n) {
    try {
      const localeDir = path.join(projectDir, manifest.l10n)
      const entries = await readdir(localeDir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isFile()) continue
        z.addFile(path.join(localeDir, e.name), `${manifest.l10n}/${e.name}`)
      }
    } catch {
      // ENOENT or unreadable locale dir — skip optional locale files.
    }
  }
  z.end()
  await new Promise<void>((res, rej) => {
    z.on('error', rej)
    const ws = createWriteStream(moextOut)
    z.outputStream
      .pipe(ws)
      .on('close', () => res())
      .on('error', rej)
  })
  const total = (await stat(moextOut)).size
  if (total > TOTAL_MAX) {
    await unlink(moextOut)
    throw new Error(`moext ${total} bytes > ${TOTAL_MAX} byte cap`)
  }
  return { outFile: moextOut, bundleSize: bundle.byteLength, totalSize: total }
}
