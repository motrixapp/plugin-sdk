// packages/plugin-cli/tests/pack.test.ts

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pack } from '../src/commands/pack'

describe('motrix-plugin pack', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'pack-'))
    mkdirSync(path.join(dir, 'src'))
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({
        $schema: 'https://motrix.app/schemas/plugin/v1.json',
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
      "import { hooks } from 'motrix:plugin-api'\nhooks.beforeCreate(async (c) => c)\n"
    )
    writeFileSync(path.join(dir, 'locales/en-US.json'), JSON.stringify({}))
  })

  it('packs into .moext', async () => {
    const r = await pack({ projectDir: dir })
    expect(r.outFile).toMatch(/alice\.demo-1\.0\.0\.moext$/)
    expect(r.bundleSize).toBeGreaterThan(0)
    expect(r.totalSize).toBeLessThan(5 * 1024 * 1024)
  })
})
