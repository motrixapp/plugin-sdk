// packages/plugin-cli/src/manifest-schema.ts
// Manifest Zod schema lives in @motrix/plugin-manifest-schema (workspace
// package). This file is a re-export façade so CLI internal modules
// (validate, lint, pack, validate-host-permissions, i18n-coverage) continue
// to import from `../manifest-schema`. Do not add logic here.
export * from '@motrix/plugin-manifest-schema'
