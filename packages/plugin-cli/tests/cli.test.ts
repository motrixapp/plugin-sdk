// packages/plugin-cli/tests/cli.test.ts
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const worktreeRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..')
const BIN = path.join(
  worktreeRoot,
  'packages/plugin-cli/dist/bin/motrix-plugin.js'
)

beforeAll(() => {
  execFileSync('pnpm', ['-F', '@motrix/plugin-cli', 'build'], {
    cwd: worktreeRoot,
    stdio: 'inherit',
  })
}, 60_000)

describe('motrix-plugin CLI', () => {
  it('--help exits 0 and lists all commands', () => {
    const stdout = execFileSync('node', [BIN, '--help'], {
      encoding: 'utf8',
    })
    expect(stdout).toContain('init')
    expect(stdout).toContain('pack')
    expect(stdout).toContain('validate')
    expect(stdout).toContain('lint')
    expect(stdout).toContain('dev')
  })

  it('--version exits 0 and outputs 2.0.0', () => {
    const stdout = execFileSync('node', [BIN, '--version'], {
      encoding: 'utf8',
    })
    expect(stdout.trim()).toBe('2.0.0')
  })

  // A zip records DOS timestamps that yazl derives with LOCAL-time getters, so
  // a packer's timezone could otherwise change the archive's bytes. DOS_EPOCH
  // in pack.ts is built with the local-time Date constructor precisely so those
  // two cancel out — this is the test that holds that reasoning honest. Run
  // through the bin because TZ must be set for a whole process.
  it('packs byte-identically across timezones', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cli-tz-'))
    mkdirSync(path.join(dir, 'src'))
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({
        manifestVersion: 1,
        id: 'alice.demo',
        name: 'Demo',
        version: '1.0.0',
        description: 'd',
        categories: ['integration'],
        engines: { motrix: '>=2.0.0 <3.0.0' },
        main: 'dist/plugin.js',
        permissions: [],
        activationEvents: ['onStartup'],
        contributes: {},
        l10n: 'locales',
      })
    )
    writeFileSync(
      path.join(dir, 'src/index.ts'),
      "import { log } from 'motrix:plugin-api'\nlog.info('x')\n"
    )
    writeFileSync(path.join(dir, 'locales/en-US.json'), JSON.stringify({}))

    const digestUnder = (tz: string): string => {
      rmSync(path.join(dir, 'dist'), { recursive: true, force: true })
      const out = execFileSync('node', [BIN, 'pack'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, TZ: tz },
      })
      const m = out.match(/sha256\s+([a-f0-9]{64})/)
      if (!m) throw new Error(`no digest in output:\n${out}`)
      return m[1]
    }

    const utc = digestUnder('UTC')
    expect(digestUnder('Asia/Shanghai')).toBe(utc) // UTC+8
    expect(digestUnder('America/New_York')).toBe(utc) // UTC-5/-4
    // UTC+14 — far enough east that the DOS epoch lands on another calendar
    // day, which is what a UTC-based constant would get wrong.
    expect(digestUnder('Pacific/Kiritimati')).toBe(utc)
  }, 60_000)

  it('init creates demo/motrix-plugin.json with correct id', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'cli-test-'))
    execFileSync('node', [BIN, 'init', 'demo', '--publisher', 'alice'], {
      cwd: tmpDir,
      encoding: 'utf8',
    })
    const manifestPath = path.join(tmpDir, 'demo', 'motrix-plugin.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.id).toBe('alice.demo')
  })
})
