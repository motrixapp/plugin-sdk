# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this repo is

`motrixapp/plugin-sdk` is a pnpm workspace holding the four packages that
make up the Motrix plugin-authoring SDK:

| Package | Role |
|---|---|
| `packages/plugin-manifest-schema` | Zod schema for the plugin manifest **plus the shared pack-time validation rules** — single source of truth for both |
| `packages/plugin-api` | Guest-facing types + the `motrix:plugin-api` virtual-module declaration |
| `packages/plugin-cli` | `motrix-plugin` CLI (init/validate/lint/pack/dev) |
| `packages/create-motrix-plugin` | `pnpm create motrix-plugin` scaffolder, delegates to plugin-cli |

`plugin-manifest-schema` has two source modules behind one barrel: `schema.ts`
(manifest *structure*) and `validate.ts` (cross-field + asset rules the schema
cannot express, e.g. `hooks ⇒ hostPermissions`, locale coverage). `validate.ts`
is consumed by BOTH publishing pipelines — this CLI and `builtin-plugins`'
`scripts/pack.mjs` — so keep it free of `node:fs` and every other Node builtin;
callers own the I/O.

Dependency chain: `plugin-manifest-schema ← plugin-cli ← create-motrix-plugin`;
`plugin-api` is standalone. Internal deps are `workspace:*`, rewritten to real
version ranges by pnpm at publish time.

## Commands

```bash
pnpm build              # pnpm -r build
pnpm typecheck          # pnpm -r typecheck
pnpm test               # pnpm -r test
pnpm lint               # biome check .
pnpm run check:facade   # scripts/check-facade.mjs
```

Prefer `pnpm exec` over `npx` for one-off CLI invocations in this workspace.

## Hard rules

- **Façade purity**: `packages/plugin-cli/src/manifest-schema.ts` must stay a
  pure `export * from '@motrix/plugin-manifest-schema'` re-export — nothing
  else. `scripts/check-facade.mjs` (run in CI) enforces this. Any manifest
  validation change belongs in `packages/plugin-manifest-schema/`, never in
  the façade file.
- **Published versions are load-bearing**: these packages ship to consumers
  via npm — once published, `motrix-turbo` and `builtin-plugins` pin a
  `^2.x` range. Any wire-shape or API change requires a publish here plus a
  dependency bump there; it does not take effect by editing source alone.
- **Every pack-time gate runs before esbuild writes anything.** `pack` must
  reject a plugin without leaving a half-built `dist/plugin.js` behind, and —
  the reason this matters — must never be able to emit a `.moext` the host
  refuses to install. Add new gates alongside the existing
  `validateManifest` / `validateLocaleCoverage` calls at the top of
  `commands/pack.ts`, never after the bundle step.
- **`pack` output is reproducible; keep it that way.** Every zip entry is
  added in sorted order with a pinned `mtime` (`DOS_EPOCH`) and `mode`, so the
  same source tree always yields the same sha256 — which is what makes a
  registry entry's `package.sha256` verifiable by anyone. `DOS_EPOCH` is built
  with the LOCAL-time `Date` constructor on purpose: yazl converts it back
  with local-time getters, so the two cancel out and the digest is
  timezone-independent **without** mutating `process.env.TZ` (a library must
  not). `tests/cli.test.ts` locks this across UTC / +8 / −5 / +14.
- **No `.moext` / Ed25519 signing in this repo.** That signing pipeline
  belongs to the `builtin-plugins` repo (it signs plugin bundles, not npm
  packages). Note the split: the *validation* rules are shared with that repo
  via `plugin-manifest-schema`; the *signing and release orchestration* are
  not, and must not migrate here.
- **Schema/CLI publish lockstep**: `packages/plugin-manifest-schema` is
  inlined into `@motrix/plugin-cli` at build time (`tsup.config.ts`
  `noExternal`). Any schema change MUST republish `@motrix/plugin-cli` in the
  same publish batch — otherwise plugin authors' `motrix-plugin validate`
  and the Motrix host will disagree about manifest validity. Since
  `builtin-plugins` now imports `validate.ts` from the schema package
  directly, a schema release also means bumping the dependency there.
- **`plugin-cli` is bin-only by design.** `tsup.config.ts` builds only the two
  bins, with no `main`/`exports` and `dts: false`, so consumers resolve zero
  transitive `@motrix` deps. Anything another repo needs to reuse therefore
  belongs in `plugin-manifest-schema`, not here — that constraint is why the
  hooks invariant was hand-copied into `builtin-plugins` in the first place.

## Publish order

`pnpm publish` per package, human-run only — never executed by an agent:

```
plugin-manifest-schema → plugin-api → plugin-cli → create-motrix-plugin
```

## Conventions

- Conversation language is Chinese; code, commits, identifiers, and file
  names stay in English (workspace-wide convention).
- README is bilingual: `README.md` (English) + `README.zh-CN.md` (Chinese).
  Any file with CJK content must be written via a bash heredoc
  (`cat > file << 'EOF'`), never the `Write` tool — `Write` emits `\uXXXX`
  escapes instead of literal characters.
