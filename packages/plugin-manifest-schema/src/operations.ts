import { z } from 'zod'
import {
  OperationFieldAppearanceSchema,
  OperationUiSchema,
  operationLayoutIssues,
} from './operation-ui'
import type { BoundedJsonSchemaShape, ManifestZodOutput } from './schema'

const own = (value: object, key: string) => Object.hasOwn(value, key)
const identifier = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine((s) => !['__proto__', 'prototype', 'constructor'].includes(s))
const qualifiedId = z.string().min(1).max(228)
const scalar = z.union([z.string().max(4096), z.number().finite(), z.boolean()])
export type OperationScalar = z.infer<typeof scalar>

/** Iterative limits run before recursive parsing, including for programmatic callers. */
export function boundedOperationJson(
  value: unknown,
  bytes = 65536,
  depth = 14
): boolean {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let budget = 0
  const utf8 = (text: string) => {
    let size = 0
    for (const ch of text) {
      const point = ch.codePointAt(0) ?? 0
      size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4
    }
    return size
  }
  while (stack.length) {
    const item = stack.pop()
    if (!item) break
    if (++nodes > 4096 || item.depth > depth) return false
    const v = item.value
    if (v === null || typeof v === 'boolean') budget += 5
    else if (typeof v === 'string') budget += utf8(JSON.stringify(v))
    else if (typeof v === 'number' && Number.isFinite(v)) budget += 32
    else if (typeof v === 'object') {
      if (seen.has(v)) return false
      seen.add(v)
      const entries = Object.entries(v)
      budget += 2 + entries.length
      for (const [key, child] of entries) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          return false
        budget += utf8(JSON.stringify(key)) + 1
        stack.push({ value: child, depth: item.depth + 1 })
      }
    } else return false
    if (budget > bytes) return false
  }
  return true
}

export type OperationCondition =
  | { field: string; equals: OperationScalar }
  | { field: string; in: OperationScalar[] }
  | { all: OperationCondition[] }
  | { any: OperationCondition[] }
  | { not: OperationCondition }
const condition: z.ZodType<OperationCondition> = z.lazy(() =>
  z.union([
    z.strictObject({ field: identifier, equals: scalar }),
    z.strictObject({ field: identifier, in: z.array(scalar).min(1).max(64) }),
    z.strictObject({ all: z.array(condition).min(1).max(8) }),
    z.strictObject({ any: z.array(condition).min(1).max(8) }),
    z.strictObject({ not: condition }),
  ])
)
const conditionSchema = z
  .unknown()
  .refine(
    (v) => boundedOperationJson(v, 4096, 9),
    'operation condition exceeds limits'
  )
  .pipe(condition)
const extensions = z
  .array(z.string().regex(/^[a-z0-9]{1,12}$/))
  .min(1)
  .max(16)
export const OperationFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('input-file'),
    use: z.enum(['media', 'text']),
    extensions: extensions.optional(),
  }),
  z.strictObject({
    kind: z.literal('output-file'),
    use: z.enum(['media', 'text']),
    extensions: extensions.optional(),
    extensionFrom: identifier.optional(),
    suggestedName: z
      .strictObject({
        stemFrom: identifier,
        suffix: z.string().regex(/^[A-Za-z0-9_-]{0,32}$/),
      })
      .optional(),
  }),
])
export const OperationDefinitionSchema = z.strictObject({
  id: qualifiedId,
  title: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  icon: z.enum(['action', 'media-merge', 'document', 'checksum']).optional(),
  command: qualifiedId,
  requires: z
    .array(z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/))
    .max(16)
    .optional(),
  ui: OperationUiSchema.optional(),
  fields: z
    .array(
      z.strictObject({
        field: identifier,
        label: z.string().min(1).max(128).optional(),
        help: z.string().max(512).optional(),
        appearance: OperationFieldAppearanceSchema.optional(),
        widget: z
          .enum(['text', 'textarea', 'number', 'switch', 'select', 'segmented'])
          .optional(),
        optionLabels: z
          .record(z.string().max(4096), z.string().max(128))
          .optional(),
        visibleWhen: conditionSchema.optional(),
        enabledWhen: conditionSchema.optional(),
      })
    )
    .max(24),
  files: z.record(identifier, OperationFileSchema).optional(),
  entries: z
    .array(
      z.discriminatedUnion('surface', [
        z.strictObject({ surface: z.literal('plugin-detail') }),
        z.strictObject({
          surface: z.literal('task-menu'),
          selection: z.strictObject({
            count: z.strictObject({
              min: z.number().int().min(1).max(4),
              max: z.number().int().min(1).max(4),
            }),
            every: z.strictObject({
              status: z.literal('completed'),
              files: z.literal('single'),
              local: z.literal(true),
            }),
          }),
          bind: z.record(
            identifier,
            z.strictObject({
              source: z.literal('task-file'),
              index: z.number().int().min(0).max(3),
            })
          ),
        }),
      ])
    )
    .min(1)
    .max(2),
  result: z
    .strictObject({
      fields: z.array(identifier).max(24).optional(),
      files: z.array(identifier).max(1).optional(),
    })
    .optional(),
  errors: z.record(identifier, z.string().min(1).max(512)).optional(),
})
export const OperationsContributionSchema = z
  .unknown()
  .refine((v) => boundedOperationJson(v), 'operations exceed structural limits')
  .pipe(
    z.strictObject({
      version: z.literal(1),
      items: z.array(OperationDefinitionSchema).min(1).max(16),
    })
  )
