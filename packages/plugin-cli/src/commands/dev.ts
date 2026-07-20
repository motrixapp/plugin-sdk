// packages/plugin-cli/src/commands/dev.ts
import { spawn } from 'node:child_process'
import path from 'node:path'
import chokidar from 'chokidar'
import { context } from 'esbuild'
import { findMotrixBinary } from '../find-motrix'

export async function dev(projectDir: string): Promise<void> {
  const motrix = await findMotrixBinary()
  if (!motrix)
    throw new Error(
      'Motrix not found. Install Motrix or set MOTRIX_BIN env var.'
    )

  // Build + watch using the esbuild context API (watch:true was removed in 0.17+)
  const ctx = await context({
    entryPoints: [path.join(projectDir, 'src/index.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    platform: 'neutral',
    outfile: path.join(projectDir, 'dist/plugin.js'),
    sourcemap: 'inline',
    external: ['motrix:plugin-api'],
  })
  await ctx.watch()

  const proc = spawn(motrix, [], {
    env: { ...process.env, MOTRIX_PLUGIN_DEV_PATH: projectDir },
    stdio: 'inherit',
  })

  const watcher = chokidar.watch(
    [
      path.join(projectDir, 'motrix-plugin.json'),
      path.join(projectDir, 'locales/**'),
    ],
    { ignoreInitial: true }
  )

  watcher.on('change', (changedPath) => {
    console.log(
      `[dev] ${path.relative(projectDir, changedPath)} changed; host will reload plugin`
    )
  })

  // Idempotent cleanup — SIGINT and child-exit both arrive in practice; the
  // guard ensures ctx.dispose() / watcher.close() each run at most once.
  let cleanedUp = false
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return
    cleanedUp = true
    await ctx.dispose()
    await watcher.close()
  }

  const exitPromise = new Promise<void>((resolve) => {
    proc.on('exit', async () => {
      await cleanup()
      resolve()
    })
  })

  // Without this, Ctrl-C kills the CLI directly and leaks the esbuild watch
  // context and chokidar FDs (macOS FSEvents limits make this user-visible).
  process.once('SIGINT', async () => {
    proc.kill('SIGINT')
    await exitPromise
    process.exit(0)
  })

  await exitPromise
}
