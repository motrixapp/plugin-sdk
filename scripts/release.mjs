#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
export const REGISTRY = 'https://registry.npmjs.org/'
export const PACKAGES = [
  ['plugin-manifest-schema', '@motrix/plugin-manifest-schema'],
  ['plugin-api', '@motrix/plugin-api'],
  ['plugin-cli', '@motrix/plugin-cli'],
  ['create-motrix-plugin', 'create-motrix-plugin'],
]
const CONFIRMATION = 'publish SDK packages to npm'
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const REQUEST_TIMEOUT_MS = 15_000
const VERIFICATION_TIMEOUT_MS = 5 * 60_000

export class RegistryLookupError extends Error {
  constructor(message, { retryable = false, retryAfterMs = 0 } = {}) {
    super(message)
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}

export function parseArgs(args) {
  const flags = args.filter((arg) => arg !== '--')
  if (flags.length === 0) return { publish: false }
  if (flags.length !== 1)
    throw new Error('Choose --dry-run or --publish, not both.')
  if (flags[0] === '--help' || flags[0] === '-h') return { help: true }
  if (flags[0] === '--dry-run') return { publish: false }
  if (flags[0] === '--publish') return { publish: true }
  throw new Error(`Unknown argument: ${flags[0]}`)
}

async function execute(command, args, { cwd, capture = false }) {
  let program = command
  let parameters = args
  if (command === 'pnpm') {
    // Reuse the invoking package manager, including corepack's JS entrypoint.
    // Standalone pnpm.exe also works when npm_execpath is not supplied.
    const entry = process.env.npm_execpath
    if (entry && /pnpm/i.test(path.basename(entry))) {
      if (/\.[cm]?js$/i.test(entry)) {
        program = process.execPath
        parameters = [entry, ...args]
      } else {
        program = entry
      }
    } else if (process.platform === 'win32') {
      program = 'pnpm.exe'
    }
  }
  if (capture) {
    const { stdout } = await execFileAsync(program, parameters, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
    return stdout.trim()
  }
  await new Promise((resolve, reject) => {
    const child = spawn(program, parameters, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else
        reject(new Error(`${command} ${args[0]} failed (${signal ?? code}).`))
    })
  })
  return ''
}

export async function readVersion(
  name,
  version,
  { fetch: request = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  const url = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    REGISTRY
  )
  // Preflight may have cached a 404 before the version was uploaded.
  url.searchParams.set('release-check', randomUUID())
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const response = await request(url, {
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal,
    })
    if (response.ok) {
      const metadata = await response.json()
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        throw new Error(`Malformed registry metadata for ${name}@${version}.`)
      return metadata
    }
    await response.body?.cancel()
    if (response.status === 404) return null
    const retryAfter = response.headers.get('retry-after')
    const retryAfterMs = /^\d+$/.test(retryAfter ?? '')
      ? Number(retryAfter) * 1000
      : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0
    throw new RegistryLookupError(
      `Registry lookup failed for ${name}@${version}: HTTP ${response.status}.`,
      {
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs,
      }
    )
  } catch (error) {
    if (signal.aborted || error instanceof TypeError)
      throw new RegistryLookupError(
        `Registry lookup for ${name}@${version} timed out or lost its connection.`,
        { retryable: true }
      )
    throw error
  }
}

