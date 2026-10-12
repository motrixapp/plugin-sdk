# Media merge operation example (requires a compatible host)

**English** | [简体中文](./README.zh-CN.md)

A complete SDK example adapted from the official optional `motrix.media-merge`
plugin. The official implementation and signing authority remain in
[motrixapp/builtin-plugins](https://github.com/motrixapp/builtin-plugins).
This teaching copy uses **`example.media-merge`** and a distinct display name so
it can be installed as an unsigned third-party example without impersonating the
official plugin or requiring its signing key. It is not a marketplace release.

**SDK 2.2.0 is published; runtime support requires a compatible Motrix host.**
`engines.motrix` is `>=2.0.0-beta.48 <3.0.0`, targeting beta.48 as the first
supporting host release. This is a release target, not published availability.
Beta.47 is rejected, including development builds still reporting that version.
If the feature ships later, raise the minimum accordingly. Use matching SDK
packages and configure FFmpeg in the compatible host before using the operation.

## Complete source

| File | What to inspect |
|---|---|
| [motrix-plugin.json](./motrix-plugin.json) | Private command, bounded schemas, file bindings, two entry points, grid/accessory layout and repeat policy |
| [src/index.ts](./src/index.ts) | Track probing, automatic order correction, cancellation check and scoped merge |
| [locales/en-US.json](./locales/en-US.json) | All English UI and business-error text |
| [locales/zh-CN.json](./locales/zh-CN.json) | All Chinese UI and business-error text |
| [tsconfig.json](./tsconfig.json) | Strict checking against this SDK checkout's ambient API declaration |

The source files are complete, not snippets. See the
[operation authoring guide](../../docs/operations.md) for the full protocol.

## Build and validate

From the SDK repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @motrix/plugin-api exec tsc --noEmit -p ../../examples/media-merge/tsconfig.json
cd examples/media-merge
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js validate
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js pack
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js lint
```

Output: `dist/example.media-merge-0.1.0.moext`. These commands neither sign nor
publish. Install using the compatible host's normal third-party package flow.
Review `ffmpeg`, `files.selected.read` and `files.selected.write` permissions.
There is no network permission or download lifecycle hook. A published CLI with
an older embedded schema cannot validate this example. The TypeScript include is
checkout-relative by design; standalone projects can use the published
API/CLI 2.2.0 packages with package-based types.

## Behavior and UI

The operation shows two file cards in a responsive two-column grid. The output
spans the row with an MP4/MKV selector next to its label. It suggests a name based
on the video input plus `-merged`, with an extension matching the selected format.
A suggested path does not authorize writing: the host still requests output
selection/confirmation. Desktop and Web show different file-location hints.

The handler probes both authorized inputs. If the selected order does not supply
video first and audio second but the reversed order does, it swaps the references
for execution. It copies the first video and audio tracks without re-encoding.
It does not concatenate clips, adjust synchronization, transcode incompatible
codecs or visually exchange the selected cards. If MP4 rejects a codec, try MKV.

The plugin page and the task menu share the same operation. The task menu accepts
exactly two completed single-file tasks with local final files. The host owns
progress, cancellation, snapshots, output validation and non-overwriting save.
**Merge another file** uses `preserve-options`: clear both inputs, output and old
result, retain MP4/MKV, and do not reapply the previous task selection.

Both languages are complete. Host language changes update labels without clearing
current selections. Generic drop/change/cancel/status text comes from the host;
`browseLabel` is the file card's accessible name.

## Manual verification

These are verification steps, not a claim that every platform has been tested:

1. In Electron, choose standalone video and audio files with the native dialogs;
   save to a new MP4/MKV path. In Web, choose files on the Motrix server within
   its configured directory policy. Browser-local files are not uploaded.
2. Try unambiguously reversed inputs. The resulting file should contain video
   and audio; the form need not visually swap the cards. Try the same input twice
   and a pair missing the required tracks; expect an error and no published output.
3. Change MP4/MKV and confirm the output extension follows it. Select an existing
   destination; expect rejection, with the original untouched.
4. Start a sufficiently long operation and cancel before final publication.
   Wait for cleanup to settle: no final output should be published and inputs
   should remain unchanged. Late cancellation cannot delete an already saved result.
5. Complete a job, click **Merge another file**, and verify empty file selections
   with the format retained. Switch pages, refresh, and change English/Chinese;
   check state handling, no repeated hint text and no unexpected untranslated labels.
6. Test both entry points. Disable the plugin or remove FFmpeg availability and
   verify the host explains why the operation cannot run.
7. For desktop drops, confirm only the intended file through the host prompt.
   A forged path, stale reference or reference from another invocation must not
   become file access. Never test by weakening the host's authorization checks.

Inputs must be supported standalone media, not playlists, concat scripts or image
sequences. Indirect local/network references are not authorized. Current limits
include 8 GiB per input, 16 GiB total, at most four probes/two simultaneous probes,
one merge and sufficient free space for snapshots/staging. Unsupported destination
filesystems fail safely. See the guide for shared time, draft and descriptor limits.

## Adapt the example

Change the plugin ID and every operation/command/activation reference together;
use your own non-reserved publisher. Keep `argsSchema`, `fields`, `ui.layout`,
file bindings, handler types and locale keys aligned. Change business behavior in
the sandbox handler and presentation in the manifest. Do not copy official
identity or signing assumptions. The SDK teaching copy is not the release source
for the official plugin.
