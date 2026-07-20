# @motrix/plugin-api

TypeScript types for authoring [Motrix](https://motrix.app) plugins.

Motrix plugins run inside a QuickJS sandbox and never import a real npm
package at runtime — the host injects a `motrix:plugin-api` module into the
sandbox global scope. This package supplies:

- an **ambient module declaration** for `motrix:plugin-api` (`src/virtual-module.d.ts`),
  so `import { hooks, commands, log, ... } from 'motrix:plugin-api'` type-checks
  and autocompletes in your editor even though the specifier resolves to
  nothing on disk
- a small set of **runtime helper utilities** (`retry`, `debounce`,
  `withTimeout`) that plugins can import as regular code, bundled from
  `dist/index.js`

## Install

```bash
pnpm add -D @motrix/plugin-api
```

Add as a dev dependency only — the virtual module is a compile-time
declaration, and the host provides the real implementation at runtime. Only
the helper utilities (`retry`/`debounce`/`withTimeout`) end up in your
plugin's built output if you actually import them.

## Usage

```ts
import { hooks, log } from 'motrix:plugin-api'
import { withTimeout } from '@motrix/plugin-api'

hooks.beforeCreate(async (ctx) => {
  log.info('resolving', { url: ctx.uris[0] })
  return withTimeout(resolve(ctx), 5000)
})
```

Make sure `src/virtual-module.d.ts` is visible to the TypeScript compiler.
Installing this package is enough — its `files` entry ships the `.d.ts`
alongside `dist`, and TypeScript picks up ambient module declarations from
any `.d.ts` under `node_modules/@types` or reachable via `include`/`types`
in `node_modules/@motrix/plugin-api`.

## Learn more

- Scaffold a new plugin with [`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)
  (`pnpm create motrix-plugin`)
- Manifest shape is validated against [`@motrix/plugin-manifest-schema`](https://www.npmjs.com/package/@motrix/plugin-manifest-schema)
- Design background: `docs/superpowers/specs/2026-05-09-plugin-ecosystem-design.md`
  in the [motrix-turbo](https://gitlab.com/agalwood/motrix-turbo) repository
