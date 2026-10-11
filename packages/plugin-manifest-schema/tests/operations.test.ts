import { describe, expect, it } from 'vitest'
import {
  boundedOperationJson,
  ManifestSchema,
  matchesOperationCondition,
  validateOperationValues,
} from '../src'

const makeManifest = () => ({
  manifestVersion: 1,
  id: 'acme.text-tools',
  name: 'Text tools',
  version: '1.0.0',
  description: 'Selected text',
  categories: ['productivity'],
  engines: { motrix: '>=3.0.0' },
  main: 'dist/plugin.js',
  permissions: ['files.selected.read', 'files.selected.write'],
  activationEvents: ['onCommand:acme.text-tools.run'],
  contributes: {
    commands: [
      {
        id: 'acme.text-tools.run',
        title: 'Run',
        public: false,
        execution: 'operation',
        argsSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['input', 'output', 'sort'],
          properties: {
            input: { type: 'string', maxLength: 128 },
            output: { type: 'string', maxLength: 128 },
            sort: { type: 'boolean', default: false },
          },
        },
        resultSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['output'],
          properties: { output: { type: 'string', maxLength: 128 } },
        },
      },
    ],
    operations: {
      version: 1,
      items: [
        {
          id: 'acme.text-tools.dedup',
          title: 'Deduplicate',
          command: 'acme.text-tools.run',
          fields: [
            { field: 'input' },
            { field: 'sort', widget: 'switch' },
            { field: 'output' },
          ],
          files: {
            input: { kind: 'input-file', use: 'text' },
            output: { kind: 'output-file', use: 'text', extensions: ['txt'] },
          },
          entries: [{ surface: 'plugin-detail' }],
          result: { files: ['output'] },
        },
      ],
    },
  },
})
const rejects = (change: (m: ReturnType<typeof makeManifest>) => void) => {
  const m = makeManifest()
  change(m)
  expect(ManifestSchema.safeParse(m).success).toBe(false)
}
describe('plugin operations', () => {
  it('accepts an unsigned non-media operation', () =>
    expect(ManifestSchema.safeParse(makeManifest()).success).toBe(true))
  it('rejects public handlers', () =>
    rejects((m) => {
      m.contributes.commands[0].public = true
    }))
  it('requires explicit file permissions', () =>
    rejects((m) => {
      m.permissions = []
    }))
  it('rejects foreign handlers', () =>
    rejects((m) => {
      m.contributes.operations.items[0].command = 'other.plugin.run'
    }))
  it('rejects duplicate IDs and missing form bindings', () => {
    rejects((m) => {
      m.contributes.operations.items.push(m.contributes.operations.items[0])
    })
    rejects((m) => {
      m.contributes.operations.items[0].fields.pop()
    })
  })
  it('rejects code, regexes, default paths and hidden file fields', () => {
    rejects((m) => {
      m.contributes.operations.items[0].fields[1].widget = 'html'
    })
    rejects((m) => {
      Object.assign(m.contributes.commands[0].argsSchema.properties.input, {
        pattern: '(a+)+$',
      })
    })
    rejects((m) => {
      Object.assign(m.contributes.commands[0].argsSchema.properties.input, {
        default: '/etc/passwd',
      })
    })
    rejects((m) => {
      Object.assign(m.contributes.operations.items[0].fields[0], {
        visibleWhen: { field: 'sort', equals: false },
      })
    })
  })
  it('bounds hostile trees and Unicode before recursive parsing', () => {
    expect(boundedOperationJson(JSON.parse('{"__proto__":{}}'))).toBe(false)
    expect(boundedOperationJson('😀'.repeat(20000))).toBe(false)
    const cycle: Record<string, unknown> = {}
    cycle.x = cycle
    expect(boundedOperationJson(cycle)).toBe(false)
    let nested: unknown = true
    for (let i = 0; i < 10000; i++) nested = { not: nested }
    rejects((m) => {
      Object.assign(m.contributes.operations.items[0].fields[1], {
        visibleWhen: nested,
      })
    })
  })
  it('evaluates finite scalar conditions', () =>
    expect(
      matchesOperationCondition(
        {
          all: [
            { field: 'sort', equals: false },
            { not: { field: 'format', in: ['mkv'] } },
          ],
        },
        { sort: false, format: 'mp4' }
      )
    ).toBe(true))
  it('preserves false/zero/empty values and rejects unknown or missing args', () => {
    expect(
      validateOperationValues(
        {
          properties: {
            flag: { type: 'boolean', default: true },
            count: { type: 'integer', minimum: 0, maximum: 5 },
            text: { type: 'string', maxLength: 5 },
          },
        },
        { flag: false, count: 0, text: '' }
      )
    ).toEqual({ value: { flag: false, count: 0, text: '' }, errors: {} })
    const schema = ManifestSchema.parse(makeManifest()).contributes.commands![0]
      .argsSchema!
    expect(
      validateOperationValues(schema, { input: 'r', output: 'r2' }).value.sort
    ).toBe(false)
    expect(
      validateOperationValues(schema, { input: 'r', extra: 2 }).errors
    ).toEqual({ extra: 'unknown', output: 'required' })
    expect(
      validateOperationValues(schema, {
        input: 'r',
        output: 'r2',
        sort: 'true',
      }).errors.sort
    ).toBe('invalid')
  })
})

