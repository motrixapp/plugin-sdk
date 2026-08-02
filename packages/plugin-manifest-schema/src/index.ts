// packages/plugin-manifest-schema/src/index.ts
//
// Public surface of @motrix/plugin-manifest-schema. Two modules sit behind it:
//
//   schema.ts    the Zod manifest schema — the single source of truth for
//                manifest *structure* (field shapes, id/version grammar,
//                match-pattern grammar, bounded config schemas, hook roles).
//   validate.ts  cross-field and asset-level rules the schema deliberately
//                does NOT encode, shared by every pipeline that produces a
//                `.moext` (see that file's header for why they live here).
//
// Keep this file a pure re-export barrel; anything else belongs in one of the
// two modules above.

export * from './schema'
export * from './validate'
