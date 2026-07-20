// packages/plugin-cli/tests/validate.test.ts

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { validate } from '../src/commands/validate'

const BASE_MANIFEST = {
  $schema: 'https://motrix.app/schemas/plugin/v1.json',
  manifestVersion: 1,
  id: 'alice.demo',
  name: 'Demo',
  version: '1.0.0',
  description: 'A demo plugin',
  categories: ['integration'],
  engines: { motrix: '>=2.0.0 <3.0.0' },
  main: 'dist/plugin.js',
  permissions: [],
  activationEvents: ['onStartup'],
  contributes: {},
}

describe('validate', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'validate-'))
  })

  it('returns ok:true for a valid manifest with no l10n', async () => {
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify(BASE_MANIFEST)
    )
    const result = await validate(dir)
    expect(result).toEqual({ ok: true })
  })

  it('returns ok:true for a valid manifest with valid en-US.json', async () => {
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(path.join(dir, 'locales/en-US.json'), JSON.stringify({}))
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, l10n: 'locales' })
    )
    const result = await validate(dir)
    expect(result).toEqual({ ok: true })
  })

  it('returns ok:false with ENOENT when motrix-plugin.json is missing', async () => {
    const result = await validate(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatch(/ENOENT/)
    }
  })

  it('returns ok:false with Zod error for invalid manifestVersion', async () => {
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, manifestVersion: 2 })
    )
    const result = await validate(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatch(/manifestVersion/i)
    }
  })

  it('returns ok:false when permissions[] contains an auto-injected capability', async () => {
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, permissions: ['log'] })
    )
    const result = await validate(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/auto-injected/)
    }
  })

  it('returns ok:false with missing_keys when l10n key is not in en-US.json', async () => {
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(path.join(dir, 'locales/en-US.json'), JSON.stringify({}))
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, name: '%name%', l10n: 'locales' })
    )
    const result = await validate(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/missing_keys/)
    }
  })

  it('returns ok:false when manifest id uses a reserved publisher', async () => {
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, id: 'motrix.downloader' })
    )
    const result = await validate(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/publisher name is reserved/)
    }
  })
})