export type OperationDefinition = z.infer<typeof OperationDefinitionSchema>
export type OperationFileBinding = z.infer<typeof OperationFileSchema>
export type OperationsContribution = z.infer<
  typeof OperationsContributionSchema
>

export function matchesOperationCondition(
  test: OperationCondition | undefined,
  args: Record<string, unknown>
): boolean {
  if (!test) return true
  if ('all' in test)
    return test.all.every((x) => matchesOperationCondition(x, args))
  if ('any' in test)
    return test.any.some((x) => matchesOperationCondition(x, args))
  if ('not' in test) return !matchesOperationCondition(test.not, args)
  const value = own(args, test.field) ? args[test.field] : undefined
  return 'equals' in test
    ? value === test.equals
    : test.in.some((x) => x === value)
}

export function validateOperationValues(
  schema: BoundedJsonSchemaShape,
  input: unknown,
  defaults = true
): {
  value: Record<string, OperationScalar>
  errors: Record<string, string>
} {
  const value: Record<string, OperationScalar> = {}
  const errors: Record<string, string> = {}
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { value, errors: { $: 'object' } }
  const raw = input as Record<string, unknown>
  const props = schema.properties ?? {}
  for (const key of Object.keys(raw))
    if (!own(props, key)) errors[key] = 'unknown'
  for (const [key, p] of Object.entries(props)) {
    const v = own(raw, key) ? raw[key] : defaults ? p.default : undefined
    if (v === undefined) {
      if (schema.required?.includes(key)) errors[key] = 'required'
      continue
    }
    let valid =
      p.type === 'string'
        ? typeof v === 'string'
        : p.type === 'boolean'
          ? typeof v === 'boolean'
          : typeof v === 'number' &&
            Number.isFinite(v) &&
            (p.type !== 'integer' || Number.isInteger(v))
    if (typeof v === 'string')
      valid &&=
        [...v].length >= (p.minLength ?? 0) &&
        [...v].length <= (p.maxLength ?? 4096)
    if (typeof v === 'number')
      valid &&= v >= (p.minimum ?? -Infinity) && v <= (p.maximum ?? Infinity)
    if (p.enum) valid &&= p.enum.includes(v)
    if (!valid) errors[key] = 'invalid'
    else value[key] = v as OperationScalar
  }
  return { value, errors }
}

