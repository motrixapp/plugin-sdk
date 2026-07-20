// packages/plugin-manifest-schema/src/index.ts
import { z } from 'zod'

export const RESERVED_PUBLISHERS = new Set([
  'motrix',
  'verified',
  'official',
  'system',
])
export function isReservedPublisher(id: string): boolean {
  return RESERVED_PUBLISHERS.has(id.split('.')[0] ?? '')
}
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,38}\.[a-z0-9][a-z0-9-]{0,99}$/
const COMMAND_ID_RE =
  /^[a-z0-9][a-z0-9-]{0,38}\.[a-z0-9][a-z0-9-]{0,99}\.[a-zA-Z0-9._-]{1,87}$/
export const MATCH_PATTERN_RE =
  /^(\*|https?):\/\/(\*|(\*\.)?[A-Za-z0-9.-]+)(\/[^\s]*)?$/
const SEMVER_RANGE_RE = /^[\^~><=!\d\s.x*+\-A-Za-z]+$/

const KNOWN_AUTO_INJECTED = [
  'log',
  'i18n',
  'config',
  'lifecycle',
  'commands',
  'app',
  'crypto',
] as const

const PERMISSION_RE = /^[a-z][a-z0-9.]{0,63}$/

const PluginIdSchema = z.string().regex(PLUGIN_ID_RE)

const CategorySchema = z.enum([
  'site-resolver',
  'post-action',
  'theme',
  'productivity',
  'integration',
])

/**
 * BoundedJsonSchema — a recursive `.strict()` Zod schema that accepts only a
 * conservative JSON-Schema subset suitable for deterministic Ajv compilation.
 *
 * Allowed keys: `type`, `properties`, `items`, `required`, `enum`, `pattern`,
 * `minimum`, `maximum`, `minLength`, `maxLength`, `additionalProperties`,
 * `default`, `secret`, `title`, `description`. `$ref`, `oneOf`, `anyOf`,
 * `allOf`, and `not` are rejected by `.strict()` (along with any other unknown
 * keys). Extending this subset requires an explicit schema bump — no
 * `.passthrough()` here. Manifest-time DoS bounds (size, depth, enum count,
 * property count) are applied separately via `BoundedJsonSchemaTopLevel`.
 */
