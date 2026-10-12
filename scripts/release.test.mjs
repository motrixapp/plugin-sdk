import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  inspectArchive,
  PACKAGES,
  parseArgs,
  REGISTRY,
  RegistryLookupError,
  readVersion,
  runRelease,
} from './release.mjs'

const execFileAsync = promisify(execFile)
const hash = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sdk-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@11.22.0' })
  )
  for (const [directory, name] of PACKAGES) {
    const folder = path.join(root, 'packages', directory)
    await mkdir(folder, { recursive: true })
    await writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({
        name,
        version: '2.2.0',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        publishConfig: { access: 'public' },
        ...(name === 'create-motrix-plugin'
          ? { dependencies: { '@motrix/plugin-cli': 'workspace:*' } }
          : {}),
      })
    )
  }
  const state = {
    commands: [],
    archives: new Map(),
    published: new Map(),
    uploads: [],
    commit: 'a'.repeat(40),
    branch: 'main',
    dirty: '',
    remote: 'a'.repeat(40),
    askCount: 0,
    lookups: 0,
    fail: null,
    packMutation: null,
    onPublish: null,
    elapsed: 0,
    waits: [],
    logs: [],
  }
  const metadata = (name) => {
    const entry = [...state.archives.values()].find(
      (value) => value.packed.name === name
    )
    return {
      name,
      version: entry.packed.version,
      dist: { integrity: hash(entry.bytes) },
    }
  }
  const execute = async (command, args, { cwd }) => {
    const label = [command, ...args].join(' ')
    state.commands.push(label)
    if (state.fail && label.startsWith(state.fail))
      throw new Error('simulated command failure')
    if (command === 'git') {
      if (args[0] === 'rev-parse') return state.commit
      if (args[0] === 'branch') return state.branch
      if (args[0] === 'status') return state.dirty
      if (args[0] === 'ls-remote') return `${state.remote}\trefs/heads/main`
    }
    if (command === 'tar') {
      const entry = state.archives.get(args[1])
      return args[0] === '-tzf'
        ? entry.files.join('\n')
        : JSON.stringify(entry.packed)
    }
    if (command === 'pnpm') {
      if (args[0] === '--version') return '11.22.0'
      if (args[0] === 'pack') {
        const packed = JSON.parse(
          await readFile(path.join(cwd, 'package.json'), 'utf8')
        )
        if (packed.dependencies)
          packed.dependencies['@motrix/plugin-cli'] = '2.2.0'
        const file = path.join(
          args[2],
          `${packed.name.replace('@', '').replace('/', '-')}-${packed.version}.tgz`
        )
        const bytes = Buffer.from(JSON.stringify(packed))
        const entry = {
          packed,
          bytes,
          file,
          files: [
            'package/package.json',
            'package/dist/index.js',
            'package/dist/index.d.ts',
          ],
        }
        if (state.packMutation) state.packMutation(entry)
        await writeFile(file, bytes)
        state.archives.set(file, entry)
      }
      if (args[0] === 'publish') {
        const { packed } = state.archives.get(args[1])
        state.uploads.push(packed.name)
        if (state.onPublish) await state.onPublish(packed.name)
        else state.published.set(packed.name, metadata(packed.name))
      }
      return ''
    }
    throw new Error(`Unexpected command ${label}`)
  }
  const dependencies = {
    execute,
    env: {},
    interactive: true,
    log: (message) => state.logs.push(message),
    now: () => state.elapsed,
    wait: async (ms) => {
      state.waits.push(ms)
      state.elapsed += ms
    },
    readVersion: async (name) => {
      state.lookups++
      return state.published.get(name) ?? null
    },
    confirm: async () => {
      state.askCount++
      return true
    },
  }
  const report = async () => {
    const dirs = await readdir(path.join(root, 'dist/release'))
    return JSON.parse(
      await readFile(
        path.join(root, 'dist/release', dirs.at(-1), 'release.json'),
        'utf8'
      )
    )
  }
  return { root, state, dependencies, metadata, report }
}

