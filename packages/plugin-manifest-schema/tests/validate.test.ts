import { describe, expect, it } from 'vitest'
import {
  checkLocaleCoverage,
  collectLocaleRefs,
  flattenLocaleKeys,
  HOST_PERMISSIONS_REQUIRED_FOR_HOOKS,
  LOCALE_MISSING_EN_US,
  LOCALE_MISSING_KEYS,
  requireHostPermissionsForHooks,
  validateManifest,
} from '../src'

const BASE_MANIFEST = {
  manifestVersion: 1 as const,
  id: 'acme.downloader',
  name: 'Acme Downloader',
  version: '1.0.0',
  description: 'A test plugin for Motrix.',
  categories: ['productivity'] as ['productivity'],
  engines: { motrix: '>=2.0.0' },
  main: 'dist/plugin.js',
  permissions: [],
  activationEvents: ['onAppReady'],
  contributes: {},
}

const WITH_HOOKS = {
  ...BASE_MANIFEST,
  contributes: { hooks: { beforeCreate: { role: 'resolve' as const } } },
}

describe('validateManifest', () => {
  it('returns the parsed manifest for a valid input', () => {
    const parsed = validateManifest(BASE_MANIFEST)
    expect(parsed.id).toBe('acme.downloader')
  })

  it('prefixes schema errors with the manifest id', () => {
    expect(() =>
      validateManifest({ ...BASE_MANIFEST, version: 'not-semver' })
    ).toThrowError(/^acme\.downloader: invalid motrix-plugin\.json — /)
  })

  it('prefixes with an explicit id when one is passed', () => {
    expect(() =>
      validateManifest({ ...BASE_MANIFEST, version: 'nope' }, 'dir-name')
    ).toThrowError(/^dir-name: /)
  })

  it('falls back to <unknown> when the manifest has no usable id', () => {
    expect(() => validateManifest({ nonsense: true })).toThrowError(
      /^<unknown>: /
    )
  })

  // The regression that shipped as motrix.filename-template@1.1.0: signed,
  // released, and uninstallable on every host.
  it('rejects declared hooks with no hostPermissions', () => {
    expect(() => validateManifest(WITH_HOOKS)).toThrowError(
      new RegExp(HOST_PERMISSIONS_REQUIRED_FOR_HOOKS)
    )
  })

  it('rejects declared hooks with an empty hostPermissions array', () => {
    expect(() =>
      validateManifest({ ...WITH_HOOKS, hostPermissions: [] })
    ).toThrowError(new RegExp(HOST_PERMISSIONS_REQUIRED_FOR_HOOKS))
  })

  it('accepts declared hooks with at least one hostPermission', () => {
    const parsed = validateManifest({
      ...WITH_HOOKS,
      hostPermissions: ['*://*.example.com/*'],
    })
    expect(parsed.contributes.hooks?.beforeCreate?.role).toBe('resolve')
  })

  it('accepts a manifest with no hooks and no hostPermissions', () => {
    expect(() => validateManifest(BASE_MANIFEST)).not.toThrow()
  })
})

describe('requireHostPermissionsForHooks', () => {
  it('is a no-op when contributes declares an empty hooks object', () => {
    expect(() =>
      requireHostPermissionsForHooks({ contributes: { hooks: {} } })
    ).not.toThrow()
  })

  it('throws with the given id prefix', () => {
    expect(() =>
      requireHostPermissionsForHooks(
        { contributes: { hooks: { onError: { role: 'audit' } } } },
        'motrix.example'
      )
    ).toThrowError(/^motrix\.example: /)
  })
})

describe('flattenLocaleKeys', () => {
  it('flattens nested objects into dotted paths', () => {
    const keys = flattenLocaleKeys({
      name: 'Acme',
      settings: { title: 'Settings', quality: { title: 'Quality' } },
    })
    expect([...keys].sort()).toEqual([
      'name',
      'settings.quality.title',
      'settings.title',
    ])
  })

  it('treats only string leaves as translation keys', () => {
    expect([...flattenLocaleKeys({ a: {}, b: 1, c: 'x' })]).toEqual(['c'])
  })
})

describe('collectLocaleRefs', () => {
  it('finds placeholders nested anywhere, including configuration', () => {
    const refs = collectLocaleRefs({
      name: '%name%',
      description: '%description%',
      contributes: {
        commands: [{ title: '%cmd.resolve%' }],
        configuration: {
          title: '%settings.title%',
          schema: {
            properties: {
              quality: {
                title: '%settings.quality.title%',
                description: '%settings.quality.desc%',
              },
            },
          },
        },
      },
    })
    expect(refs.sort()).toEqual([
      'cmd.resolve',
      'description',
      'name',
      'settings.quality.desc',
      'settings.quality.title',
      'settings.title',
    ])
  })

  // Guards the reason for the rewrite: the old fixed-list collector saw only
  // name/description/commands[].title and skipped every configuration string.
  it('covers configuration placeholders the fixed-list collector missed', () => {
    const refs = collectLocaleRefs({
      contributes: { configuration: { title: '%settings.title%' } },
    })
    expect(refs).toEqual(['settings.title'])
  })

  it('ignores strings that merely contain percent signs', () => {
    expect(collectLocaleRefs({ a: '100% done', b: 'a%b%c', c: '%%' })).toEqual(
      []
    )
  })

  it('deduplicates a placeholder used more than once', () => {
    expect(collectLocaleRefs({ a: '%name%', b: { c: '%name%' } })).toEqual([
      'name',
    ])
  })
})

describe('checkLocaleCoverage', () => {
  const manifest = {
    l10n: 'locales',
    name: '%name%',
    contributes: { configuration: { title: '%settings.title%' } },
  }

  it('passes when every placeholder resolves', () => {
    expect(() =>
      checkLocaleCoverage(manifest, {
        name: 'Acme',
        settings: { title: 'Settings' },
      })
    ).not.toThrow()
  })

  it('reports every missing key, sorted', () => {
    expect(() => checkLocaleCoverage(manifest, { name: 'Acme' })).toThrowError(
      `${LOCALE_MISSING_KEYS}: settings.title`
    )
  })

  it('throws when the base locale file is absent', () => {
    expect(() => checkLocaleCoverage(manifest, null)).toThrowError(
      LOCALE_MISSING_EN_US
    )
  })

  it('skips manifests that declare no l10n directory', () => {
    expect(() =>
      checkLocaleCoverage({ name: '%name%' } as never, null)
    ).not.toThrow()
  })

  // Declaring l10n makes the base locale mandatory even with zero placeholders
  // in the manifest: plugin code reads the same catalogue via t().
  it('still requires the base locale when nothing interpolates', () => {
    expect(() =>
      checkLocaleCoverage({ l10n: 'locales', name: 'Plain' }, null)
    ).toThrowError(LOCALE_MISSING_EN_US)
  })

  it('passes with an empty base locale when nothing interpolates', () => {
    expect(() =>
      checkLocaleCoverage({ l10n: 'locales', name: 'Plain' }, {})
    ).not.toThrow()
  })
})