export interface BoundedJsonSchemaShape {
  type?:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'
  properties?: Record<string, BoundedJsonSchemaShape>
  items?: BoundedJsonSchemaShape
  required?: string[]
  enum?: unknown[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  additionalProperties?: boolean | BoundedJsonSchemaShape
  default?: unknown
  secret?: boolean
  title?: string
  description?: string
}

export const BoundedJsonSchema: z.ZodType<BoundedJsonSchemaShape> = z.lazy(() =>
  z
    .object({
      type: z
        .enum([
          'string',
          'number',
          'integer',
          'boolean',
          'object',
          'array',
          'null',
        ])
        .optional(),
      properties: z.record(z.string(), BoundedJsonSchema).optional(),
      items: BoundedJsonSchema.optional(),
      required: z.array(z.string()).optional(),
      enum: z.array(z.unknown()).optional(),
      pattern: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      additionalProperties: z
        .union([z.boolean(), BoundedJsonSchema])
        .optional(),
      default: z.unknown().optional(),
      secret: z.boolean().optional(),
      title: z.string().max(128).optional(),
      description: z.string().max(512).optional(),
    })
    .strict()
)

// Spec §2 L497-538 manifest-time bounds. These run AFTER shape validation, on
// the top-level schema only — recursive descent here would double-count.
const BOUNDED_SCHEMA_MAX_BYTES = 8192
const BOUNDED_SCHEMA_MAX_DEPTH = 8
const BOUNDED_SCHEMA_MAX_ENUMS = 256
const BOUNDED_SCHEMA_MAX_PROPS_PER_LEVEL = 128

function computeDepth(s: BoundedJsonSchemaShape, current = 1): number {
  let max = current
  if (s.properties) {
    for (const v of Object.values(s.properties)) {
      max = Math.max(max, computeDepth(v, current + 1))
    }
  }
  if (s.items) max = Math.max(max, computeDepth(s.items, current + 1))
  if (s.additionalProperties && typeof s.additionalProperties === 'object') {
    max = Math.max(max, computeDepth(s.additionalProperties, current + 1))
  }
  return max
}

function countEnums(s: BoundedJsonSchemaShape): number {
  let n = Array.isArray(s.enum) ? s.enum.length : 0
  if (s.properties) {
    for (const v of Object.values(s.properties)) n += countEnums(v)
  }
  if (s.items) n += countEnums(s.items)
  if (s.additionalProperties && typeof s.additionalProperties === 'object') {
    n += countEnums(s.additionalProperties)
  }
  return n
}

function maxPropsAtAnyLevel(s: BoundedJsonSchemaShape): number {
  let max = 0
  if (s.properties) {
    max = Math.max(max, Object.keys(s.properties).length)
    for (const v of Object.values(s.properties)) {
      max = Math.max(max, maxPropsAtAnyLevel(v))
    }
  }
  if (s.items) max = Math.max(max, maxPropsAtAnyLevel(s.items))
  if (s.additionalProperties && typeof s.additionalProperties === 'object') {
    max = Math.max(max, maxPropsAtAnyLevel(s.additionalProperties))
  }
  return max
}

/**
 * BoundedJsonSchemaTopLevel — BoundedJsonSchema plus the four manifest-time
 * DoS bounds. Apply this at any field that accepts an entire schema document
 * (argsSchema, resultSchema, contributes.configuration.schema). The bounds
 * check runs only at the top-level invocation so nested recursion does not
 * re-compute the same trees.
 */
export const BoundedJsonSchemaTopLevel = BoundedJsonSchema.superRefine(
  (schema, ctx) => {
    const serialized = JSON.stringify(schema)
    if (serialized.length > BOUNDED_SCHEMA_MAX_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `plugin.manifest.bounded_schema_invalid: serialized schema is ${serialized.length} bytes (max ${BOUNDED_SCHEMA_MAX_BYTES})`,
      })
    }
    const depth = computeDepth(schema)
    if (depth > BOUNDED_SCHEMA_MAX_DEPTH) {
      ctx.addIssue({
        code: 'custom',
        message: `plugin.manifest.bounded_schema_invalid: nesting depth ${depth} exceeds ${BOUNDED_SCHEMA_MAX_DEPTH}`,
      })
    }
    const enums = countEnums(schema)
    if (enums > BOUNDED_SCHEMA_MAX_ENUMS) {
      ctx.addIssue({
        code: 'custom',
        message: `plugin.manifest.bounded_schema_invalid: combined enum entries ${enums} exceeds ${BOUNDED_SCHEMA_MAX_ENUMS}`,
      })
    }
    const props = maxPropsAtAnyLevel(schema)
    if (props > BOUNDED_SCHEMA_MAX_PROPS_PER_LEVEL) {
      ctx.addIssue({
        code: 'custom',
        message: `plugin.manifest.bounded_schema_invalid: ${props} properties at one level exceeds ${BOUNDED_SCHEMA_MAX_PROPS_PER_LEVEL}`,
      })
    }
  }
)

const CommandContributionSchema = z
  .object({
    id: z.string().regex(COMMAND_ID_RE),
    title: z.string().min(1).max(128),
    icon: z.string().max(64).optional(),
    public: z.boolean().default(false),
    argsSchema: BoundedJsonSchemaTopLevel.optional(),
    resultSchema: BoundedJsonSchemaTopLevel.optional(),
  })
  .strict()

export const CommandsContribution = z
  .array(CommandContributionSchema)
  .max(64)
  .refine((cmds) => cmds.filter((c) => c.public).length <= 32, {
    message: 'plugin.manifest.command.too_many_public',
  })
  .refine(
    (cmds) =>
      cmds.every(
        (c) =>
          !c.public ||
          (c.argsSchema !== undefined && c.resultSchema !== undefined)
      ),
    { message: 'plugin.manifest.command.public_missing_schema' }
  )

