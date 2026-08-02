#!/usr/bin/env node
import { Command, Option } from 'commander'
import { dev } from '../commands/dev'
import { init } from '../commands/init'
import { lint } from '../commands/lint'
import { pack } from '../commands/pack'
import { validate } from '../commands/validate'
import { validateHostPermissions } from '../commands/validate-host-permissions'

const program = new Command()
  .name('motrix-plugin')
  .description('Motrix plugin developer tools')
  .version('2.1.0')

program
  .command('init <name>')
  .addOption(
    new Option('-t, --template <id>', 'template')
      .choices(['basic-resolver', 'post-action'])
      .default('basic-resolver')
  )
  .option('-p, --publisher <pub>', 'publisher name', 'me')
  .action(
    async (
      name: string,
      opts: {
        template: 'basic-resolver' | 'post-action'
        publisher: string
      }
    ) => {
      const r = await init({
        projectName: name,
        template: opts.template,
        destDir: process.cwd(),
        publisher: opts.publisher,
      })
      console.log(`Created ${r.created}`)
    }
  )

program.command('pack').action(async () => {
  // A failed gate is an expected outcome (bad manifest, missing locale key,
  // oversized bundle), not a crash — report it the way `validate` does instead
  // of letting an unhandled rejection print a V8 stack trace over the message.
  try {
    const r = await pack({ projectDir: process.cwd() })
    console.log(`Packed → ${r.outFile} (${r.totalSize} bytes)`)
    // Printed because a registry entry needs it verbatim as package.sha256,
    // and because the archive is reproducible: re-packing the same tree must
    // print this same digest.
    console.log(`sha256   ${r.sha256}`)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
})

program.command('validate').action(async () => {
  const r = await validate(process.cwd())
  if (!r.ok) {
    for (const e of r.errors) console.error(e)
    process.exit(1)
  }
  console.log('manifest OK')
})

program.command('lint').action(async () => {
  const { warnings, errors } = await lint(process.cwd())
  for (const w of warnings) console.warn('WARN:', w)
  for (const e of errors) console.error('ERROR:', e)
  if (errors.length > 0) process.exit(1)
})

program.command('dev').action(() => dev(process.cwd()))

program.command('validate-host-permissions').action(async () => {
  const r = await validateHostPermissions(process.cwd())
  for (const w of r.warnings) console.warn('WARN:', w)
  for (const e of r.errors) console.error('ERROR:', e)
  if (!r.ok) process.exit(1)
  console.log(
    r.warnings.length > 0
      ? `hostPermissions OK (${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'})`
      : 'hostPermissions OK'
  )
})

program.parseAsync()
