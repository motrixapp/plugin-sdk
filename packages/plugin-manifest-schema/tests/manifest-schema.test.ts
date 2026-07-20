import { describe, expect, it } from 'vitest'
import { ManifestSchema } from '../src'

const BASE_MANIFEST = {
  manifestVersion: 1 as const,
  id: 'acme.downloader',
  name: 'Acme Downloader',
  version: '1.0.0',
  description: 'A test plugin for Motrix.',
  categories: ['productivity'] as ['productivity'],
  engines: { motrix: '>=2.0.0' },
  main: 'dist/index.js',
  permissions: [],
  activationEvents: ['onAppReady'],
  contributes: {},
}

describe('ManifestSchema', () => {
  it('parses a complete valid manifest with all optional fields', () => {
    const input = {
      ...BASE_MANIFEST,
      $schema: 'https://motrix.app/schemas/plugin-manifest.json',
      author: 'Acme Corp',
      homepage: 'https://example.com',
      repository: 'https://github.com/acme/downloader',
      license: 'MIT',
      icon: 'assets/icon.png',
      keywords: ['download', 'acme'],
      engines: { motrix: '>=2.0.0', ffmpeg: '>=6.0.0' },
      requestedHeapMB: 48,
      permissions: ['network.http'],
      optionalPermissions: ['ui.badge'],
      hostPermissions: ['https://*.example.com/*'],
      invokesCommands: ['acme.downloader.utils.helper'],
      l10n: 'l10n',
      contributes: {
        commands: [
          {
            id: 'acme.downloader.core.start',
            title: 'Start Download',
            icon: 'play',
            public: true,
            argsSchema: { type: 'object' as const },
            resultSchema: { type: 'object' as const },
          },
        ],
      },
    }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses a minimal valid manifest with only required fields', () => {
    const result = ManifestSchema.safeParse(BASE_MANIFEST)
    expect(result.success).toBe(true)
  })

  it('rejects a public command without argsSchema and resultSchema', () => {
    const input = {
      ...BASE_MANIFEST,
      contributes: {
        commands: [
          {
            id: 'acme.downloader.core.start',
            title: 'Start Download',
            public: true,
          },
        ],
      },
    }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => i.message) ?? []
    expect(messages.some((m) => m.includes('public_missing_schema'))).toBe(true)
  })

  it('rejects a command list with 33 public commands', () => {
    const publicCmd = (n: number) => ({
      id: `acme.downloader.core.cmd${n.toString().padStart(3, '0')}`,
      title: `Command ${n}`,
      public: true,
      argsSchema: { type: 'object' as const },
      resultSchema: { type: 'object' as const },
    })
    const input = {
      ...BASE_MANIFEST,
      contributes: {
        commands: Array.from({ length: 33 }, (_, i) => publicCmd(i + 1)),
      },
    }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => i.message) ?? []
    expect(messages.some((m) => m.includes('too_many_public'))).toBe(true)
  })

  it('rejects a permission from KNOWN_AUTO_INJECTED ("log")', () => {
    const input = { ...BASE_MANIFEST, permissions: ['log'] }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => i.message) ?? []
    expect(messages.some((m) => m.includes('auto-injected'))).toBe(true)
  })

  it('rejects an id with uppercase characters', () => {
    const input = { ...BASE_MANIFEST, id: 'Acme.Downloader' }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts a reserved publisher at the schema layer (reservation is enforced by validate())', () => {
    const input = { ...BASE_MANIFEST, id: 'motrix.downloader' }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects an id without a dot separator', () => {
    const input = { ...BASE_MANIFEST, id: 'acmedownloader' }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid version (not semver)', () => {
    const input = { ...BASE_MANIFEST, version: 'not-semver' }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects unknown top-level keys (strict mode)', () => {
    const input = { ...BASE_MANIFEST, unknownField: 'surprise' }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects a BoundedJsonSchema with disallowed key ($ref)', () => {
    const input = {
      ...BASE_MANIFEST,
      contributes: {
        commands: [
          {
            id: 'acme.downloader.core.start',
            title: 'Start Download',
            public: true,
            argsSchema: { $ref: '#/definitions/Foo' },
            resultSchema: { type: 'object' as const },
          },
        ],
      },
    }
    const result = ManifestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts contributes.configuration with a standard object schema', () => {
    const input = {
      ...BASE_MANIFEST,
      contributes: {
        configuration: {
          title: 'Settings',
          schema: {
            type: 'object' as const,
            properties: {
              preferredQuality: {
                type: 'string' as const,
                enum: ['360p', '480p', '720p'],
                default: '720p',
              },
            },
            additionalProperties: false,
          },
        },
      },
    }

    const result = ManifestSchema.safeParse(input)

    expect(result.success).toBe(true)
  })

  it('rejects contributes.configuration when schema is a field map', () => {
    const input = {
      ...BASE_MANIFEST,
      contributes: {
        configuration: {
          schema: {
            preferredQuality: {
              type: 'string' as const,
              enum: ['360p', '480p', '720p'],
              default: '720p',
            },
          },
        },
      },
    }

    const result = ManifestSchema.safeParse(input)

    expect(result.success).toBe(false)
  })
})
