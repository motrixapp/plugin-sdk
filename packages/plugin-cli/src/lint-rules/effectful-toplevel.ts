// packages/plugin-cli/src/lint-rules/effectful-toplevel.ts
import { transformSync } from 'esbuild'

const EFFECTFUL = new Set([
  'http.get',
  'http.post',
  'http.request',
  'fs.task.stat',
  'fs.task.exists',
  'fs.task.openReader',
  'fs.task.computeHash',
  'fs.task.rename',
  'fs.storage.read',
  'fs.storage.write',
  'fs.storage.delete',
  'fs.storage.rename',
  'fs.storage.exists',
  'fs.storage.stat',
  'fs.storage.mkdir',
  'storage.get',
  'storage.set',
  'storage.compareAndSet',
  'storage.delete',
  'storage.keys',
  'notify.show',
  'ffmpeg.probe',
  'ffmpeg.transcode',
  'ffmpeg.extractAudio',
  'ffmpeg.mergeStreams',
  'ffmpeg.generateThumbnail',
  'commands.execute',
  'crypto.hash',
  'crypto.hmac',
  'crypto.randomBytes',
  'crypto.aes',
  'metadata.set',
  'metadata.delete',
])

// NOTE: This is a deliberately simple brace-depth scanner. It does NOT track
// string/template boundaries, so a string literal like `'http.get('` will
// produce a false positive and an unbalanced `{` inside a string could mask
// a real top-level call. The spec accepts this tradeoff for the 1A line; a
// future hardening pass should switch to a real AST (e.g., acorn / @babel/parser).
export function findToplevelEffectful(source: string): string[] {
  // Simple regex over the source: look for top-level call statements
  // referencing the known capability namespaces. Inside a function body
  // (any depth) is fine.
  const findings: string[] = []
  const stripped = transformSync(source, {
    loader: 'js',
    sourcemap: false,
    format: 'esm',
  }).code
  // Pre-parse: split top-level only by tracking brace depth
  let depth = 0
  let i = 0
  while (i < stripped.length) {
    const c = stripped[i]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (depth === 0) {
      const slice = stripped.slice(i, i + 80)
      const m = slice.match(
        /^(?:await\s+)?([a-z][a-z]*(?:\.[a-z][a-zA-Z]*){1,2})\s*\(/
      )
      if (m && EFFECTFUL.has(m[1])) findings.push(m[1])
    }
    i++
  }
  return findings
}
