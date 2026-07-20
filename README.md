# Motrix Plugin SDK

**English** · [简体中文](./README.zh-CN.md)

This repository holds the plugin-authoring SDK for [Motrix](https://motrix.app):
four packages that let third-party authors build, validate, and package
Motrix plugins. It was extracted from the `motrix-turbo` app monorepo — see
`motrix-turbo/docs/superpowers/specs/2026-07-20-plugin-sdk-repo-extraction-design.md`
for the extraction rationale — so the SDK can be versioned and published on
its own cadence, independent of app releases.

## Packages

| Package | npm name | Role |
|---|---|---|
| `packages/plugin-manifest-schema` | `@motrix/plugin-manifest-schema` | [Zod](https://zod.dev) schema for the plugin manifest (`motrix-plugin.json`) — the single source of truth for its shape |
| `packages/plugin-api` | `@motrix/plugin-api` | Guest-facing types for plugin authors, plus the `motrix:plugin-api` virtual-module ambient declaration plugins import at runtime |
| `packages/plugin-cli` | `@motrix/plugin-cli` | The `motrix-plugin` CLI — `init` / `validate` / `lint` / `pack` / `dev` — and inlines the manifest schema into its own build |
| `packages/create-motrix-plugin` | `create-motrix-plugin` | The `pnpm create motrix-plugin` scaffolder; delegates to `plugin-cli` |

## Dependency chain

```
plugin-manifest-schema ← plugin-cli ← create-motrix-plugin
plugin-api (standalone)
```

`plugin-cli` depends on `plugin-manifest-schema` as a **devDependency** only —
it inlines the schema into its own bundle at build time (tsup `noExternal`),
so installing `@motrix/plugin-cli` never pulls in `@motrix/plugin-manifest-schema`
as a separate runtime dependency. `create-motrix-plugin` depends on
`plugin-cli` as a normal runtime dependency, and is bin-only (no build step).
`plugin-api` has no internal dependency on the other three.

Inside this repo these are declared as `workspace:*`; pnpm rewrites them to
real version ranges when each package is published.

## Development

```bash
pnpm install
pnpm build              # pnpm -r build — builds every package
pnpm typecheck          # pnpm -r typecheck
pnpm test               # pnpm -r test
pnpm lint               # biome check .
pnpm run check:facade   # verifies the manifest-schema façade (see below)
```

## The manifest-schema façade rule

`packages/plugin-cli/src/manifest-schema.ts` must remain a pure re-export —
`export * from '@motrix/plugin-manifest-schema'` — and nothing more.
`scripts/check-facade.mjs` enforces this and runs in CI. If you need to
change manifest validation behavior, make the change in
`packages/plugin-manifest-schema/`, never in the façade file.

## Release

Publishing is **human-run**: `pnpm publish` per package, in dependency order —
`plugin-manifest-schema` → `plugin-api` → `plugin-cli` → `create-motrix-plugin`.
There is no artifact signing in this repo; the Ed25519 `.moext` signing
pipeline that signs plugin bundles belongs to the `builtin-plugins` repo, not
to npm packages published from here.

## Consumers

- External plugin authors, who install these packages from npm to build
  their own plugins.
- `motrix-turbo` — the Motrix app depends on `@motrix/plugin-manifest-schema`
  through a host validator façade (guarded by its own `check:schema-parity`
  check) and on `@motrix/plugin-cli` for its `examples:pack` script. A schema
  change here means: publish a new version from this repo, then bump the
  dependency in `motrix-turbo`, then its `check:schema-parity` must pass.
- The `builtin-plugins` repo, which depends on `@motrix/plugin-api`.

## License

MIT — see [LICENSE](./LICENSE).