test('CLI defaults to dry-run and has no confirmation or validation bypass flags', () => {
  assert.deepEqual(parseArgs([]), { publish: false })
  assert.deepEqual(parseArgs(['--', '--dry-run']), { publish: false })
  assert.deepEqual(parseArgs(['--', '--publish']), { publish: true })
  for (const args of [
    ['--yes'],
    ['--force'],
    ['--skip-checks'],
    ['--dry-run', '--publish'],
  ]) {
    assert.throws(() => parseArgs(args))
  }
})

test('CLI help exits without running the release pipeline', async () => {
  const script = new URL('./release.mjs', import.meta.url)
  const { stdout } = await execFileAsync(process.execPath, [
    fileURLToPath(script),
    '--help',
  ])
  assert.match(stdout, /Default: validate, build and pack only/)
})

test('dry-run in CI checks and packs every package without registry access or confirmation', async (t) => {
  const f = await fixture(t)
  const result = await runRelease(
    { root: f.root },
    { ...f.dependencies, env: { CI: 'true' }, interactive: false }
  )
  assert.equal(result.phase, 'prepared')
  assert.equal(result.packages.length, 4)
  assert.equal(f.state.lookups, 0)
  assert.equal(f.state.askCount, 0)
  assert.deepEqual(f.state.uploads, [])
  const steps = f.state.commands.filter((s) => s.startsWith('pnpm '))
  assert.deepEqual(steps.slice(1, 7), [
    'pnpm install --frozen-lockfile',
    'pnpm run lint',
    'pnpm run check:facade',
    'pnpm run build',
    'pnpm run typecheck',
    'pnpm run test',
  ])
  assert.match(steps[7], /^pnpm pack /)
  assert.equal(
    (await f.report()).packages[3].integrity,
    result.packages[3].integrity
  )
})

for (const [label, values] of [
  ['CI', { env: { CI: 'true' } }],
  ['non-interactive input', { interactive: false }],
]) {
  test(`publication refuses ${label} before any command executes`, async (t) => {
    const f = await fixture(t)
    await assert.rejects(
      runRelease(
        { publish: true, root: f.root },
        { ...f.dependencies, ...values }
      ),
      /human-run only/
    )
    assert.deepEqual(f.state.commands, [])
  })
}

for (const [key, value] of [
  ['branch', 'feature'],
  ['dirty', ' M package.json'],
  ['remote', 'b'.repeat(40)],
]) {
  test(`publication refuses invalid Git state: ${key}`, async (t) => {
    const f = await fixture(t)
    f.state[key] = value
    await assert.rejects(
      runRelease({ publish: true, root: f.root }, f.dependencies),
      /clean main|origin\/main/
    )
    assert.equal(
      f.state.commands.some((s) => s.startsWith('pnpm install')),
      false
    )
  })
}

test('a failed quality gate prevents packing and publication', async (t) => {
  const f = await fixture(t)
  f.state.fail = 'pnpm run typecheck'
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, f.dependencies),
    /simulated/
  )
  assert.equal(f.state.archives.size, 0)
  assert.equal(f.state.lookups, 0)
  assert.deepEqual(f.state.uploads, [])
  assert.equal((await f.report()).phase, 'failed')
})

test('a mismatched schema/CLI version fails before installation', async (t) => {
  const f = await fixture(t)
  const p = path.join(f.root, 'packages/plugin-cli/package.json')
  const manifest = JSON.parse(await readFile(p, 'utf8'))
  manifest.version = '2.3.0'
  await writeFile(p, JSON.stringify(manifest))
  await assert.rejects(
    runRelease({ root: f.root }, f.dependencies),
    /Schema and CLI/
  )
  assert.equal(
    f.state.commands.some((s) => s.startsWith('pnpm install')),
    false
  )
})

