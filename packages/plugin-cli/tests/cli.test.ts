// packages/plugin-cli/tests/cli.test.ts
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
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
