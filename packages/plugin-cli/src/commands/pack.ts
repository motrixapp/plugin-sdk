// packages/plugin-cli/src/commands/pack.ts

import { createHash } from 'node:crypto'
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

/**
 * Timestamp stamped on every zip entry, pinning the archive's bytes.
 *
 * A zip stores modification times as a DOS date/time, and yazl derives that
 * from a Date using LOCAL-time getters (getFullYear/getMonth/getDate/...).
 * Left alone it uses each file's real mtime, which is why packing the same tree
 * twice produced two different archives: esbuild rewrites dist/plugin.js on
 * every run, so its mtime — and the resulting sha256 — changed every time.
 *
 * Constructing with the LOCAL-time Date constructor is deliberate and is what
 * makes this timezone-independent: yazl reads back exactly the fields this
 * constructor sets, so `new Date(1980, 0, 1)` yields the DOS epoch in every
 * timezone. The alternative — forcing `process.env.TZ = 'UTC'`, as the
 * builtin-plugins pipeline does — works only because that script owns its
 * process; mutating a process-global from a library function would leak into
 * the caller.
 */
const DOS_EPOCH = new Date(1980, 0, 1, 0, 0, 0)
/** Fixed permissions so a umask difference cannot change the archive. */
const ENTRY_MODE = 0o100644

interface YazlAddFileOptions {
  mtime?: Date
  mode?: number
}

interface YazlZipFile {
  addFile(
    realPath: string,
    metadataPath: string,
    options?: YazlAddFileOptions
  ): void
  end(): void
  on(event: 'error', handler: (err: Error) => void): void
  outputStream: NodeJS.ReadableStream
}

export interface PackResult {
  outFile: string
  bundleSize: number
  totalSize: number
  /**
   * sha256 of the archive. Reproducible for a given source tree (see
   * DOS_EPOCH), and the value a registry entry's `package.sha256` needs.
   */
  sha256: string
}

export async function pack(opts: PackOptions): Promise<PackResult> {
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

  // Collect first, write second: entries go into the archive in sorted order so
  // the layout never depends on readdir()'s order, which is filesystem-defined.
  const entries: { abs: string; rel: string }[] = [
    { abs: manifestPath, rel: 'motrix-plugin.json' },
    { abs: bundlePath, rel: 'dist/plugin.js' },
  ]
  // include optional top-level assets when present
  for (const f of ['icon.png', 'LICENSE', 'CHANGELOG.md']) {
    try {
      await stat(path.join(projectDir, f))
      entries.push({ abs: path.join(projectDir, f), rel: f })
    } catch {}
  }
  // locale files
  if (manifest.l10n) {
    const localeDir = path.join(projectDir, manifest.l10n)
    let localeEntries: string[] = []
    try {
      localeEntries = await readdir(localeDir)
    } catch (err) {
      // An absent locale dir is legal; anything else is a real failure and must
      // not be swallowed into a silently incomplete archive.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
    }
    for (const name of localeEntries) {
      const abs = path.join(localeDir, name)
      if (!(await stat(abs)).isFile()) continue
      entries.push({ abs, rel: `${manifest.l10n}/${name}` })
    }
  }
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))

  // yazl.ZipFile has no TS types — cast via unknown
  const z: YazlZipFile = new (
    yazl as { ZipFile: new () => YazlZipFile }
  ).ZipFile()
  for (const { abs, rel } of entries) {
    z.addFile(abs, rel, { mtime: DOS_EPOCH, mode: ENTRY_MODE })
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
  const archive = await readFile(moextOut)
  if (archive.byteLength > TOTAL_MAX) {
    await unlink(moextOut)
    throw new Error(`moext ${archive.byteLength} bytes > ${TOTAL_MAX} byte cap`)
  }
  return {
    outFile: moextOut,
    bundleSize: bundle.byteLength,
    totalSize: archive.byteLength,
    sha256: createHash('sha256').update(archive).digest('hex'),
  }
}
