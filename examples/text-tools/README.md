# Text deduplication operation example (requires a compatible host)

**English** | [简体中文](./README.zh-CN.md)

A complete unsigned third-party example, `community.text-tools`, that removes
duplicate lines from a user-selected UTF-8 file and saves a new file. It uses the
same operation protocol as the media example, without FFmpeg, network permission
or unrestricted filesystem access. It is not a marketplace release.

**SDK 2.2.0 is published; runtime support requires a compatible Motrix host.**
The engine range is `>=2.0.0-beta.48 <3.0.0`, targeting beta.48 as the first
supporting host release. It must actually provide `operations.ui.v1` and
`files.text.v1`; raise the minimum if those features ship later. Beta.47 is
rejected, including development builds still reporting that version. This target
does not imply published host support.

## Complete source

| File | What to inspect |
|---|---|
| [motrix-plugin.json](./motrix-plugin.json) | Bounded argument/result schemas, file cards, switch, collapsible group, result count and task binding |
| [src/index.ts](./src/index.ts) | Scoped read/write, first-occurrence deduplication, cancellation checks and progress |
| [locales/en-US.json](./locales/en-US.json) | Complete English UI text |
| [locales/zh-CN.json](./locales/zh-CN.json) | Complete Chinese UI text |
| [tsconfig.json](./tsconfig.json) | Strict checking against this SDK checkout's ambient API declaration |

All files are complete source. See the
[operation authoring guide](../../docs/operations.md) for the shared protocol.

## Build and validate

From the SDK repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @motrix/plugin-api exec tsc --noEmit -p ../../examples/text-tools/tsconfig.json
cd examples/text-tools
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js validate
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js pack
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js lint
```

Output: `dist/community.text-tools-0.1.0.moext`. These commands do not sign or
publish. Use the compatible host's third-party install flow and review
`files.selected.read` / `files.selected.write`. There is no example dependency
installation; commands and types resolve to this SDK checkout. Published packages
with older contracts do not work as substitutes. `pack` bundles the source;
`lint` checks that bundle and must run afterwards. Type checking is separate.

## Behavior and UI

Choose an input `.txt` file, optionally enable **Ignore case** in the initially
expanded **Matching options** group, and select a new output `.txt` file. The
host suggests an input-based `-unique` filename but still requires output
authorization. The handler reads UTF-8, keeps the first occurrence of each line
in its original position and spelling, writes the result, and returns the output
reference plus `lines`. `result.fields` exposes that count with a localized title.

Comparison follows the sample's literal `split('\n')` algorithm: no trimming,
locale-specific case folding or line-ending normalization. With **Ignore case**,
keys use JavaScript `toLowerCase()`. Empty lines count as lines, including the
last empty segment after a trailing newline; even an empty input has one split
segment. CRLF retains its `\r` characters. This is an intentionally small example,
not a complete text-cleaning product.

For the input string `Apple\napple\nBanana\nApple` **without a trailing newline**:

| Ignore case | Output | Result count |
|---|---|---:|
| Off | `Apple\napple\nBanana` | 3 |
| On | `Apple\nBanana` | 2 |

**Process another copy** uses `preserve-inputs`: retain scalar options, recheck
unchanged input identity and obtain a fresh invocation grant, then clear output.
It does not replay a job automatically. The task menu also supports one completed
single-file task with a local final file. Both entry points use the same handler.

Labels, hints, actions and result titles follow the host language through `%key%`
references. Both English and Chinese are included; other languages fall back to
English. Language switching preserves the form and selected files.

## Manual verification

These steps describe expected behavior, not universal platform test coverage:

1. Install and enable the example, open its operation, and process the sample
   string above with **Ignore case** off and on. Confirm output and count.
2. In Electron, use native input/save dialogs. In Web, select server files within
   the allowed directory policy. Browser-local files are not uploaded.
3. Verify the collapsible option, input/output labels, progress and result count
   in English and Chinese. Generic file-action hints should not be repeated.
4. Click **Process another copy**: input and options remain, output clears. If
   the input changed since selection, reauthorization must reject the stale file.
5. Choose an existing output, a disallowed file type, invalid UTF-8, or text larger
   than 1 MiB. Expect rejection without overwriting files or publishing partial
   output. A forged path/ref or another invocation's ref must not grant access.
6. Cancel before final publication and wait for cleanup. No partial output should
   appear and input should remain unchanged. Small inputs can complete too quickly
   to cancel manually; that is not cancellation evidence. Use a controlled host
   integration test for deterministic cancellation, without adding an unsafe API.
7. Use the completed-task menu entry; repeat should use fresh grants. Switch pages
   and refresh while the host remains running; do not treat a historical success
   as a newly executed operation.

The host limits UTF-8 input/output to 1 MiB, allows at most four text reads and one
write per output, and rejects existing destinations. Cancellation, finalization
and temporary resources belong to the host. See the guide for shared limits.

## Adapt the example

Change the plugin ID and matching operation/command/activation references to your
own non-reserved publisher. Add bounded scalar arguments before adding their
`fields` and layout references; every argument and every layout binding must
appear exactly once. Keep handler types and locales aligned. Business rules go in
the sandbox handler, not `visibleWhen` or an invented UI callback.

## Generate a project with your own identity

The published SDK 2.2.0 CLI provides `init <name> -t operation [-p publisher]`
and `create-motrix-plugin <name> operation`. They generate this starting point
with substituted identities, package-based types, build scripts and paired
READMEs. Follow the [guide](../../docs/operations.md) for registry installation
and the outdated notice in the immutable 2.2.0 CLI. A compatible host is still
required.