async function verifyPublication(pkg, { lookup, wait, now, log, save }) {
  const started = now()
  const deadline = started + VERIFICATION_TIMEOUT_MS
  let delay = 2000
  pkg.status = 'verifying'
  pkg.verificationAttempts = 0
  await save()
  log(
    `Uploaded ${pkg.name}@${pkg.version}; verifying npm visibility and integrity (up to 5 minutes).`
  )
  while (now() < deadline) {
    pkg.verificationAttempts++
    let reason = 'version metadata is not visible yet'
    let retryAfterMs = 0
    try {
      const metadata = await lookup(pkg.name, pkg.version, {
        timeoutMs: Math.max(
          1,
          Math.ceil(Math.min(REQUEST_TIMEOUT_MS, deadline - now()))
        ),
      })
      if (metadata) {
        matchesPublished(pkg, metadata)
        pkg.status = 'published'
        delete pkg.verificationMessage
        await save()
        log(`Verified ${pkg.name}@${pkg.version}.`)
        return
      }
    } catch (error) {
      if (!(error instanceof RegistryLookupError) || !error.retryable)
        throw error
      reason = error.message
      retryAfterMs = error.retryAfterMs
    }
    pkg.verificationMessage = reason
    await save()
    const remaining = Math.max(0, deadline - now())
    if (!remaining) break
    const next = Math.min(remaining, Math.max(delay, retryAfterMs))
    log(
      `Waiting for ${pkg.name}@${pkg.version}: ${reason}; ${Math.round((now() - started) / 1000)}s elapsed, next check in ${Math.ceil(next / 1000)}s.`
    )
    // Long Retry-After values still produce a heartbeat at least every 30s.
    const resumeAt = now() + next
    while (now() < resumeAt && now() < deadline) {
      const interval = Math.min(30_000, resumeAt - now(), deadline - now())
      if (interval <= 0) break
      await wait(interval)
      const remainingWait = Math.min(resumeAt, deadline) - now()
      if (remainingWait > 0)
        log(
          `Still waiting for ${pkg.name}@${pkg.version}; next check in ${Math.ceil(remainingWait / 1000)}s.`
        )
    }
    delay = Math.min(delay * 2, 10_000)
  }
  throw new Error(
    `Upload completed for ${pkg.name}@${pkg.version}, but npm verification timed out after 5 minutes. No upload was retried. Preserve this report and rerun the release command after npm becomes visible; identical published packages will be skipped.`
  )
}

async function confirm(message) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return (await terminal.question(`${message}\n> `)) === CONFIRMATION
  } finally {
    terminal.close()
  }
}

function integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export function matchesPublished(pkg, metadata) {
  if (
    metadata?.name !== pkg.name ||
    metadata?.version !== pkg.version ||
    !metadata.dist?.integrity?.split(/\s+/).includes(pkg.integrity)
  ) {
    throw new Error(
      `Published ${pkg.name}@${pkg.version} does not match the packed SHA-512 integrity; it will not be overwritten.`
    )
  }
}

async function manifests(root) {
  const result = []
  for (const [directory, name] of PACKAGES) {
    const folder = path.join(root, 'packages', directory)
    const manifest = JSON.parse(
      await readFile(path.join(folder, 'package.json'), 'utf8')
    )
    if (
      manifest.name !== name ||
      manifest.private ||
      !STABLE_VERSION.test(manifest.version)
    ) {
      throw new Error(`Expected public ${name} with a stable x.y.z version.`)
    }
    if (
      manifest.publishConfig?.access !== 'public' ||
      (manifest.publishConfig.registry &&
        manifest.publishConfig.registry !== REGISTRY) ||
      (manifest.publishConfig.tag && manifest.publishConfig.tag !== 'latest') ||
      manifest.publishConfig.directory
    ) {
      throw new Error(`Unexpected publish configuration in ${name}.`)
    }
    result.push({ folder, manifest })
  }
  if (result[0].manifest.version !== result[2].manifest.version) {
    throw new Error(
      'Schema and CLI versions must match for their coordinated release.'
    )
  }
  return result
}

async function gitState(run, root, publish) {
  const git = (args) => run('git', args, { cwd: root, capture: true })
  const commit = await git(['rev-parse', 'HEAD'])
  const branch = await git(['branch', '--show-current'])
  const dirty =
    (await git(['status', '--porcelain', '--untracked-files=normal'])).length >
    0
  if (publish) {
    if (branch !== 'main' || dirty)
      throw new Error(
        'Publication requires a clean main checkout, including untracked files.'
      )
    const remote = await git([
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/main',
    ])
    if (remote.split(/\s+/)[0] !== commit)
      throw new Error(
        'Local HEAD must equal origin/main; fetch and reconcile main first.'
      )
  }
  return { commit, branch: branch || '(detached)', dirty }
}

