import { commands } from 'motrix:plugin-api'

commands.registerOperation<
  { input: string; output: string; ignoreCase: boolean },
  { output: string; lines: number }
>('{{PLUGIN_ID}}.deduplicate', async (args, context) => {
  const text = await context.files.readText(args.input)
  const seen = new Set<string>()
  const lines = text.split('\n').filter((line) => {
    context.signal.throwIfAborted()
    const key = args.ignoreCase ? line.toLowerCase() : line
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  await context.progress({ phase: 'running', fraction: 0.5 })
  await context.files.writeText(args.output, lines.join('\n'))
  return { output: args.output, lines: lines.length }
})
