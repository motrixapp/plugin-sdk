import { z } from 'zod'

const field = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const text = z.string().min(1).max(512)
export type OperationLayout =
  | { type: 'field'; field: string; span?: 1 | 2; accessory?: string }
  | {
      type: 'text'
      text: string
      tone?: 'muted' | 'info'
      platform?: 'desktop' | 'web'
      span?: 1 | 2
    }
  | {
      type: 'stack' | 'grid' | 'group'
      children: OperationLayout[]
      title?: string
      collapsible?: boolean
      columns?: 1 | 2
      span?: 1 | 2
    }
const layout: z.ZodType<OperationLayout> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal('field'),
      field,
      span: z.union([z.literal(1), z.literal(2)]).optional(),
      accessory: field.optional(),
    }),
    z.strictObject({
      type: z.literal('text'),
      text,
      tone: z.enum(['muted', 'info']).optional(),
      platform: z.enum(['desktop', 'web']).optional(),
      span: z.union([z.literal(1), z.literal(2)]).optional(),
    }),
    z.strictObject({
      type: z.enum(['stack', 'grid', 'group']),
      collapsible: z.boolean().optional(),
      children: z.array(layout).min(1).max(24),
      title: text.optional(),
      columns: z.union([z.literal(1), z.literal(2)]).optional(),
      span: z.union([z.literal(1), z.literal(2)]).optional(),
    }),
  ])
)
export const OperationUiSchema = z.strictObject({
  layout: z
    .unknown()
    .refine((value) => {
      const stack = [{ value, depth: 1 }]
      const seen = new Set<unknown>()
      let count = 0
      while (stack.length) {
        const item = stack.pop()
        if (!item || ++count > 64 || item.depth > 4 || seen.has(item.value))
          return false
        seen.add(item.value)
        if (
          item.value &&
          typeof item.value === 'object' &&
          'children' in item.value
        ) {
          const children = item.value.children
          if (!Array.isArray(children) || children.length > 24) return false
          for (const value of children)
            stack.push({ value, depth: item.depth + 1 })
        }
      }
      return true
    }, 'layout exceeds structural limits')
    .pipe(layout),
  submitLabel: text.optional(),
  repeatLabel: text.optional(),
  footer: text.optional(),
  repeat: z.enum(['reset', 'preserve-options', 'preserve-inputs']).optional(),
})
export const OperationFieldAppearanceSchema = z.strictObject({
  icon: z
    .enum(['video', 'audio', 'folder', 'document', 'text', 'checksum'])
    .optional(),
  tone: z.enum(['neutral', 'blue', 'violet', 'amber']).optional(),
  placeholder: text.optional(),
  browseLabel: text.optional(),
  drop: z.boolean().optional(),
})
export type OperationUi = z.infer<typeof OperationUiSchema>

/** Validate topology and references before rendering. Layout never changes authority. */
export function operationLayoutIssues(
  ui: OperationUi,
  fields: string[],
  files: Record<string, { kind: string }>
): string[] {
  const issues: string[] = []
  const bindings: string[] = []
  let count = 0
  const visit = (node: OperationLayout, depth: number, collapsible = false) => {
    if (++count > 64 || depth > 4) {
      issues.push('layout exceeds 64 nodes or 4 levels')
      return
    }
    if (node.type === 'field') {
      bindings.push(node.field)
      if (collapsible && files[node.field])
        issues.push('file cannot be inside a collapsible group')
      if (node.accessory) {
        bindings.push(node.accessory)
        if (files[node.accessory]) issues.push('file cannot be an accessory')
        if (files[node.field]?.kind === 'input-file')
          issues.push('input card cannot contain an accessory')
      }
    } else if ('children' in node) {
      if (node.collapsible && (node.type !== 'group' || !node.title))
        issues.push('collapsible requires a titled group')
      if (node.columns !== undefined && node.type !== 'grid')
        issues.push('columns require grid')
      for (const child of node.children)
        visit(child, depth + 1, collapsible || node.collapsible === true)
    }
  }
  visit(ui.layout, 1)
  if (
    bindings.length !== fields.length ||
    new Set(bindings).size !== fields.length ||
    fields.some((f) => !bindings.includes(f))
  )
    issues.push('layout must bind every field exactly once')
  return issues
}
export function mapOperationUiText(
  ui: OperationUi,
  map: (text: string) => string
): OperationUi {
  const visit = (node: OperationLayout): OperationLayout => {
    if (node.type === 'field') return node
    if (node.type === 'text') return { ...node, text: map(node.text) }
    return {
      ...node,
      ...(node.title ? { title: map(node.title) } : {}),
      children: node.children.map(visit),
    }
  }
  return {
    ...ui,
    layout: visit(ui.layout),
    ...(ui.submitLabel ? { submitLabel: map(ui.submitLabel) } : {}),
    ...(ui.repeatLabel ? { repeatLabel: map(ui.repeatLabel) } : {}),
    ...(ui.footer ? { footer: map(ui.footer) } : {}),
  }
}
