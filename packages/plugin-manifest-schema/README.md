# @motrix/plugin-manifest-schema

The single source of truth for the [Motrix](https://motrix.app) plugin
manifest (`motrix-plugin.json`) shape — a [Zod](https://zod.dev) schema plus
its inferred TypeScript types.

Every place that needs to validate or type a plugin manifest re-exports from
this package rather than redefining the shape:

- `src/core/plugin/manifest/schema.ts` — the runtime validator used by the
  Motrix host (Electron + server shells) when installing/loading a plugin
- `packages/plugin-cli/src/manifest-schema.ts` — used by
  [`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)'s
  `validate`/`lint`/`pack` commands

Both façades are pure `export * from '@motrix/plugin-manifest-schema'`
re-exports, checked in CI (`pnpm run check:schema-parity`) so the manifest
shape can never drift between the CLI and the host.

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

## Learn more

- Scaffold a manifest with [`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)
  (`motrix-plugin init`)
- Design background: `docs/superpowers/specs/2026-04-10-plugin-system-design.md`
  and `docs/superpowers/plans/2026-05-16-extract-plugin-manifest-schema-package.md`
  in the [motrix-turbo](https://gitlab.com/agalwood/motrix-turbo) repository