/** Used by the manifest itself, so host parsing and both pack pipelines agree. */
export function operationManifestIssues(manifest: ManifestZodOutput): string[] {
  const ops = manifest.contributes.operations?.items ?? []
  const commands = manifest.contributes.commands ?? []
  const issues: string[] = []
  const fail = (message: string) =>
    issues.push(`plugin.manifest.operation: ${message}`)
  const unique = (values: string[]) => new Set(values).size === values.length
  if (!unique(ops.map((o) => o.id))) fail('duplicate operation id')
  if (!unique(commands.map((c) => c.id))) fail('duplicate command id')
  const checkSchema = (
    s: BoundedJsonSchemaShape | undefined
  ): s is BoundedJsonSchemaShape => {
    if (
      s?.type !== 'object' ||
      s.additionalProperties !== false ||
      !s.properties ||
      Object.keys(s.properties).length > 24
    )
      return false
    if (
      s.pattern ||
      s.secret !== undefined ||
      s.items ||
      s.enum ||
      s.default !== undefined
    )
      return false
    if (
      !unique(s.required ?? []) ||
      s.required?.some((k) => !own(s.properties ?? {}, k))
    )
      return false
    return Object.entries(s.properties).every(([key, p]) => {
      if (
        !identifier.safeParse(key).success ||
        !['string', 'number', 'integer', 'boolean'].includes(p.type ?? '')
      )
        return false
      if (
        p.properties ||
        p.items ||
        p.pattern !== undefined ||
        p.secret !== undefined ||
        p.additionalProperties !== undefined ||
        p.required
      )
        return false
      if (p.type === 'string') {
        if (p.minimum !== undefined || p.maximum !== undefined) return false
        if (!p.enum && (p.maxLength === undefined || p.maxLength > 4096))
          return false
        if ((p.minLength ?? 0) > (p.maxLength ?? 4096)) return false
        if (
          p.enum &&
          (p.enum.length === 0 ||
            p.enum.length > 64 ||
            !p.enum.every((x) => typeof x === 'string' && x.length <= 4096) ||
            !unique(p.enum as string[]))
        )
          return false
      } else {
        if (p.enum || p.minLength !== undefined || p.maxLength !== undefined)
          return false
        if (
          p.type !== 'boolean' &&
          (p.minimum === undefined ||
            p.maximum === undefined ||
            p.minimum > p.maximum)
        )
          return false
        if (
          p.type === 'boolean' &&
          (p.minimum !== undefined || p.maximum !== undefined)
        )
          return false
      }
      return (
        p.default === undefined ||
        Object.keys(
          validateOperationValues(
            { properties: { [key]: p } },
            { [key]: p.default }
          ).errors
        ).length === 0
      )
    })
  }
  for (const command of commands) {
    if (command.execution !== 'operation') continue
    if (
      command.public ||
      !checkSchema(command.argsSchema) ||
      !checkSchema(command.resultSchema)
    )
      fail(`${command.id}: private operation requires flat bounded schemas`)
    if (!ops.some((o) => o.command === command.id))
      fail(`${command.id}: orphan operation command`)
  }
  for (const op of ops) {
    const c = commands.find((x) => x.id === op.command)
    if (
      !op.id.startsWith(`${manifest.id}.`) ||
      !op.command.startsWith(`${manifest.id}.`) ||
      c?.execution !== 'operation' ||
      c.public
    ) {
      fail(`${op.id}: invalid handler`)
      continue
    }
    if (!checkSchema(c.argsSchema) || !checkSchema(c.resultSchema)) continue
    const props = c.argsSchema.properties ?? {}
    const files = op.files ?? {}
    if (!boundedOperationJson(op, 8192)) fail(`${op.id}: description too large`)
    if (
      !unique(op.fields.map((f) => f.field)) ||
      op.fields.length !== Object.keys(props).length
    )
      fail(`${op.id}: fields must bind every argument exactly once`)
    if (op.ui) {
      if (!op.requires?.includes('operations.ui.v1'))
        fail(`${op.id}: UI capability required`)
      for (const issue of operationLayoutIssues(
        op.ui,
        op.fields.map((f) => f.field),
        files
      ))
        fail(`${op.id}: ${issue}`)
    }
    let nodes = 0
    const visit = (test: OperationCondition, depth = 1) => {
      if (++nodes > 64 || depth > 4) {
        fail(`${op.id}: condition limit`)
        return
      }
      if ('field' in test) {
        if (!own(props, test.field) || own(files, test.field))
          fail(`${op.id}: invalid condition field`)
        const p = props[test.field]
        for (const v of 'equals' in test ? [test.equals] : test.in)
          if (
            !p ||
            Object.keys(
              validateOperationValues(
                { properties: { value: p } },
                { value: v }
              ).errors
            ).length
          )
            fail(`${op.id}: condition value mismatch`)
      } else if ('not' in test) visit(test.not, depth + 1)
      else
        for (const t of 'all' in test ? test.all : test.any) visit(t, depth + 1)
    }
    for (const f of op.fields) {
      const p = props[f.field]
      if (!p) {
        fail(`${op.id}: unknown field`)
        continue
      }
      if (f.visibleWhen) visit(f.visibleWhen)
      if (f.enabledWhen) visit(f.enabledWhen)
      if (
        (f.visibleWhen || f.enabledWhen) &&
        c.argsSchema.required?.includes(f.field) &&
        p.default === undefined
      )
        fail(`${op.id}: conditional required field needs a default`)
      if (f.appearance?.drop && files[f.field]?.kind !== 'input-file')
        fail(`${op.id}: drop requires input file`)
      if (
        (f.appearance?.icon ||
          f.appearance?.tone ||
          f.appearance?.browseLabel) &&
        !own(files, f.field)
      )
        fail(`${op.id}: file appearance requires file`)
      if (own(files, f.field)) {
        if (f.widget || f.visibleWhen || f.enabledWhen || f.optionLabels)
          fail(`${op.id}: file presentation cannot alter authorization`)
      } else if (
        f.widget === 'select' || f.widget === 'segmented'
          ? !p.enum
          : f.widget === 'switch'
            ? p.type !== 'boolean'
            : f.widget === 'number'
              ? !['number', 'integer'].includes(p.type ?? '')
              : f.widget
                ? p.type !== 'string'
                : false
      )
        fail(`${op.id}: incompatible widget`)
      if (
        f.optionLabels &&
        Object.keys(f.optionLabels).some((key) => !p.enum?.includes(key))
      )
        fail(`${op.id}: option labels must reference enum values`)
    }
    const bindings = Object.entries(files)
    if (
      bindings.filter(([, f]) => f.kind === 'input-file').length > 4 ||
      bindings.filter(([, f]) => f.kind === 'output-file').length > 1
    )
      fail(`${op.id}: too many files`)
    for (const [key, f] of bindings) {
      const p = props[key]
      if (
        p?.type !== 'string' ||
        p.default !== undefined ||
        p.enum ||
        (p.maxLength ?? Infinity) > 128 ||
        !c.argsSchema.required?.includes(key)
      )
        fail(`${op.id}: invalid file binding`)
      const permission =
        f.kind === 'input-file' ? 'files.selected.read' : 'files.selected.write'
      if (!manifest.permissions.includes(permission))
        fail(`${op.id}: missing ${permission}`)
      if (f.use === 'media' && !manifest.permissions.includes('ffmpeg'))
        fail(`${op.id}: missing ffmpeg`)
      if (f.kind === 'output-file') {
        if (
          f.extensionFrom &&
          (!props[f.extensionFrom]?.enum?.length ||
            !props[f.extensionFrom].enum?.every(
              (v) => typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v)
            ))
        )
          fail(`${op.id}: invalid extension source`)
        if (
          f.suggestedName &&
          files[f.suggestedName.stemFrom]?.kind !== 'input-file'
        )
          fail(`${op.id}: invalid suggested name source`)
        if (!f.extensions && !f.extensionFrom)
          fail(`${op.id}: output extensions required`)
      }
    }
    if (!unique(op.entries.map((e) => e.surface)))
      fail(`${op.id}: duplicate entry`)
    for (const entry of op.entries)
      if (entry.surface === 'task-menu') {
        if (entry.selection.count.min > entry.selection.count.max)
          fail(`${op.id}: invalid task count`)
        for (const [key, binding] of Object.entries(entry.bind))
          if (
            files[key]?.kind !== 'input-file' ||
            binding.index >= entry.selection.count.min
          )
            fail(`${op.id}: invalid task binding`)
      }
    for (const key of op.result?.fields ?? [])
      if (!own(c.resultSchema.properties ?? {}, key))
        fail(`${op.id}: invalid result field`)
    for (const key of op.result?.files ?? [])
      if (
        files[key]?.kind !== 'output-file' ||
        c.resultSchema.properties?.[key]?.type !== 'string'
      )
        fail(`${op.id}: invalid output result`)
    for (const [key, f] of bindings)
      if (f.kind === 'output-file' && !op.result?.files?.includes(key))
        fail(`${op.id}: output must be returned`)
  }
  return issues
}
