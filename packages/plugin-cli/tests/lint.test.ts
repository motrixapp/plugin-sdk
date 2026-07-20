// packages/plugin-cli/tests/lint.test.ts

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { lint } from '../src/commands/lint'
import { findToplevelEffectful } from '../src/lint-rules/effectful-toplevel'

const BASE_MANIFEST = {
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

// ---------------------------------------------------------------------------
// Unit tests for findToplevelEffectful (no fixtures needed)
// ---------------------------------------------------------------------------

describe('findToplevelEffectful', () => {
  it('returns empty array for clean source with call inside hook callback', () => {
    const src = `
      hooks.beforeCreate(async (ctx) => {
        http.get('https://example.com')
      })
    `
    expect(findToplevelEffectful(src)).toEqual([])
  })

  it('detects http.get at module top level', () => {
    const src = `http.get('https://x.com')`
    const found = findToplevelEffectful(src)
    expect(found).toContain('http.get')
  })

  it('detects storage.set at module top level with await', () => {
    const src = `await storage.set('k', 1)`
    const found = findToplevelEffectful(src)
    expect(found).toContain('storage.set')
  })

  it('does not flag a nested call inside a function body', () => {
    const src = `
      function init() {
        storage.set('k', 1)
      }
    `
    expect(findToplevelEffectful(src)).toEqual([])
  })

  it('does not flag an unknown method not in EFFECTFUL set', () => {
    const src = `unknown.foo('bar')`
    expect(findToplevelEffectful(src)).toEqual([])
  })

  it('detects three-segment effectful call fs.task.stat at top level', () => {
    const src = `fs.task.stat('/tmp/file')`
    const found = findToplevelEffectful(src)
    expect(found).toContain('fs.task.stat')
  })
})

// ---------------------------------------------------------------------------
// Integration tests for lint() (fixture-based)
// ---------------------------------------------------------------------------

describe('lint', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'lint-'))
    mkdirSync(path.join(dir, 'dist'), { recursive: true })
  })

  function writeManifest(overrides: Record<string, unknown> = {}) {
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify({ ...BASE_MANIFEST, ...overrides })
    )
  }

  it('returns no warnings or errors for a clean bundle under 800KB', async () => {
    writeManifest()
    writeFileSync(
      path.join(dir, 'dist/plugin.js'),
      '// clean bundle\nhooks.beforeCreate(async (ctx) => {})\n'
    )
    const result = await lint(dir)
    expect(result.warnings).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('emits bundle size warning when bundle exceeds 800KB', async () => {
    writeManifest()
    // ~820KB of filler — a valid JS comment
    const filler = `/* ${'x'.repeat(820 * 1024)} */`
    writeFileSync(path.join(dir, 'dist/plugin.js'), filler)
    const result = await lint(dir)
    expect(result.warnings.some((w) => w.includes('bundle size'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('nearing 1MB cap'))).toBe(
      true
    )
  })

  it('emits bundle-not-found error when bundle file is absent', async () => {
    writeManifest()
    // do NOT write dist/plugin.js
    const result = await lint(dir)
    expect(result.errors.some((e) => e.includes('bundle not found'))).toBe(true)
  })

  it('reports top-level effectful calls as errors via lint()', async () => {
    writeManifest()
    writeFileSync(
      path.join(dir, 'dist/plugin.js'),
      "http.get('https://x.com')\n"
    )
    const result = await lint(dir)
    expect(result.errors).toContain('top-level effectful call: http.get')
  })

  it('emits invokesCommands warning when manifest has invokesCommands', async () => {
    writeManifest({
      invokesCommands: ['alice.other.doThing'],
    })
    writeFileSync(path.join(dir, 'dist/plugin.js'), '// bundle\n')
    const result = await lint(dir)
    expect(
      result.warnings.some((w) => w.includes('invokesCommands declared'))
    ).toBe(true)
    expect(result.warnings.some((w) => w.includes('(1)'))).toBe(true)
  })
})
