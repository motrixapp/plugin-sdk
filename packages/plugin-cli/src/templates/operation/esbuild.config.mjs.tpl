import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  platform: 'neutral',
  outfile: 'dist/plugin.js',
  external: ['motrix:plugin-api'],
  minify: true,
  treeShaking: true,
})
