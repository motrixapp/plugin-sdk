# @motrix/plugin-manifest-schema

The single source of truth for the [Motrix](https://motrix.app) plugin
manifest (`motrix-plugin.json`) — a [Zod](https://zod.dev) schema and its
inferred TypeScript types, plus the validation rules every tool that produces
a `.moext` must apply.

Every place that needs to validate or type a plugin manifest re-exports from
this package rather than redefining the shape:

- `src/core/plugin/manifest/schema.ts` — the runtime validator used by the
  Motrix host (Electron + server shells) when installing/loading a plugin
- `packages/plugin-cli/src/manifest-schema.ts` — used by
  [`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)'s
  `validate`/`lint`/`pack` commands

Both façades are pure `export * from '@motrix/plugin-manifest-schema'`
re-exports, checked in CI (`pnpm run check:facade`) so the manifest shape can
never drift between the CLI and the host.

## Install

```bash
pnpm add @motrix/plugin-manifest-schema
```

## Usage

```ts
import { ManifestSchema } from '@motrix/plugin-manifest-schema'

const result = ManifestSchema.safeParse(manifestJson)
if (!result.success) {
  console.error(result.error.issues)
}
```

`ManifestSchema` enforces `manifestVersion`, plugin id / command id formats,
semver ranges for `engines`, bounded contribution shapes
(`BoundedJsonSchemaTopLevel` for `contributes.commands[].argsSchema` /
`resultSchema` / `contributes.configuration.schema`), and the
`activationEvents` / `permissions` / `hostPermissions` arrays a manifest may
declare. See the exported `ManifestZodOutput` type for the full inferred
shape.

## Pack-time validation

Some rules cannot be expressed as a schema: they span two fields, or they need
a file the manifest only points at. They live here too, so that every pipeline
producing a `.moext` — `@motrix/plugin-cli` for community authors, the
`builtin-plugins` release scripts for the bundled plugins — applies exactly the
same gate.

```ts
import {
  validateManifest,
  checkLocaleCoverage,
} from '@motrix/plugin-manifest-schema'

// Schema parse + every cross-field invariant. Throws with an id-prefixed
// message; returns the parsed manifest on success.
const manifest = validateManifest(JSON.parse(raw))

// Placeholder coverage. You read the files; this package stays I/O-free.
checkLocaleCoverage(manifest, JSON.parse(enUsJson))
```

| Export | Rule |
|---|---|
| `validateManifest(manifest, id?)` | `ManifestSchema.parse` plus the invariants below |
| `requireHostPermissionsForHooks(manifest, id?)` | A manifest contributing any hook must declare ≥1 `hostPermissions` entry — the host refuses to install otherwise |
| `checkLocaleCoverage(manifest, baseLocale)` | Every `%key%` the manifest interpolates exists in `en-US`. Pass the parsed catalogue, or `null` when absent |
| `collectLocaleRefs(manifest)` | The `%key%` placeholders found anywhere in the manifest |
| `flattenLocaleKeys(catalogue)` | A locale object flattened to dotted keys |

Failures carry stable error codes — `HOST_PERMISSIONS_REQUIRED_FOR_HOOKS`,
`LOCALE_MISSING_EN_US`, `LOCALE_MISSING_KEYS` — also exported, and identical to
the codes the host emits at install time.

This module performs no I/O and imports no Node built-ins, so it runs anywhere
the schema does.

## Learn more

- Scaffold a manifest with [`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)
  (`motrix-plugin init`)
- Design background: `docs/superpowers/specs/2026-04-10-plugin-system-design.md`
  and `docs/superpowers/plans/2026-05-16-extract-plugin-manifest-schema-package.md`
  in the [motrix-turbo](https://gitlab.com/agalwood/motrix-turbo) repository