/**
 * HookRoleSchema — five role bands defined in spec §2 L540-546. Ordering and
 * eligibility (pre-resolve = builtin-only, resolve = needs `site-resolver`
 * category, post-process = needs `post-action` category) is enforced in
 * `parse.ts` since the latter rules need cross-field state.
 */
export const HookRoleSchema = z.enum([
  'pre-resolve',
  'resolve',
  'enrich',
  'post-process',
  'audit',
])

export type HookRole = z.infer<typeof HookRoleSchema>

/**
 * HookContributionSchema — strict shape per spec §2 L548-553. Every declared
 * hook entry must specify a role. Plugin participation declared in code
 * without a corresponding manifest entry defaults to `enrich` at the runtime
 * orchestrator layer (HookOrchestrator), not here.
 */
export const HookContributionSchema = z
  .object({
    beforeCreate: z.object({ role: HookRoleSchema }).strict().optional(),
    beforeFinalize: z.object({ role: HookRoleSchema }).strict().optional(),
    afterComplete: z.object({ role: HookRoleSchema }).strict().optional(),
    onError: z.object({ role: HookRoleSchema }).strict().optional(),
  })
  .strict()

export type HookContribution = z.infer<typeof HookContributionSchema>

const ConfigurationContributionSchema = z
  .object({
    title: z.string().max(128).optional(),
    description: z.string().max(512).optional(),
    schema: BoundedJsonSchemaTopLevel,
  })
  .strict()

/**
 * ContributesSchema — `commands` and `hooks` are validated explicitly; other
 * keys (`configuration`, plus future contribution points like `themes` /
 * `keybindings`) flow through untyped so Plans C/G can tighten them
 * independently and `parse.ts` can emit typo / unknown-key warnings.
 */
const ContributesSchema = z
  .object({
    commands: CommandsContribution.optional(),
    hooks: HookContributionSchema.optional(),
    configuration: ConfigurationContributionSchema.optional(),
  })
  .passthrough()

export const ManifestSchema = z
  .object({
    $schema: z.string().optional(),
    manifestVersion: z.literal(1),
    id: PluginIdSchema,
    name: z.string().min(1).max(128),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/),
    description: z.string().max(512),
    author: z.string().max(256).optional(),
    homepage: z.string().url().optional(),
    repository: z.string().max(512).optional(),
    license: z.string().max(64).optional(),
    icon: z.string().max(256).optional(),
    categories: z.array(CategorySchema).min(1).max(8),
    keywords: z.array(z.string().max(32)).max(16).optional(),
    engines: z
      .object({
        motrix: z.string().regex(SEMVER_RANGE_RE),
        ffmpeg: z.string().regex(SEMVER_RANGE_RE).optional(),
      })
      .strict(),
    main: z.string().max(256),
    requestedHeapMB: z.number().int().min(32).max(64).optional(),
    permissions: z
      .array(z.string().regex(PERMISSION_RE))
      .max(32)
      .refine(
        (perms) =>
          !perms.some((p) =>
            (KNOWN_AUTO_INJECTED as readonly string[]).includes(p)
          ),
        { message: 'auto-injected capabilities cannot appear in permissions[]' }
      ),
    optionalPermissions: z
      .array(z.string().regex(PERMISSION_RE))
      .max(32)
      .optional(),
    hostPermissions: z
      .array(
        z
          .string()
          .max(256)
          .refine(
            (p) => p === '<all_urls>' || MATCH_PATTERN_RE.test(p),
            'invalid host permission pattern'
          )
      )
      .max(64)
      .optional(),
    invokesCommands: z
      .array(z.string().regex(COMMAND_ID_RE).max(128))
      .max(64)
      .optional(),
    activationEvents: z.array(z.string().max(128)).min(1).max(64),
    contributes: ContributesSchema,
    l10n: z.string().max(256).optional(),
  })
  .strict()

export type ManifestZodOutput = z.infer<typeof ManifestSchema>
export type CommandContribution = z.infer<typeof CommandContributionSchema>
