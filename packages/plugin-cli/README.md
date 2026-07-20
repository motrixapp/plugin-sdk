# @motrix/plugin-cli

Command-line developer tools for authoring, validating, and packaging
[Motrix](https://motrix.app) plugins.

Ships two bins:

- **`motrix-plugin`** — the main developer tool (init/dev/validate/lint/pack)
- **`create-motrix-plugin`** — a thin scaffolder invoked via `pnpm create motrix-plugin`

## Install

```bash
pnpm add -D @motrix/plugin-cli
# or run without installing:
pnpm dlx @motrix/plugin-cli init my-plugin
```

## Commands

```bash
motrix-plugin init <name> [-t basic-resolver|post-action] [-p <publisher>]
```
Scaffold a new plugin project from a template (`basic-resolver` or
`post-action`) into `./<name>`.

```bash
motrix-plugin dev
```
Watch-build the plugin with esbuild and relaunch a local Motrix install
against it (found via `$MOTRIX_BIN` or a standard Motrix install location).

```bash
motrix-plugin validate
```
Validate `motrix-plugin.json` against
[`@motrix/plugin-manifest-schema`](https://www.npmjs.com/package/@motrix/plugin-manifest-schema) —
the same schema the Motrix host uses when installing a plugin.

### Schema versioning

`validate` checks your manifest against the `@motrix/plugin-manifest-schema`
version **embedded in the CLI at build time** — not whatever copy of the
schema your own project has installed. Keep `@motrix/plugin-cli` up to date
so its embedded schema matches the Motrix host you're targeting; schema
releases always ship together with a matching CLI release (lockstep), so
staying current on the CLI keeps you current on the schema too.

```bash
motrix-plugin lint
```
Static checks beyond schema validation: locale coverage
(`contributes`/UI strings present in every declared locale) and
top-level side-effect detection (guest code must not run effectful code at
module scope).

```bash
motrix-plugin validate-host-permissions
```
Sanity-check `hostPermissions` match patterns and warn on overly broad grants
(e.g. `<all_urls>`).

```bash
motrix-plugin pack
```
Bundle the plugin with esbuild and zip it into a `.moext` distributable,
enforcing the per-bundle and total package size limits.

```bash
pnpm create motrix-plugin my-plugin [template]
```
Equivalent to `motrix-plugin init`, usable without a prior install via the
`create-*` npm convention.

## Learn more

- Manifest shape reference: [`@motrix/plugin-manifest-schema`](https://www.npmjs.com/package/@motrix/plugin-manifest-schema)
- Plugin runtime types: [`@motrix/plugin-api`](https://www.npmjs.com/package/@motrix/plugin-api)
- Design background: `docs/superpowers/specs/2026-05-09-plugin-ecosystem-design.md`
  in the [motrix-turbo](https://gitlab.com/agalwood/motrix-turbo) repository
