import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { init } from '../src/commands/init'
import { lint } from '../src/commands/lint'
import { pack } from '../src/commands/pack'
import { validate } from '../src/commands/validate'
import { checkLocaleCoverage, ManifestSchema } from '../src/manifest-schema'

const require = createRequire(import.meta.url)
const sdkRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..')

describe('operation template', () => {
  let parent: string
  let project: string

  beforeEach(async () => {
    parent = mkdtempSync(path.join(os.tmpdir(), 'operation-template-'))
    const result = await init({
      projectName: 'line-cleaner',
      publisher: 'alice',
      template: 'operation',
      destDir: parent,
    })
    project = result.created
  })

  afterEach(() => rmSync(parent, { recursive: true, force: true }))

  it('generates a localized private operation with consistent identities and file bindings', async () => {
    const read = (file: string) =>
      readFileSync(path.join(project, file), 'utf8')
    const manifest = ManifestSchema.parse(
      JSON.parse(read('motrix-plugin.json'))
    )
    expect(await validate(project)).toEqual({ ok: true })
    expect(manifest.id).toBe('alice.line-cleaner')
    expect(manifest.engines.motrix).toBe('>=2.0.0-beta.48 <3.0.0')
    expect(manifest.permissions).toEqual([
      'files.selected.read',
      'files.selected.write',
    ])
    expect(manifest.contributes.hooks).toBeUndefined()
    expect(manifest.activationEvents).toEqual([
      'onCommand:alice.line-cleaner.deduplicate',
    ])
    expect(manifest.contributes.commands?.[0]).toMatchObject({
      id: 'alice.line-cleaner.deduplicate',
      execution: 'operation',
      public: false,
    })
    expect(manifest.contributes.operations?.items[0]).toMatchObject({
      id: 'alice.line-cleaner.deduplicate',
      command: 'alice.line-cleaner.deduplicate',
      result: { fields: ['lines'], files: ['output'] },
      ui: { repeat: 'preserve-inputs' },
    })
    expect(read('src/index.ts')).toContain("'alice.line-cleaner.deduplicate'")
    for (const locale of ['en-US', 'zh-CN']) {
      const dictionary = JSON.parse(read(`locales/${locale}.json`))
      expect(dictionary.name).toBe('line-cleaner')
      expect(() => checkLocaleCoverage(manifest, dictionary)).not.toThrow()
    }
    for (const file of [
      'motrix-plugin.json',
      'src/index.ts',
      'locales/en-US.json',
      'locales/zh-CN.json',
      'package.json',
      'tsconfig.json',
      'esbuild.config.mjs',
      'README.md',
      'README.zh-CN.md',
      '.gitignore',
    ]) {
      expect(read(file), file).not.toMatch(/\{\{[A-Z_]+\}\}/)
    }
    expect(read('.gitignore')).toContain('dist/')
    expect(read('.gitignore')).toContain('node_modules/')
  })

  it('typechecks as a standalone project against the built API package files', () => {
    // Match the npm package file layout, without a network install or a
    // checkout-relative ambient declaration that could mask a broken tsconfig.
    const installed = path.join(project, 'node_modules/@motrix/plugin-api')
    mkdirSync(installed, { recursive: true })
    const api = path.join(sdkRoot, 'packages/plugin-api')
    for (const file of ['package.json', 'dist', 'src/virtual-module.d.ts']) {
      cpSync(path.join(api, file), path.join(installed, file), {
        recursive: true,
      })
    }
    const config = JSON.parse(
      readFileSync(path.join(project, 'tsconfig.json'), 'utf8')
    )
    expect(config.compilerOptions.types).toEqual(['@motrix/plugin-api'])
    expect(config.include).toEqual(['src'])
    const pkg = JSON.parse(
      readFileSync(path.join(project, 'package.json'), 'utf8')
    )
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit')
    expect(pkg.scripts.validate).toBe('motrix-plugin validate')
    expect(pkg.scripts.lint).toBe('motrix-plugin lint')
    const typescriptPackage = require.resolve('typescript/package.json')
    const { bin } = JSON.parse(readFileSync(typescriptPackage, 'utf8'))
    const tsc = path.resolve(path.dirname(typescriptPackage), bin.tsc)
    execFileSync(process.execPath, [tsc, '--noEmit'], {
      cwd: project,
      stdio: 'pipe',
    })
  })

  it('packs and lints without adding permissions or editing generated source', async () => {
    const result = await pack({ projectDir: project })
    expect(result.outFile).toBe(
      path.join(project, 'dist/alice.line-cleaner-0.1.0.moext')
    )
    expect(result.totalSize).toBeGreaterThan(0)
    expect(await lint(project)).toEqual({ warnings: [], errors: [] })
  })
})