describe('composable operation UI security', () => {
  const withUi = (layout: unknown) => {
    const m = makeManifest()
    Object.assign(m.contributes.operations.items[0], {
      requires: ['operations.ui.v1'],
      ui: { layout },
    })
    return m
  }
  const fields = [
    { type: 'field', field: 'input' },
    { type: 'field', field: 'output', accessory: 'sort' },
  ]
  it('accepts a two-column layout with an inline option', () => {
    expect(
      ManifestSchema.safeParse(
        withUi({ type: 'grid', columns: 2, children: fields })
      ).success
    ).toBe(true)
  })
  it.each([
    { type: 'html', html: '<script>alert(1)</script>' },
    { type: 'stack', style: { position: 'fixed' }, children: fields },
    { type: 'stack', children: [{ type: 'field', field: 'input' }] },
    { type: 'stack', children: [...fields, { type: 'field', field: 'input' }] },
    {
      type: 'stack',
      children: [
        { type: 'field', field: 'sort', accessory: 'input' },
        { type: 'field', field: 'output' },
      ],
    },
    {
      type: 'stack',
      children: [
        { type: 'field', field: 'input', accessory: 'sort' },
        { type: 'field', field: 'output' },
      ],
    },
  ])(
    'rejects executable, obscured, duplicated or missing controls',
    (layout) => {
      expect(ManifestSchema.safeParse(withUi(layout)).success).toBe(false)
    }
  )
  it('rejects excessive recursion before recursive parsing', () => {
    let layout: unknown = { type: 'field', field: 'input' }
    for (let i = 0; i < 10000; i++)
      layout = { type: 'stack', children: [layout] }
    expect(ManifestSchema.safeParse(withUi(layout)).success).toBe(false)
  })
  it('rejects hiding authorized files inside collapsible groups', () => {
    expect(
      ManifestSchema.safeParse(
        withUi({
          type: 'group',
          title: 'Hidden files',
          collapsible: true,
          children: fields,
        })
      ).success
    ).toBe(false)
  })
  it('requires the UI host capability and forbids output drop zones', () => {
    const m = withUi({ type: 'grid', children: fields })
    Object.assign(m.contributes.operations.items[0], { requires: [] })
    expect(ManifestSchema.safeParse(m).success).toBe(false)
    Object.assign(m.contributes.operations.items[0], {
      requires: ['operations.ui.v1'],
    })
    Object.assign(m.contributes.operations.items[0].fields[2], {
      appearance: { drop: true },
    })
    expect(ManifestSchema.safeParse(m).success).toBe(false)
  })
})

it('accepts collapsible scalar options without hiding file grants', () => {
  const m = makeManifest()
  Object.assign(m.contributes.operations.items[0], {
    requires: ['operations.ui.v1'],
    ui: {
      layout: {
        type: 'stack',
        children: [
          { type: 'field', field: 'input' },
          {
            type: 'group',
            title: 'Options',
            collapsible: true,
            children: [{ type: 'field', field: 'sort' }],
          },
          { type: 'field', field: 'output' },
        ],
      },
    },
  })
  expect(ManifestSchema.safeParse(m).success).toBe(true)
})
