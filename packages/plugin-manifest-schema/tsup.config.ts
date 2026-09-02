import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  splitting: false,
  clean: true,
  target: 'node20',
  platform: 'node',
})
