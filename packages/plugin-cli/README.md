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
the same schema the Motrix host uses when installing a plugin. Beyond the
schema this also applies the rules a schema cannot express:

- **hooks ⇒ hostPermissions** — contributing any hook requires at least one
  `hostPermissions` entry, or the host refuses to install the plugin
- **locale coverage** — every `%key%` the manifest interpolates must exist in
  `en-US`, including the ones under `contributes.configuration`

`pack` runs this identical gate, so the two commands can never disagree about
whether a plugin is shippable.

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
Static checks on the **packed bundle**, so run `pack` first: top-level
side-effect detection (guest code must not run effectful code at module
scope), a size warning as the bundle approaches the 1 MiB cap, and advisories
for `invokesCommands` entries whose callee may not be installed.

```bash
motrix-plugin validate-host-permissions
```
Reviews `hostPermissions` in more depth than `validate` does: each pattern is
parsed with the host's own match-pattern grammar, and broad grants
(`<all_urls>`, `https://*/*`) are reported as warnings so you can narrow them.

```bash
motrix-plugin pack
```
Produce the `.moext` distributable at `dist/<id>-<version>.moext`.

Every gate — schema, hooks ⇒ hostPermissions, locale coverage — runs *before*
esbuild writes anything, so a rejected plugin leaves no half-built bundle
behind and a `.moext` the host would refuse to install cannot be created in the
first place. The bundle is then checked against the 1 MiB cap and the archive
against 5 MiB.

The archive is **reproducible**: entries are written in sorted order with
pinned timestamps and modes, so the same source tree always yields the same
bytes, on any machine and in any timezone. `pack` prints the resulting sha256 —
that is the value a registry entry's `package.sha256` needs, and re-packing an
unchanged tree must reprint it.

```
Packed → …/dist/acme.demo-1.0.0.moext (4540 bytes)
sha256   5d69eaf3bb44992952beafc67d818ff376b8478de4b32b936ce5e603b963605d
```

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
