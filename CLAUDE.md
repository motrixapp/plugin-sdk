# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this repo is

`motrixapp/plugin-sdk` is a pnpm workspace holding the four packages that
make up the Motrix plugin-authoring SDK:

| Package | Role |
|---|---|
| `packages/plugin-manifest-schema` | Zod schema for the plugin manifest — single source of truth |
| `packages/plugin-api` | Guest-facing types + the `motrix:plugin-api` virtual-module declaration |
| `packages/plugin-cli` | `motrix-plugin` CLI (init/validate/lint/pack/dev) |
| `packages/create-motrix-plugin` | `pnpm create motrix-plugin` scaffolder, delegates to plugin-cli |

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
  via npm — once published, `motrix-turbo` and `builtin-plugins` pin
  `^2.0.0`. Any wire-shape or API change requires a publish here plus a
  dependency bump there; it does not take effect by editing source alone.
- **No `.moext` / Ed25519 signing in this repo.** That signing pipeline
  belongs to the `builtin-plugins` repo (it signs plugin bundles, not npm
  packages).
- **Schema/CLI publish lockstep**: `packages/plugin-manifest-schema` is
  inlined into `@motrix/plugin-cli` at build time (`tsup.config.ts`
  `noExternal`). Any schema change MUST republish `@motrix/plugin-cli` in the
  same publish batch — otherwise plugin authors' `motrix-plugin validate`
  and the Motrix host will disagree about manifest validity.

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