for (const [label, mutate, message] of [
  [
    'missing type entrypoint',
    (entry) => {
      entry.files = entry.files.filter((f) => !f.endsWith('.d.ts'))
    },
    /Missing packed file/,
  ],
  [
    'unexpected publish registry',
    (entry) => {
      entry.packed.publishConfig.registry = 'https://invalid.example/'
    },
    /Unexpected packed registry/,
  ],
  [
    'unexpected publish tag',
    (entry) => {
      entry.packed.publishConfig.tag = 'next'
    },
    /Unexpected packed publish configuration/,
  ],
  [
    'wrong identity',
    (entry) => {
      entry.packed.name = 'unexpected-package'
    },
    /Packed identity/,
  ],
  [
    'workspace dependency',
    (entry) => {
      entry.packed.dependencies = { test: 'workspace:*' }
    },
    /Unresolved/,
  ],
  [
    'wrong wrapper CLI dependency',
    (entry) => {
      if (entry.packed.name === 'create-motrix-plugin')
        entry.packed.dependencies['@motrix/plugin-cli'] = '2.1.1'
    },
    /workspace dependency/,
  ],
]) {
  test(`archive validation rejects ${label} before registry access`, async (t) => {
    const f = await fixture(t)
    f.state.packMutation = mutate
    await assert.rejects(
      runRelease({ publish: true, root: f.root }, f.dependencies),
      message
    )
    assert.equal(f.state.lookups, 0)
    assert.deepEqual(f.state.uploads, [])
  })
}

test('a conflict in the last registry version prevents the entire upload batch', async (t) => {
  const f = await fixture(t)
  f.state.published.set('create-motrix-plugin', {
    name: 'create-motrix-plugin',
    version: '2.2.0',
    dist: { integrity: 'sha512-wrong' },
  })
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, f.dependencies),
    /will not be overwritten/
  )
  assert.deepEqual(f.state.uploads, [])
  assert.equal(f.state.askCount, 0)
})

test('registry errors are not treated as absent versions', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    runRelease(
      { publish: true, root: f.root },
      {
        ...f.dependencies,
        readVersion: async () => {
          throw new Error('registry unavailable')
        },
      }
    ),
    /registry unavailable/
  )
  assert.deepEqual(f.state.uploads, [])
})

test('declining confirmation uploads nothing', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    runRelease(
      { publish: true, root: f.root },
      { ...f.dependencies, confirm: async () => false }
    ),
    /cancelled/
  )
  assert.deepEqual(f.state.uploads, [])
})

test('confirmation cannot authorize archives modified after validation', async (t) => {
  const f = await fixture(t)
  const confirm = async () => {
    await writeFile([...f.state.archives.keys()][3], 'tampered')
    return true
  }
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, { ...f.dependencies, confirm }),
    /Archive changed/
  )
  assert.deepEqual(f.state.uploads, [])
})

test('source changes during confirmation prevent uploads', async (t) => {
  const f = await fixture(t)
  const confirm = async () => {
    f.state.dirty = ' M source.ts'
    return true
  }
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, { ...f.dependencies, confirm }),
    /clean main/
  )
  assert.deepEqual(f.state.uploads, [])
})

test('publishes in dependency order and verifies each version before the next', async (t) => {
  const f = await fixture(t)
  const result = await runRelease(
    { publish: true, root: f.root },
    f.dependencies
  )
  assert.deepEqual(
    f.state.uploads,
    PACKAGES.map(([, name]) => name)
  )
  assert.equal(result.phase, 'complete')
  assert.equal(f.state.askCount, 1)
  assert.ok(result.packages.every((p) => p.status === 'published'))
  assert.ok(
    f.state.commands
      .filter((s) => s.startsWith('pnpm publish'))
      .every((s) =>
        s.includes(`--registry ${REGISTRY} --tag latest --publish-branch main`)
      )
  )
})

test('a partial release resumes by skipping only byte-identical published versions', async (t) => {
  const f = await fixture(t)
  const lookup = async (name) =>
    name === PACKAGES[0][1]
      ? f.metadata(name)
      : (f.state.published.get(name) ?? null)
  const result = await runRelease(
    { publish: true, root: f.root },
    { ...f.dependencies, readVersion: lookup }
  )
  assert.deepEqual(
    f.state.uploads,
    PACKAGES.slice(1).map(([, name]) => name)
  )
  assert.equal(result.packages[0].status, 'already-published')
})

