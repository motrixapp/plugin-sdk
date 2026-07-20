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
  // The workspace-only @motrix/plugin-manifest-schema package is not on the
  // npm registry, so CLI consumers will not have it installed. Force tsup to
  // inline it into the published dist instead of treating it as external.
  noExternal: [/^@motrix\/plugin-manifest-schema$/],
  onSuccess: async () => {
    const { rm, cp } = await import('node:fs/promises')
    await rm('dist/templates', { recursive: true, force: true })
    await cp('src/templates', 'dist/templates', { recursive: true })
  },
})
