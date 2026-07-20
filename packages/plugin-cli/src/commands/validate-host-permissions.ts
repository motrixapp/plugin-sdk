// Spec §2 L321 — `motrix-plugin validate-host-permissions` lints the
// hostPermissions array in motrix-plugin.json:
//   - parses each pattern with the same regex the host uses
//   - flags `<all_urls>` and `https://*/*` as "broad access" warnings so
//     authors narrow them where possible (see spec L298-300)
//   - emits an error if any pattern is malformed or uses a forbidden scheme
//   - emits an error if hooks are declared but hostPermissions is empty
//     (mirrors the install-time invariant introduced in audit-Batch-1 M1)

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { MATCH_PATTERN_RE } from '../manifest-schema'

export interface ValidateHostPermissionsResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

interface RawManifest {
  hostPermissions?: unknown
  contributes?: { hooks?: Record<string, unknown> }
}

const BROAD_PATTERNS = new Set(['<all_urls>', 'https://*/*', 'http://*/*'])

export async function validateHostPermissions(
  projectDir: string
): Promise<ValidateHostPermissionsResult> {
  const manifestPath = path.join(projectDir, 'motrix-plugin.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (e: unknown) {
    return {
      ok: false,
      errors: [`failed to read ${manifestPath}: ${(e as Error).message}`],
      warnings: [],
    }
  }

  let parsed: RawManifest
  try {
    parsed = JSON.parse(raw) as RawManifest
  } catch (e: unknown) {
    return {
      ok: false,
      errors: [`motrix-plugin.json is not valid JSON: ${(e as Error).message}`],
      warnings: [],
    }
  }

  const errors: string[] = []
  const warnings: string[] = []

  const patterns = Array.isArray(parsed.hostPermissions)
    ? parsed.hostPermissions
    : []
  const hasHooks =
    parsed.contributes?.hooks &&
    Object.keys(parsed.contributes.hooks).length > 0

  if (hasHooks && patterns.length === 0) {
    errors.push(
      'plugin.manifest.host_permissions_required_for_hooks: declared hooks require at least one hostPermissions entry'
    )
  }

  for (const [i, pattern] of patterns.entries()) {
    if (typeof pattern !== 'string') {
      errors.push(`hostPermissions[${i}] is not a string`)
      continue
    }
    if (pattern === '<all_urls>') {
      warnings.push(
        `hostPermissions[${i}] = "<all_urls>" — broad host access; consent dialog highlights this. Narrow to specific hosts where possible.`
      )
      continue
    }
    if (!MATCH_PATTERN_RE.test(pattern)) {
      errors.push(
        `hostPermissions[${i}] = "${pattern}" does not match the Chrome MV3 pattern grammar`
      )
      continue
    }
    if (BROAD_PATTERNS.has(pattern)) {
      warnings.push(
        `hostPermissions[${i}] = "${pattern}" — broad host access; narrow to specific domains where possible.`
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
