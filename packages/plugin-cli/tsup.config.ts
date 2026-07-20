import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/motrix-plugin': 'src/bin/motrix-plugin.ts',
    'bin/create-motrix-plugin': 'src/bin/create-motrix-plugin.ts',
  },
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: true,
  target: 'node20',
  platform: 'node',
  // Inline @motrix/plugin-manifest-schema into the published dist: the CLI
  // ships with zero @motrix runtime deps and no version-skew surface for
  // consumers (the schema is versioned by the CLI build that embeds it).
  noExternal: [/^@motrix\/plugin-manifest-schema$/],
  onSuccess: async () => {
    const { rm, cp } = await import('node:fs/promises')
    await rm('dist/templates', { recursive: true, force: true })
    await cp('src/templates', 'dist/templates', { recursive: true })
  },
})
