// packages/plugin-cli/tests/pack.test.ts

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pack } from '../src/commands/pack'

/** Merge fields into the fixture manifest on disk. */
function patchManifest(dir: string, patch: Record<string, unknown>): void {
  const file = path.join(dir, 'motrix-plugin.json')
  const base = JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({ ...base, ...patch }))
}

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

  // Regression: motrix.filename-template@1.1.0 was packed, signed and released
  // with hooks but no hostPermissions, making it uninstallable on every host.
  // builtin-plugins gained this gate afterwards; `pack` did not, leaving the
  // rule in a separate subcommand nobody is required to run.
  it('refuses to pack hooks declared without hostPermissions', async () => {
    patchManifest(dir, {
      contributes: { hooks: { beforeCreate: { role: 'resolve' } } },
    })
    await expect(pack({ projectDir: dir })).rejects.toThrow(
      'plugin.manifest.host_permissions_required_for_hooks'
    )
  })

  it('packs hooks that do declare a hostPermission', async () => {
    patchManifest(dir, {
      contributes: { hooks: { beforeCreate: { role: 'resolve' } } },
      hostPermissions: ['*://*.example.com/*'],
    })
    await expect(pack({ projectDir: dir })).resolves.toMatchObject({
      outFile: expect.stringMatching(/alice\.demo-1\.0\.0\.moext$/),
    })
  })

  // Gates run before esbuild, so a rejected plugin leaves no partial artifact.
  it('writes no bundle when validation fails', async () => {
    patchManifest(dir, {
      contributes: { hooks: { beforeCreate: { role: 'resolve' } } },
    })
    await expect(pack({ projectDir: dir })).rejects.toThrow()
    expect(existsSync(path.join(dir, 'dist/plugin.js'))).toBe(false)
  })

  // The configuration subtree was invisible to the old fixed-list collector.
  it('refuses to pack a configuration placeholder missing from en-US.json', async () => {
    patchManifest(dir, {
      contributes: {
        configuration: {
          title: '%settings.title%',
          schema: { type: 'object', properties: {} },
        },
      },
    })
    await expect(pack({ projectDir: dir })).rejects.toThrow(
      'plugin.manifest.locale.missing_keys: settings.title'
    )
  })
})