export async function inspectArchive(archive, source, versions, run = execute) {
  const cwd = path.dirname(archive)
  const entries = (
    await run('tar', ['-tzf', archive], { cwd, capture: true })
  ).split(/\r?\n/)
  if (
    entries.some(
      (entry) =>
        !entry.startsWith('package/') || entry.split('/').includes('..')
    )
  ) {
    throw new Error(`Unexpected archive path in ${source.name}.`)
  }
  const packed = JSON.parse(
    await run('tar', ['-xOzf', archive, 'package/package.json'], {
      cwd,
      capture: true,
    })
  )
  if (
    packed.name !== source.name ||
    packed.version !== source.version ||
    packed.private
  ) {
    throw new Error(`Packed identity differs from source: ${source.name}.`)
  }
  if (
    packed.publishConfig?.registry &&
    packed.publishConfig.registry !== REGISTRY
  ) {
    throw new Error(`Unexpected packed registry in ${source.name}.`)
  }
  if (
    packed.publishConfig?.access !== source.publishConfig?.access ||
    (packed.publishConfig?.tag && packed.publishConfig.tag !== 'latest') ||
    packed.publishConfig?.directory
  ) {
    throw new Error(
      `Unexpected packed publish configuration in ${source.name}.`
    )
  }
  const required = [
    source.main,
    source.types,
    ...(typeof source.bin === 'string'
      ? [source.bin]
      : Object.values(source.bin ?? {})),
    ...(source.files ?? []).filter((file) => path.extname(file)),
  ].filter(Boolean)
  for (const file of required) {
    if (!entries.includes(`package/${file}`))
      throw new Error(`Missing packed file ${source.name}: ${file}.`)
  }
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, range] of Object.entries(packed[field] ?? {})) {
      if (/^(workspace|link|file):/.test(range))
        throw new Error(`Unresolved ${field} in ${source.name}: ${name}.`)
      if (
        source[field]?.[name] === 'workspace:*' &&
        range !== versions.get(name)
      ) {
        throw new Error(
          `Incorrect packed workspace dependency ${name} in ${source.name}.`
        )
      }
    }
    for (const [name, range] of Object.entries(source[field] ?? {})) {
      if (
        range === 'workspace:*' &&
        packed[field]?.[name] !== versions.get(name)
      ) {
        throw new Error(
          `Missing packed workspace dependency ${name} in ${source.name}.`
        )
      }
    }
  }
  if (
    source.name === '@motrix/plugin-cli' &&
    Object.keys(packed.dependencies ?? {}).some((name) =>
      name.startsWith('@motrix/')
    )
  ) {
    throw new Error('The packed CLI must inline its Motrix SDK dependencies.')
  }
  const bytes = await readFile(archive)
  return {
    name: source.name,
    version: source.version,
    file: path.basename(archive),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    integrity: integrity(bytes),
    status: 'prepared',
  }
}

