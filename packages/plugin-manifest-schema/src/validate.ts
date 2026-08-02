// packages/plugin-manifest-schema/src/validate.ts
//
// Pack-time validation shared by every pipeline that produces a `.moext`:
//
//   @motrix/plugin-cli            community authors — `validate` / `pack`
//   motrixapp/builtin-plugins     signed builtin releases — scripts/pack.mjs
//
// WHY THIS LIVES IN THE SCHEMA PACKAGE
// ------------------------------------
// These are cross-field and asset-level rules that ManifestSchema deliberately
// does not encode (Zod validates one manifest object; these need a second field
// or a locale file to decide). Historically each pipeline carried its own
// partial copy, and the copies drifted in opposite directions:
//
//   * plugin-cli's `pack` ran ManifestSchema.parse + locale coverage, but NOT
//     the hooks => hostPermissions invariant — that rule sat in a separate,
//     non-default `validate-host-permissions` subcommand, so a plain
//     `motrix-plugin pack` happily produced a `.moext` the host refuses to
//     install.
//   * builtin-plugins' pack.mjs ran ManifestSchema.parse + hooks =>
//     hostPermissions (added after motrix.filename-template@1.1.0 shipped
//     signed and uninstallable), but NOT locale coverage — a missing locale
//     file was swallowed by a bare `catch {}` and shipped as literal `%name%`
//     in the UI.
//
// builtin-plugins could not simply import the CLI's copy: @motrix/plugin-cli
// publishes a bin-only bundle (no main/exports), so the rule was reproduced by
// hand there. This package IS importable and builtin-plugins already depends on
// it — so the rules live here, and both pipelines import the same code.
//
// CONSTRAINT: this module stays free of `node:fs` and every other Node builtin.
// The package is a pure Zod schema usable in a browser; callers own all I/O and
// hand in already-read data (see checkLocaleCoverage).

import { ManifestSchema, type ManifestZodOutput } from './schema'

/**
 * Canonical error codes. The host emits the same strings at install time, so
 * pack-time failures and install-time refusals are greppable as one identifier.
 */
export const HOST_PERMISSIONS_REQUIRED_FOR_HOOKS =
  'plugin.manifest.host_permissions_required_for_hooks'
export const LOCALE_MISSING_EN_US = 'plugin.manifest.locale.missing_en_us'
export const LOCALE_MISSING_KEYS = 'plugin.manifest.locale.missing_keys'

/** Shape accepted by the cross-field checks — a parsed manifest, or less. */
type HookBearingManifest = Pick<ManifestZodOutput, 'contributes'> & {
  hostPermissions?: unknown
}

/**
 * The hooks => hostPermissions invariant.
 *
 * A manifest that contributes any hook must declare at least one host
 * permission. The host enforces this in its own parse step and refuses to
 * install otherwise, so producing such a bundle is always a packaging bug.
 *
 * Exported separately from {@link validateManifest} so callers that only have a
 * raw (unparsed) manifest — e.g. a lint pass that wants to report several
 * problems at once rather than throwing on the first — can still apply it.
 *
 * @throws Error when hooks are declared with an empty/absent hostPermissions.
 */
export function requireHostPermissionsForHooks(
  manifest: HookBearingManifest,
  id = '<unknown>'
): void {
  const hooks = manifest.contributes?.hooks
  const hasHooks = hooks != null && Object.keys(hooks).length > 0
  if (!hasHooks) return
  const hostPermissions = Array.isArray(manifest.hostPermissions)
    ? manifest.hostPermissions
    : []
  if (hostPermissions.length === 0) {
    throw new Error(
      `${id}: ${HOST_PERMISSIONS_REQUIRED_FOR_HOOKS}: declared hooks require at least one hostPermissions entry`
    )
  }
}

