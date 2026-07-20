// packages/plugin-cli/src/lint-rules/i18n-coverage.test.ts

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { validateLocaleCoverage } from './i18n-coverage'

describe('validateLocaleCoverage', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'i18n-coverage-'))
  })

  it('returns void when l10n is not set', async () => {
    const result = await validateLocaleCoverage(dir, {
      name: 'My Plugin',
      description: 'A plugin',
    })
    expect(result).toBeUndefined()
  })

  it('throws missing_en_us when l10n dir exists but en-US.json is absent', async () => {
    mkdirSync(path.join(dir, 'locales'))
    await expect(
      validateLocaleCoverage(dir, {
        l10n: 'locales',
        name: 'My Plugin',
        description: 'A plugin',
      })
    ).rejects.toThrow('plugin.manifest.locale.missing_en_us')
  })

  it('throws missing_keys when name references %name% but en-US.json lacks the key', async () => {
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(path.join(dir, 'locales/en-US.json'), JSON.stringify({}))
    await expect(
      validateLocaleCoverage(dir, {
        l10n: 'locales',
        name: '%name%',
        description: 'A plugin',
      })
    ).rejects.toThrow('plugin.manifest.locale.missing_keys: name')
  })

  it('resolves ok when name uses %name% and en-US.json defines name', async () => {
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(
      path.join(dir, 'locales/en-US.json'),
      JSON.stringify({ name: 'Foo' })
    )
    await expect(
      validateLocaleCoverage(dir, {
        l10n: 'locales',
        name: '%name%',
        description: 'A plugin',
      })
    ).resolves.toBeUndefined()
  })

  it('resolves ok for nested keys like %foo.bar% against { foo: { bar: "..." } }', async () => {
    mkdirSync(path.join(dir, 'locales'))
    writeFileSync(
      path.join(dir, 'locales/en-US.json'),
      JSON.stringify({ foo: { bar: 'Baz' } })
    )
    await expect(
      validateLocaleCoverage(dir, {
        l10n: 'locales',
        name: '%foo.bar%',
        description: 'A plugin',
      })
    ).resolves.toBeUndefined()
  })
})
