// packages/plugin-cli/tests/init.test.ts

import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { init } from '../src/commands/init'
import { validateLocaleCoverage } from '../src/lint-rules/i18n-coverage'
import { ManifestSchema } from '../src/manifest-schema'

const EXPECTED_FILES = [
  'motrix-plugin.json',
  'package.json',
  'tsconfig.json',
  'esbuild.config.mjs',
  'src/index.ts',
  'README.md',
  'locales/en-US.json',
  'locales/zh-CN.json',
]

function getFilesRecursive(dir: string, base = dir): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getFilesRecursive(full, base))
    } else {
      results.push(path.relative(base, full))
    }
  }
  return results
}

describe('motrix-plugin init', () => {
  let destDir: string

  beforeEach(() => {
    destDir = mkdtempSync(path.join(os.tmpdir(), 'init-'))
  })

  it('basic-resolver: creates all expected files without .tpl extensions', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    expect(result.created).toBe(path.join(destDir, 'demo'))

    for (const file of EXPECTED_FILES) {
      expect(
        existsSync(path.join(result.created, file)),
        `missing: ${file}`
      ).toBe(true)
    }

    // No .tpl files should remain
    const allFiles = getFilesRecursive(result.created)
    const tplFiles = allFiles.filter((f) => f.endsWith('.tpl'))
    expect(tplFiles).toHaveLength(0)
  })

  it('post-action: creates all expected files without .tpl extensions', async () => {
    const result = await init({
      projectName: 'my-notifier',
      template: 'post-action',
      destDir,
      publisher: 'bob',
    })

    expect(result.created).toBe(path.join(destDir, 'my-notifier'))

    for (const file of EXPECTED_FILES) {
      expect(
        existsSync(path.join(result.created, file)),
        `missing: ${file}`
      ).toBe(true)
    }

    const allFiles = getFilesRecursive(result.created)
    const tplFiles = allFiles.filter((f) => f.endsWith('.tpl'))
    expect(tplFiles).toHaveLength(0)
  })

  it('template substitution: motrix-plugin.json has correct id and no unresolved vars', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    const manifest = JSON.parse(
      readFileSync(path.join(result.created, 'motrix-plugin.json'), 'utf8')
    )
    expect(manifest.id).toBe('alice.demo')

    const raw = readFileSync(
      path.join(result.created, 'motrix-plugin.json'),
      'utf8'
    )
    expect(raw).not.toContain('{{PLUGIN_ID}}')
    expect(raw).not.toContain('{{PROJECT_NAME}}')
    expect(raw).not.toContain('{{PUBLISHER}}')
  })

  it('template substitution: locales/en-US.json has name populated', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    const enUS = JSON.parse(
      readFileSync(path.join(result.created, 'locales/en-US.json'), 'utf8')
    )
    expect(enUS.name).toBe('demo')

    const raw = readFileSync(
      path.join(result.created, 'locales/en-US.json'),
      'utf8'
    )
    expect(raw).not.toContain('{{PROJECT_NAME}}')
  })

  it('basic-resolver: generated manifest passes ManifestSchema', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    const raw = readFileSync(
      path.join(result.created, 'motrix-plugin.json'),
      'utf8'
    )
    const parsed = ManifestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new Error(
        `ManifestSchema parse failed: ${JSON.stringify(parsed.error.issues, null, 2)}`
      )
    }
    expect(parsed.success).toBe(true)
  })

  it('post-action: generated manifest passes ManifestSchema', async () => {
    const result = await init({
      projectName: 'my-notifier',
      template: 'post-action',
      destDir,
      publisher: 'bob',
    })

    const raw = readFileSync(
      path.join(result.created, 'motrix-plugin.json'),
      'utf8'
    )
    const parsed = ManifestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      throw new Error(
        `ManifestSchema parse failed: ${JSON.stringify(parsed.error.issues, null, 2)}`
      )
    }
    expect(parsed.success).toBe(true)
  })

  it('basic-resolver: generated locales/en-US.json is valid JSON with name key', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    const raw = readFileSync(
      path.join(result.created, 'locales/en-US.json'),
      'utf8'
    )
    let parsed: unknown
    expect(() => {
      parsed = JSON.parse(raw)
    }).not.toThrow()
    expect((parsed as Record<string, unknown>).name).toBeTruthy()
  })

  it('basic-resolver: i18n coverage passes for generated project', async () => {
    const result = await init({
      projectName: 'demo',
      template: 'basic-resolver',
      destDir,
      publisher: 'alice',
    })

    const manifest = JSON.parse(
      readFileSync(path.join(result.created, 'motrix-plugin.json'), 'utf8')
    )
    const parsed = ManifestSchema.parse(manifest)
    await expect(
      validateLocaleCoverage(result.created, parsed)
    ).resolves.toBeUndefined()
  })

  it('post-action: i18n coverage passes for generated project', async () => {
    const result = await init({
      projectName: 'my-notifier',
      template: 'post-action',
      destDir,
      publisher: 'bob',
    })

    const manifest = JSON.parse(
      readFileSync(path.join(result.created, 'motrix-plugin.json'), 'utf8')
    )
    const parsed = ManifestSchema.parse(manifest)
    await expect(
      validateLocaleCoverage(result.created, parsed)
    ).resolves.toBeUndefined()
  })
})