/**
 * Full manifest gate: schema structure plus every cross-field invariant.
 *
 * Note on hook roles: the schema validates the role *name* only. `pre-resolve`
 * parses fine here because builtin-only eligibility is a host-side rule keyed
 * on the plugin's origin, not something a manifest can express.
 *
 * @param manifest parsed `motrix-plugin.json` contents
 * @param id       used only to prefix error messages; defaults to the
 *                 manifest's own id when it has one
 * @returns the schema-parsed manifest
 * @throws Error with a human-readable, id-prefixed message on first violation
 */
export function validateManifest(
  manifest: unknown,
  id?: string
): ManifestZodOutput {
  const label =
    id ??
    (typeof (manifest as { id?: unknown })?.id === 'string'
      ? (manifest as { id: string }).id
      : '<unknown>')
  let parsed: ManifestZodOutput
  try {
    parsed = ManifestSchema.parse(manifest)
  } catch (err) {
    const issues = (err as { issues?: { path: unknown[]; message: string }[] })
      .issues
    const detail = Array.isArray(issues)
      ? issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ')
      : ((err as Error)?.message ?? String(err))
    throw new Error(`${label}: invalid motrix-plugin.json — ${detail}`)
  }
  requireHostPermissionsForHooks(parsed, label)
  return parsed
}

/**
 * Flatten a parsed locale JSON object into the dotted keys a manifest may
 * reference. `{ settings: { title: "x" } }` yields `settings.title`. Only
 * string leaves count — an object leaf is a namespace, not a translation.
 */
export function flattenLocaleKeys(
  source: Record<string, unknown>,
  prefix = '',
  out: Set<string> = new Set()
): Set<string> {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.add(path)
    else if (value && typeof value === 'object') {
      flattenLocaleKeys(value as Record<string, unknown>, path, out)
    }
  }
  return out
}

/**
 * Collect every `%key%` placeholder anywhere in the manifest.
 *
 * Deliberately a full recursive walk rather than a fixed list of translatable
 * fields. The previous fixed-list implementation checked only `name`,
 * `description` and `contributes.commands[].title`, which silently skipped
 * `contributes.configuration` — on a real plugin that is half the placeholders
 * in the file, and a missing one renders as a literal `%settings.title%` in the
 * settings UI. Walking everything also means new contribution points are
 * covered the day they are added, with no change here.
 *
 * Only whole-string placeholders (`"%foo%"`) count, matching how the host
 * resolves them; a value that merely contains a percent sign is left alone.
 */
export function collectLocaleRefs(manifest: unknown): string[] {
  const found = new Set<string>()
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const m = node.match(/^%([^%]+)%$/)
      if (m) found.add(m[1])
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value)
    }
  }
  walk(manifest)
  return [...found]
}

/**
 * Assert every `%key%` the manifest references exists in the base locale.
 *
 * I/O stays with the caller: pass the already-parsed `en-US.json` contents (or
 * `null` when the file is absent) so this package needs no filesystem access.
 * `en-US` is the required base locale — other locales may be partial and fall
 * back to it, so they are not checked here.
 *
 * A manifest with no `l10n` directory opts out of localization entirely and is
 * skipped. Once `l10n` IS declared the base locale becomes mandatory even if
 * the manifest itself interpolates nothing — plugin code reaches the same
 * catalogue through the runtime `t()` helper, which this module cannot see.
 *
 * @throws Error carrying {@link LOCALE_MISSING_EN_US} or
 *         {@link LOCALE_MISSING_KEYS}
 */
export function checkLocaleCoverage(
  manifest: Pick<ManifestZodOutput, 'l10n'> & Record<string, unknown>,
  baseLocale: Record<string, unknown> | null
): void {
  if (!manifest.l10n) return
  if (baseLocale == null) throw new Error(LOCALE_MISSING_EN_US)
  const refs = collectLocaleRefs(manifest)
  if (refs.length === 0) return
  const available = flattenLocaleKeys(baseLocale)
  const missing = refs.filter((key) => !available.has(key))
  if (missing.length > 0) {
    throw new Error(`${LOCALE_MISSING_KEYS}: ${missing.sort().join(', ')}`)
  }
}