export async function runRelease(
  { publish = false, root = ROOT } = {},
  dependencies = {}
) {
  const run = dependencies.execute ?? execute
  const lookup = dependencies.readVersion ?? readVersion
  const ask = dependencies.confirm ?? confirm
  const wait =
    dependencies.wait ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const log = dependencies.log ?? console.log
  const now = dependencies.now ?? (() => performance.now())
  const env = dependencies.env ?? process.env
  const interactive =
    dependencies.interactive ??
    Boolean(process.stdin.isTTY && process.stdout.isTTY)
  if (publish && (env.CI || !interactive))
    throw new Error(
      'Publication is human-run only: use an interactive terminal outside CI.'
    )
  const rootManifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  )
  const expectedPnpm = /^pnpm@([^+]+)(?:\+.*)?$/.exec(
    rootManifest.packageManager
  )?.[1]
  const pnpmVersion = await run('pnpm', ['--version'], {
    cwd: root,
    capture: true,
  })
  if (!expectedPnpm || pnpmVersion !== expectedPnpm)
    throw new Error(
      `Use the pinned package manager ${rootManifest.packageManager}; received pnpm ${pnpmVersion}.`
    )
  const source = await gitState(run, root, publish)
  const packages = await manifests(root)
  const versions = new Map(
    packages.map(({ manifest }) => [manifest.name, manifest.version])
  )
  const releaseRoot = path.join(root, 'dist', 'release')
  await mkdir(releaseRoot, { recursive: true })
  const directory = await mkdtemp(path.join(releaseRoot, 'sdk-'))
  const reportPath = path.join(directory, 'release.json')
  const report = {
    mode: publish ? 'publish' : 'dry-run',
    source,
    pnpmVersion,
    registry: REGISTRY,
    phase: 'checking',
    packages: [],
  }
  const save = () =>
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await save()
  try {
    for (const args of [
      ['install', '--frozen-lockfile'],
      ['run', 'lint'],
      ['run', 'check:facade'],
      ['run', 'build'],
      ['run', 'typecheck'],
      ['run', 'test'],
    ])
      await run('pnpm', args, { cwd: root })
    report.phase = 'packing'
    await save()
    for (const { folder, manifest } of packages) {
      await run('pnpm', ['pack', '--pack-destination', directory], {
        cwd: folder,
      })
      const archive = path.join(
        directory,
        `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`
      )
      report.packages.push(
        await inspectArchive(archive, manifest, versions, run)
      )
      await save()
    }
    log(`Release artifacts: ${directory}`)
    for (const pkg of report.packages)
      log(`${pkg.name}@${pkg.version}  ${pkg.integrity}`)
    if (!publish) {
      report.phase = 'prepared'
      await save()
      log('Dry run complete. No registry lookup or publication was performed.')
      return report
    }
    const unchanged = async () => {
      const current = await gitState(run, root, true)
      if (current.commit !== source.commit)
        throw new Error('Source commit changed during release preparation.')
      for (const pkg of report.packages) {
        if (
          integrity(await readFile(path.join(directory, pkg.file))) !==
          pkg.integrity
        ) {
          throw new Error(`Archive changed after validation: ${pkg.file}.`)
        }
      }
    }
    await unchanged()
    // Preflight the entire batch before uploading even its first package.
    report.phase = 'registry-preflight'
    for (const pkg of report.packages) {
      const existing = await lookup(pkg.name, pkg.version)
      if (existing) matchesPublished(pkg, existing)
      pkg.status = existing ? 'already-published' : 'pending'
      log(`${pkg.name}@${pkg.version}: ${pkg.status}`)
    }
    await save()
    if (report.packages.every((pkg) => pkg.status === 'already-published')) {
      report.phase = 'complete'
      await save()
      return report
    }
    if (
      !(await ask(
        `Type "${CONFIRMATION}" to upload the pending packages above to ${REGISTRY}`
      ))
    ) {
      throw new Error('Publication cancelled; no packages were uploaded.')
    }
    await unchanged()
    report.phase = 'publishing'
    for (const pkg of report.packages) {
      if (pkg.status === 'already-published') continue
      await unchanged()
      // A version may have appeared during confirmation. Never overwrite it.
      const existing = await lookup(pkg.name, pkg.version)
      if (existing) {
        matchesPublished(pkg, existing)
        pkg.status = 'already-published'
        await save()
        continue
      }
      pkg.status = 'publishing'
      await save()
      await run(
        'pnpm',
        [
          'publish',
          path.join(directory, pkg.file),
          '--access',
          'public',
          '--registry',
          REGISTRY,
          '--tag',
          'latest',
          '--publish-branch',
          'main',
        ],
        { cwd: root }
      )
      await verifyPublication(pkg, { lookup, wait, now, log, save })
    }
    report.phase = 'complete'
    await save()
    log('All four package versions are verified on npm.')
    return report
  } catch (error) {
    report.phase = 'failed'
    report.error = error.message
    await save()
    log(
      `Release stopped. Preserve artifacts and inspect ${reportPath} before retrying.`
    )
    throw error
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      console.log(
        'Usage: pnpm run release [-- --dry-run | -- --publish]\nDefault: validate, build and pack only. --publish requires a human terminal and confirmation.'
      )
    } else {
      await runRelease(options)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
