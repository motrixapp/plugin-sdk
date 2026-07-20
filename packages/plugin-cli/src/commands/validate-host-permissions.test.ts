// Tests for `motrix-plugin validate-host-permissions`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateHostPermissions } from './validate-host-permissions'

describe('validateHostPermissions', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mphp-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function plant(manifest: object): void {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, 'motrix-plugin.json'),
      JSON.stringify(manifest, null, 2)
    )
  }

  it('returns ok when hostPermissions list is narrow and well-formed', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      hostPermissions: ['*://*.bilibili.com/*', 'https://example.com/*'],
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('errors on malformed pattern', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      hostPermissions: ['ftp://example.com/'],
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('ftp://example.com/')
  })

  it('warns on <all_urls> broad pattern', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      hostPermissions: ['<all_urls>'],
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(true)
    expect(r.warnings[0]).toContain('<all_urls>')
  })

  it('warns on https://*/* broad pattern', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      hostPermissions: ['https://*/*'],
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(true)
    expect(r.warnings[0]).toContain('https://*/*')
  })

  it('errors when hooks are declared but hostPermissions is empty', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      contributes: { hooks: { beforeCreate: { role: 'enrich' } } },
      hostPermissions: [],
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('host_permissions_required_for_hooks')
  })

  it('does NOT require hostPermissions when no hooks are declared', async () => {
    plant({
      manifestVersion: 1,
      id: 'alice.demo',
      contributes: {
        commands: [{ id: 'alice.demo.cmd', title: 'Cmd' }],
      },
    })
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(true)
  })

  it('errors when manifest file is missing', async () => {
    const r = await validateHostPermissions(path.join(dir, 'nonexistent'))
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('failed to read')
  })

  it('errors on malformed JSON', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'motrix-plugin.json'), '{ not json')
    const r = await validateHostPermissions(dir)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('not valid JSON')
  })
})
