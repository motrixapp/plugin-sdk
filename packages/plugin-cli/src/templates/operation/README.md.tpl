# {{PROJECT_NAME}}

**English** | [简体中文](./README.zh-CN.md)

A text deduplication operation scaffolded for `{{PLUGIN_ID}}`.

> **Unreleased protocol and template.** Use a Motrix development build and SDK
> packages that implement operations v1, composable UI and scoped text files.
> The host range is `>=2.0.0-beta.48 <3.0.0`, targeting beta.48 as the first
> supporting release. Beta.47 is rejected, including development builds still
> reporting that version. This target and the dependency ranges do not establish
> published support. Raise the host floor if these features ship after beta.48.

## Set up matching development dependencies

Build a matching plugin-sdk checkout first with `pnpm install --frozen-lockfile`
and `pnpm build` in that checkout. If this project was created immediately inside
that checkout's root, run the following **from this project directory**:

```sh
pnpm add -D @motrix/plugin-api@file:../packages/plugin-api @motrix/plugin-cli@file:../packages/plugin-cli
```

If the project lives elsewhere, adjust both `file:` paths to the matching built
SDK packages. Do not replace this step with a plain install of the older published
API/CLI. The source checkout's schema is embedded in its CLI build. When matching
SDK packages are released, replace these local dependencies with their actual
released versions; no minimum published SDK package version is assigned here.

## Check and pack

```sh
pnpm run typecheck
pnpm run validate
pnpm run pack
pnpm run lint
```

`pack` bundles `src/index.ts` and writes the unsigned
`dist/{{PLUGIN_ID}}-0.1.0.moext`. `lint` checks the built bundle, so it runs after
`pack`. `pnpm run build` is an optional bundle-only step. No command here signs or
publishes. Install the archive through a compatible host's normal third-party
installation flow and review the two selected-file permissions.

## Files to edit

| File | Role |
|---|---|
| `motrix-plugin.json` | Private operation command, argument/result schemas, fields, layout, files, entries and repeat policy |
| `src/index.ts` | Typed sandbox handler, cancellation checks, progress and scoped file calls |
| `locales/en-US.json`, `locales/zh-CN.json` | Complete labels, hints, actions and result titles |
| `tsconfig.json` | Strict checking through the installed `@motrix/plugin-api`; no SDK checkout path is embedded |
| `esbuild.config.mjs` | Standalone ES2020 bundle with `motrix:plugin-api` kept external |

The handler and manifest use the same `{{PLUGIN_ID}}.deduplicate` identity.
Changing an argument means updating its schema, handler type, field and layout
reference together. Persistent preferences belong in plugin configuration, not
operation arguments. The current template does not generate types from schemas.

## Behavior and limits

Select one UTF-8 `.txt` file, optionally enable **Ignore case**, and select a new
output. The handler preserves the first occurrence and spelling of each LF-split
line; case-insensitive keys use `toLowerCase()`. It does not trim whitespace or
normalize line endings. Empty segments, including a trailing newline or an empty
file, count as lines; CRLF preserves `\r`. The host displays the unique line count.

The form is available in the plugin page and for one completed single-file task.
**Process another copy** preserves options and reauthorizes unchanged input,
clearing output. Locale changes preserve form values. Electron selects native
files; Web selects files on the server, not browser-local uploads.

File strings are opaque single-invocation references, never paths. Declaring
permissions does not grant arbitrary file access. The host limits text input and
output to 1 MiB, prohibits output overwrite, checks authorization again during
execution and handles progress, cancellation, temporary files and publication.
The template requests no FFmpeg, network or unrestricted filesystem capability.

## Try it

- For `Apple\napple\nBanana\nApple` without a trailing newline, expect 3 unique
  lines with Ignore case off and 2 with it on.
- Check English/Chinese labels, the collapsible options group, both entry points
  and repeated execution with a fresh output.
- An existing destination, stale/changed input or unauthorized reference must be
  rejected. Never remove host authorization checks to make an example run.
- Cancel before output publication and wait for cleanup. A tiny input may finish
  too quickly for manual cancellation; that is not cancellation test evidence.

For current controls, layout/condition rules, file grants, limits and unsupported
features, read the [SDK operation guide](https://github.com/motrixapp/plugin-sdk/blob/main/docs/operations.md).
Before these sources are published, read `docs/operations.md` in the matching SDK
checkout instead. New UI nodes/capabilities need host support; the template does
not provide custom renderer HTML, JavaScript or CSS.
