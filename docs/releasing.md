# Releasing the SDK

English | [简体中文](releasing.zh-CN.md)

The repository's release entrypoint is `pnpm run release`. Its default mode
validates, builds and packs the four npm packages without publishing. Uploading
requires an explicit maintainer action in an interactive terminal. CI and agents
may run preparation; agents must not run the publish mode.

This workflow releases the SDK npm packages. It does not change versions, merge
PRs, create Git tags, publish Motrix, sign `.moext` plugins or update the registry.

## Requirements

- Node.js 20 or later, Git, `tar` with gzip support, and the exact pnpm version
  specified by the root `package.json`. On Windows, use standalone `pnpm.exe`
  (as CI does) or a pnpm launcher that supplies its JavaScript `npm_execpath`.
- Install the versions intended for release in the four package manifests through
  a reviewed PR first. The script accepts stable `x.y.z` versions only and uses
  the public npm registry with the `latest` tag. Schema and CLI versions must
  match because the CLI embeds the schema. API and create-wrapper versions may
  differ; all four packages are checked together.
- For publication, a clean `main` checkout, including no untracked files, whose
  HEAD equals the current `origin/main`. Keep the checkout and artifacts unchanged
  for the whole run. Publishing requires network access to GitHub and npm and an
  npm account authorized to publish these packages. Authentication and any OTP
  prompts remain with pnpm; the script does not read or store credentials.

## Prepare without publishing

From the SDK repository root:

```bash
pnpm run release
# Explicit equivalent:
pnpm run release -- --dry-run
```

Preparation supports feature branches, detached CI checkouts and local changes.
The report records the source commit and whether the checkout was dirty. A dirty
preparation is useful for development, but cannot authorize a publication.

The script runs these gates in order, stopping at the first failure:

1. Validate package identities, stable versions, publication configuration, the
   schema/CLI version pair, and the pinned package manager.
2. `pnpm install --frozen-lockfile`.
3. `pnpm run lint` and `pnpm run check:facade`.
4. `pnpm run build`, then `pnpm run typecheck`, then `pnpm run test`.
5. Pack each of the four packages with pnpm and inspect the actual tarballs.

Packing must finish for the entire batch before any upload is considered. The
archive checks verify package identities, required entrypoints/files and rewritten
workspace dependencies. Published dependencies cannot contain `workspace:`,
`link:` or `file:` references, and the CLI cannot retain runtime `@motrix/`
dependencies instead of embedding its SDK code.

Each run creates a fresh ignored `dist/release/sdk-*/` directory containing the
four `.tgz` archives and `release.json`. The report includes source Git state,
pnpm version, package versions, sizes, SHA-256 digests, npm SHA-512 integrity
strings, progress and any failure. Earlier runs are retained for investigation.
Preparation performs no npm metadata lookup or upload; installing locked
build dependencies can still access the package registry.

## Publish manually

After the version/tooling PRs are merged, use a clean, current `main` checkout and
run this command yourself:

```bash
pnpm run release -- --publish
```

This reruns the complete preparation pipeline. Publish mode rejects CI and
non-interactive terminals before running the pipeline. There is no `--yes`,
`--force` or validation-skip option.

Before uploading, the script checks all four exact versions on npm. A 404 means
that a version is available for publication; an authentication, rate-limit,
network or other registry error stops the run. An existing version is skipped
only if its SHA-512 integrity matches the newly prepared archive. A conflicting
version stops the whole batch before the first upload.

The terminal displays the package versions, integrity values, destination and
which packages are pending or already published. Type exactly
`publish SDK packages to npm` to authorize the pending uploads. Declining leaves
the packages unpublished. An entirely identical, already-published batch finishes
without asking for confirmation or sending uploads.

Publication order is fixed:

```text
@motrix/plugin-manifest-schema
@motrix/plugin-api
@motrix/plugin-cli
create-motrix-plugin
```

The script rechecks Git state and archive integrity after confirmation and before
each upload. It invokes pnpm with the verified tarball, explicit public registry,
public access and `latest` tag, preserving Git checks and interactive OTP support.
Each package must become visible with the matching integrity before the next is
published. Missing metadata is polled up to 15 times at two-second intervals;
each HTTP request has a 15-second timeout. Other registry errors stop immediately.

## Failure and partial-release recovery

npm publication across four packages is not atomic. If upload or verification
fails, later packages are not attempted, and nothing is unpublished or retried
automatically. Preserve the run directory and inspect `release.json` and npm.
A `publishing` status is uncertain: the server may have accepted an upload even
if the client failed or metadata was not yet visible.

Once the cause is resolved, rerun from the same reviewed source with the pinned
build tools. The script rebuilds and compares exact published integrity values;
matching packages are skipped, and only the missing packages are submitted after
confirmation. It never overwrites an immutable version. If rebuilding changes the
bytes of a published version, stop and investigate; do not force the upload or
silently skip the mismatch. Any version correction belongs in a new reviewed PR,
keeping schema/CLI versions aligned.

Keep consumers blocked until the coordinated SDK batch is verified. Only then
update Motrix and official-plugin dependencies and lockfiles and rerun their clean
CI. Publishing an SDK version does not prove that a compatible host or plugin
release is available; verify those separately.

## Tests and CI

`pnpm test` runs the release script's Node tests and the existing SDK suites.
Publication tests inject command and registry substitutes; they never upload to
npm. Tests cover ordering, failed gates, archive inspection, registry conflicts,
confirmation, changed artifacts, partial release and uncertain upload results.
CI also runs the actual default preparation command on each supported OS/Node
combination. No workflow automatically publishes packages.
