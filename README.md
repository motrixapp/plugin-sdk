# Motrix Plugin SDK

**English** | [简体中文](./README.zh-CN.md)

Build plugins for [Motrix](https://motrix.app), the open-source download
manager. Plugins hook into the download lifecycle — rewrite URLs before a
download starts, rename files before they land, react when they finish — and
run in an isolated JavaScript sandbox with a capability-based permission
model.

```bash
pnpm create motrix-plugin my-plugin
cd my-plugin && pnpm install
pnpm dev      # watch-build + launch Motrix with your plugin loaded
pnpm run pack # produce a distributable .moext
```

## What a plugin can do

- **Resolve**: intercept a download before it is created — rewrite URIs, set
  the filename, inject headers or a proxy (`beforeCreate`).
- **Post-process**: run after a download completes — rename via
  `beforeFinalize`, notify or hand off via `afterComplete`, react to failures
  via `onError`.
- **Contribute commands**: register callable commands other plugins (or the
  host) can invoke, with JSON-Schema-validated arguments.
- **Ship settings**: declare a configuration schema; users edit values in
  Motrix's UI, your code reads them via the `config` capability.

Plugins are TypeScript/JavaScript bundled to a single ES2020 module. They run
inside a sandbox — no Node.js APIs, no direct file or network access.
Everything reaches the outside world through capabilities you declare in the
manifest, and users see exactly what you asked for at install time.

## Quick start

```bash
pnpm create motrix-plugin my-plugin              # basic-resolver template
pnpm create motrix-plugin my-plugin post-action  # template as second argument
```

Templates:

| Template | Starts you with |
|---|---|
| `basic-resolver` (default) | A `beforeCreate` hook that inspects and rewrites downloads (`site-resolver` category) |
| `post-action` | An `afterComplete` hook that fires a desktop notification (`post-action` category) |

The scaffolded plugin id starts as `me.<name>`. Set your real publisher (the
`<publisher>.<name>` prefix) either by editing `id` in `motrix-plugin.json`,
or by scaffolding with the full CLI, which takes flags:

```bash
pnpm --package=@motrix/plugin-cli dlx motrix-plugin init my-plugin -t post-action -p acme
```

The scaffold:

```
my-plugin/
├── motrix-plugin.json      # the manifest — identity, permissions, hooks
├── src/index.ts            # your entry point
├── locales/                # en-US.json, zh-CN.json (UI strings)
├── esbuild.config.mjs      # standalone build (pack/dev bundle for you)
├── package.json            # scripts: build / pack / dev
└── tsconfig.json
```

Your first hook is already wired:

```ts
import { hooks, log } from 'motrix:plugin-api'

hooks.beforeCreate(async (ctx) => {
  log.info('resolving', { uri: ctx.uris[0] })
  // rewrite the download before it starts:
  // ctx.update({ filename: 'nicer-name.zip' })
  return ctx
})
```

## The dev loop

```bash
pnpm dev        # = motrix-plugin dev
```

`dev` watch-builds `src/index.ts` (inline sourcemaps) and launches your local
Motrix with the plugin loaded from your working directory. Edit code and the
bundle rebuilds; edit `motrix-plugin.json` or `locales/` and the host reloads
the plugin. Motrix is located automatically from the standard install paths,
or set `MOTRIX_BIN=/path/to/motrix` explicitly.

Then, before you ship:

```bash
pnpm exec motrix-plugin validate   # manifest against the official schema
pnpm run pack                      # minified bundle + .moext archive
pnpm exec motrix-plugin lint       # static checks on the packed bundle
```

(`pnpm run pack`, not `pnpm pack` — the bare form invokes pnpm's builtin
tarball command instead of the scaffold's script.)

## The manifest

`motrix-plugin.json` is your plugin's contract with the host. A minimal
resolver:

```json
{
  "manifestVersion": 1,
  "id": "acme.example-resolver",
  "name": "Example Resolver",
  "version": "0.1.0",
  "description": "Rewrites example.com download links",
  "categories": ["site-resolver"],
  "engines": { "motrix": ">=2.0.0 <3.0.0" },
  "main": "dist/plugin.js",
  "permissions": ["http"],
  "hostPermissions": ["https://example.com/*"],
  "activationEvents": ["onTaskType:http"],
  "contributes": {
    "hooks": { "beforeCreate": { "role": "resolve" } }
  },
  "l10n": "locales"
}
```

Field reference (enforced by `motrix-plugin validate`):

| Field | Rules |
|---|---|
| `id` | `<publisher>.<name>`, lowercase `a-z0-9-`. Publisher prefixes `motrix`, `verified`, `official`, `system` are reserved. |
| `version` | Semver (`1.2.3`, prerelease/build suffixes allowed). |
| `categories` | 1–8 of: `site-resolver`, `post-action`, `theme`, `productivity`, `integration`. Hook roles are category-gated (below). |
| `engines.motrix` | Semver range of supported Motrix versions. Optional `engines.ffmpeg` too. |
| `permissions` | Capabilities you require (e.g. `http`, `notify`). Auto-injected capabilities (`log`, `i18n`, `config`, `lifecycle`, `commands`, `app`, `crypto`) must NOT be listed. Max 32. |
| `optionalPermissions` | Capabilities you can live without — install succeeds even if unavailable; check `.available` at runtime. |
| `hostPermissions` | URL match patterns (`https://*.example.com/*`, `<all_urls>`) gating what `http` may reach. Max 64. `motrix-plugin validate-host-permissions` reviews them. |
| `activationEvents` | When the host loads you (e.g. `onTaskType:http`, `onStartup`). Required. |
| `contributes.hooks` | Which lifecycle hooks you implement, each with a `role`. |
| `contributes.commands` | Commands you register: id `<publisher>.<plugin>.<command>`, max 64. Commands marked `public: true` must declare `argsSchema` + `resultSchema` (a bounded JSON-Schema subset — no `$ref`/`oneOf`, ≤ 8 KiB, depth ≤ 8). |
| `contributes.configuration` | Your settings schema (same bounded subset). Read values via the `config` capability. |
| `requestedHeapMB` | Sandbox heap, 32 (default) to 64. |
| `l10n` | Directory of locale JSON files. |

## Runtime API — `motrix:plugin-api`

Import everything from the `motrix:plugin-api` virtual module. Types come
from the `@motrix/plugin-api` package (a devDependency in the scaffold); the
implementation is injected by the host — never bundle it (the scaffold's
esbuild config already marks it `external`).

Always available (auto-injected):

| Namespace | What it gives you |
|---|---|
| `log` | Structured logging: `trace/debug/info/warn/error/fatal(msg, fields?)` |
| `i18n` | `t(key, params?)`, current `language`/`dir`, change events |
| `config` | Read your `contributes.configuration` values; `onChange` subscription |
| `lifecycle` | `onActivate`/`onDeactivate` handlers for setup/teardown |
| `commands` | `register(id, handler)` / `execute(id, args)` across plugins |
| `app` | Host `version`, `platform`, `arch`, `runtime` (`electron`/`server`), `locale` |
| `crypto` | `hash`, `hmac`, `randomBytes`, `aes` (cbc/gcm) |

Permission-gated (declare in `permissions` / `optionalPermissions`, then
check `.available`):

| Namespace | What it gives you |
|---|---|
| `http` | `request`/`get`/`post` with typed responses (`text`/`json`/`bytes`), timeouts, ranges, cookie-jar opt-in — scoped by your `hostPermissions` |
| `storage` | Versioned key-value store with `compareAndSet` for safe concurrent updates |
| `fs.task` | Read/stat/hash/rename the file of the task your hook is handling |
| `fs.storage` | A private scratch directory for your plugin |
| `notify` | Desktop notifications |
| `ffmpeg` | `probe`, `transcode`, `extractAudio`, `mergeStreams`, `generateThumbnail` with progress streams (requires ffmpeg on the user's system — make it optional) |

Graceful degradation pattern:

```ts
import { notify } from 'motrix:plugin-api'

if (notify.available) {
  await notify.show({ title: 'Done', body: ctx.filePath })
}
```

## Hooks and roles

Hooks are the download lifecycle. Each hook you implement must also be
declared in `contributes.hooks` with a role:

| Hook | When | You can |
|---|---|---|
| `beforeCreate` | Before a download is created | Inspect `uris`, `headers`, `saveDir`; `ctx.update({ uris, filename, connections, headers, proxy })` |
| `beforeFinalize` | Download data complete, file not yet finalized | `ctx.update({ filePath })` to rename |
| `afterComplete` | File finalized on disk | Side effects: notify, post-process, hand off |
| `onError` | A task failed | Inspect `error.code`/`error.message`, log or notify |

Post-hooks receive `ctx.delivery`: its `id` remains stable across retries of
the same delivery, while `ctx.invocationId` identifies the current attempt.
Plugins can use the stable id for idempotent external side effects.

Roles order execution across plugins within a hook:
`resolve` → `enrich` → `post-process` → `audit`. Two are category-gated:
`resolve` requires the `site-resolver` category, `post-process` requires
`post-action`. If you declare nothing, code-registered hooks run as `enrich`.
(`pre-resolve` is reserved for built-in plugins.)

Every hook context carries an `AbortSignal` (`ctx.signal`) — honor it in
long-running work — and a `metadata` store for passing values between your
hooks across the task's lifetime.

## CLI reference

| Command | What it does |
|---|---|
| `motrix-plugin init <name> [-t basic-resolver\|post-action] [-p publisher]` | Scaffold a new plugin project |
| `motrix-plugin dev` | Watch-build + run your local Motrix with the plugin loaded (`MOTRIX_BIN` overrides discovery) |
| `motrix-plugin validate` | Validate `motrix-plugin.json` against the official schema; non-zero exit on errors |
| `motrix-plugin pack` | Bundle (esbuild, minified, ES2020) + zip into `dist/<id>-<version>.moext` |
| `motrix-plugin lint` | Static checks on the packed bundle: top-level side effects are errors; size warnings; `invokesCommands` advisories |
| `motrix-plugin validate-host-permissions` | Reviews `hostPermissions` patterns for common mistakes |

`pack` enforces the distribution caps — bundle ≤ 1 MiB, archive ≤ 5 MiB —
and includes `motrix-plugin.json`, `dist/plugin.js`, your locale files, and
`icon.png` / `LICENSE` / `CHANGELOG.md` when present. `lint` runs on the
packed output, so pack first.

## Localization

Put UI strings in `locales/<lang>.json` (the scaffold ships `en-US.json` and
`zh-CN.json`) and point the manifest's `l10n` field at the directory. Read
them at runtime with `i18n.t('key')`. `pack` validates locale coverage, so
keys missing from a shipped locale fail the build instead of the user's
session.

## Sandbox rules

- **No top-level side effects.** Register hooks and command handlers at the
  top level; do work inside them. `lint` rejects top-level effectful calls —
  a plugin that computes at import time slows every Motrix launch.
- **No Node.js.** There is no `fs`, `net`, `process`, or `require`. The
  capabilities above are the entire surface.
- **Budget your heap.** The sandbox gives you 32 MB (up to 64 via
  `requestedHeapMB`). Stream instead of buffering: `fs.task.openReader` and
  `http`'s `range` requests exist for exactly this.
- **Honor `ctx.signal`.** Users cancel downloads; hooks that ignore the
  abort signal hold the pipeline hostage.
- **Target ES2020.** The scaffold's esbuild config is already set up; if you
  bring your own bundler, keep `motrix:plugin-api` external and emit a single
  ESM file.

## Distributing your plugin

`motrix-plugin pack` produces `dist/<id>-<version>.moext`. Users install it
from Motrix's Plugins page (**Install from .moext**). At install, Motrix
shows a consent dialog listing your `permissions`, `hostPermissions`, and
public commands — ask for the minimum you need; broad host patterns and
`<all_urls>` make the prompt scarier than your plugin.

## Packages in this repo

| Package | What it is |
|---|---|
| [`@motrix/plugin-api`](packages/plugin-api) | Types + the `motrix:plugin-api` virtual-module declaration |
| [`@motrix/plugin-cli`](packages/plugin-cli) | The `motrix-plugin` CLI |
| [`create-motrix-plugin`](packages/create-motrix-plugin) | The `pnpm create motrix-plugin` scaffolder |
| [`@motrix/plugin-manifest-schema`](packages/plugin-manifest-schema) | The manifest's Zod schema — the single source of truth the CLI and the Motrix host both validate against |

## Contributing

```bash
pnpm install
pnpm build            # tsup, all packages
pnpm typecheck
pnpm test             # vitest, all packages
pnpm lint             # biome
pnpm run check:facade # façade-purity guard
```

Two rules keep validation consistent everywhere: manifest-schema changes go
in `packages/plugin-manifest-schema` only (`plugin-cli`'s
`src/manifest-schema.ts` is a guarded pure re-export), and a schema release
always ships together with a matching CLI release, because the CLI embeds
the schema at build time.

## License

[MIT](./LICENSE)