test('an already-complete identical batch needs no confirmation or uploads', async (t) => {
  const f = await fixture(t)
  const result = await runRelease(
    { publish: true, root: f.root },
    { ...f.dependencies, readVersion: async (name) => f.metadata(name) }
  )
  assert.equal(result.phase, 'complete')
  assert.equal(f.state.askCount, 0)
  assert.deepEqual(f.state.uploads, [])
})

test('a publishing error stops later packages and leaves uncertain progress in the report', async (t) => {
  const f = await fixture(t)
  f.state.onPublish = async (name) => {
    if (name === PACKAGES[1][1]) throw new Error('upload connection lost')
    f.state.published.set(name, f.metadata(name))
  }
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, f.dependencies),
    /connection lost/
  )
  assert.deepEqual(
    f.state.uploads,
    PACKAGES.slice(0, 2).map(([, name]) => name)
  )
  assert.deepEqual(
    (await f.report()).packages.map((p) => p.status),
    ['published', 'publishing', 'pending', 'pending']
  )
})

test('unverifiable publication stops without retrying the upload or later packages', async (t) => {
  const f = await fixture(t)
  f.state.onPublish = async () => {}
  await assert.rejects(
    runRelease({ publish: true, root: f.root }, f.dependencies),
    /verification timed out after 5 minutes/
  )
  assert.deepEqual(f.state.uploads, [PACKAGES[0][1]])
  assert.equal(f.state.elapsed, 300_000)
  assert.equal((await f.report()).packages[0].status, 'verifying')
  assert.ok(f.state.logs.some((line) => line.includes('next check in')))
})

test('delayed visibility beyond the old polling limit completes without another upload', async (t) => {
  const f = await fixture(t)
  let attempts = 0
  const lookup = async (name) => {
    if (!f.state.published.has(name)) return null
    if (name === PACKAGES[0][1] && ++attempts <= 17) {
      assert.deepEqual(f.state.uploads, [name])
      return null
    }
    return f.metadata(name)
  }
  const result = await runRelease(
    { publish: true, root: f.root },
    { ...f.dependencies, readVersion: lookup }
  )
  assert.equal(result.phase, 'complete')
  assert.equal(result.packages[0].verificationAttempts, 18)
  assert.ok(f.state.elapsed > 28_000)
  assert.deepEqual(
    f.state.uploads,
    PACKAGES.map(([, name]) => name)
  )
})

test('verification retries transient reads, observes Retry-After and reports progress', async (t) => {
  const f = await fixture(t)
  let attempts = 0
  const lookup = async (name) => {
    if (!f.state.published.has(name)) return null
    if (name === PACKAGES[0][1] && ++attempts <= 2)
      throw new RegistryLookupError('HTTP 429', {
        retryable: true,
        retryAfterMs: 45_000,
      })
    return f.metadata(name)
  }
  await runRelease(
    { publish: true, root: f.root },
    { ...f.dependencies, readVersion: lookup }
  )
  assert.equal(f.state.elapsed, 90_000)
  assert.ok(f.state.waits.every((ms) => ms <= 30_000))
  assert.ok(f.state.logs.some((line) => line.includes('Still waiting')))
  assert.deepEqual(
    f.state.uploads,
    PACKAGES.map(([, name]) => name)
  )
})

test('verification caps a long Retry-After at its deadline', async (t) => {
  const f = await fixture(t)
  const lookup = async (name) => {
    if (!f.state.published.has(name)) return null
    throw new RegistryLookupError('HTTP 503', {
      retryable: true,
      retryAfterMs: 600_000,
    })
  }
  await assert.rejects(
    runRelease(
      { publish: true, root: f.root },
      { ...f.dependencies, readVersion: lookup }
    ),
    /verification timed out/
  )
  assert.equal(f.state.elapsed, 300_000)
  assert.deepEqual(f.state.uploads, [PACKAGES[0][1]])
})

