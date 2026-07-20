// packages/plugin-cli/src/commands/init.ts
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolves to dist/templates/ at runtime: import.meta.url points to
// dist/bin/motrix-plugin.js, so ../../ walks up to dist/, then +templates.
const TEMPLATES = path.resolve(
  fileURLToPath(import.meta.url),
  '../../templates'
)

export interface InitOptions {
  projectName: string
  template: 'basic-resolver' | 'post-action'
  destDir: string
  publisher: string
}

export async function init(opts: InitOptions): Promise<{ created: string }> {
  const target = path.resolve(opts.destDir, opts.projectName)
  await mkdir(target, { recursive: true })
  const src = path.join(TEMPLATES, opts.template)
  await copyTree(src, target, {
    PROJECT_NAME: opts.projectName,
    PUBLISHER: opts.publisher,
    PLUGIN_ID: `${opts.publisher}.${opts.projectName}`,
  })
  return { created: target }
}

async function copyTree(
  src: string,
  dst: string,
  vars: Record<string, string>
): Promise<void> {
  for (const e of await readdir(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name)
    const dp = path.join(dst, e.name.replace(/\.tpl$/, ''))
    if (e.isDirectory()) {
      await mkdir(dp, { recursive: true })
      await copyTree(sp, dp, vars)
    } else if (e.name.endsWith('.tpl')) {
      let content = await readFile(sp, 'utf8')
      for (const [k, v] of Object.entries(vars))
        content = content.replaceAll(`{{${k}}}`, v)
      await writeFile(dp, content)
    } else {
      await copyFile(sp, dp)
    }
  }
}