test('verification stops at its deadline after an unexpectedly long timer delay', async (t) => {
  const f = await fixture(t)
  let waits = 0
  await assert.rejects(
    runRelease(
      { publish: true, root: f.root },
      {
        ...f.dependencies,
        wait: async () => {
          waits++
          f.state.elapsed += 600_000
        },
        readVersion: async (name) => {
          if (!f.state.published.has(name)) return null
          throw new RegistryLookupError('HTTP 429', {
            retryable: true,
            retryAfterMs: 120_000,
          })
        },
      }
    ),
    /verification timed out/
  )
  assert.equal(waits, 1)
  assert.deepEqual(f.state.uploads, [PACKAGES[0][1]])
})

for (const failure of ['authorization', 'integrity']) {
  test(`verification fails immediately on ${failure} without later uploads`, async (t) => {
    const f = await fixture(t)
    const lookup = async (name) => {
      if (!f.state.published.has(name)) return null
      if (failure === 'authorization') throw new RegistryLookupError('HTTP 403')
      return { ...f.metadata(name), dist: { integrity: 'sha512-wrong' } }
    }
    await assert.rejects(
      runRelease(
        { publish: true, root: f.root },
        { ...f.dependencies, readVersion: lookup }
      ),
      /HTTP 403|will not be overwritten/
    )
    assert.equal(f.state.elapsed, 0)
    assert.deepEqual(f.state.uploads, [PACKAGES[0][1]])
  })
}

test('version lookups request fresh metadata and never reuse a preflight cache key', async () => {
  const requests = []
  const request = async (url, options) => {
    requests.push({ url, options })
    return new Response(null, { status: 404 })
  }
  assert.equal(
    await readVersion('@motrix/plugin-api', '2.2.0', { fetch: request }),
    null
  )
  await readVersion('@motrix/plugin-api', '2.2.0', { fetch: request })
  assert.notEqual(requests[0].url.href, requests[1].url.href)
  for (const { url, options } of requests) {
    assert.equal(url.origin, 'https://registry.npmjs.org')
    assert.equal(decodeURIComponent(url.pathname), '/@motrix/plugin-api/2.2.0')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers['Cache-Control'], 'no-cache')
    assert.equal(options.redirect, 'error')
  }
})

for (const status of [401, 403, 429, 500, 503]) {
  test(`version lookup classifies HTTP ${status} without treating it as absent`, async () => {
    await assert.rejects(
      readVersion('@motrix/plugin-api', '2.2.0', {
        fetch: async () =>
          new Response(null, { status, headers: { 'Retry-After': '17' } }),
      }),
      (error) => {
        assert.ok(error instanceof RegistryLookupError)
        assert.equal(error.retryable, status === 429 || status >= 500)
        assert.equal(error.retryAfterMs, 17_000)
        return true
      }
    )
  })
}

test('a network failure is retryable but malformed registry data is not', async () => {
  await assert.rejects(
    readVersion('sample', '2.2.0', {
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    }),
    (error) => error instanceof RegistryLookupError && error.retryable
  )
  await assert.rejects(
    readVersion('sample', '2.2.0', {
      fetch: async () => new Response('not json'),
    }),
    SyntaxError
  )
  await assert.rejects(
    readVersion('sample', '2.2.0', {
      fetch: async () => new Response('null'),
    }),
    /Malformed registry metadata/
  )
})

test('real gzip tar archives are inspected without extracting files to disk', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sdk-release-tar-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = { name: 'sample', version: '1.0.0', main: 'index.js' }
  await mkdir(path.join(root, 'package'))
  await writeFile(
    path.join(root, 'package/package.json'),
    JSON.stringify(source)
  )
  await writeFile(path.join(root, 'package/index.js'), 'export {}\n')
  const archive = path.join(root, 'sample.tgz')
  await execFileAsync('tar', ['-czf', archive, 'package'], { cwd: root })
  const result = await inspectArchive(archive, source, new Map())
  assert.equal(result.name, 'sample')
  assert.equal(result.integrity, hash(await readFile(archive)))
})
