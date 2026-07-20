#!/usr/bin/env node
import { init } from '../commands/init'

const validTemplates = ['basic-resolver', 'post-action'] as const
type Template = (typeof validTemplates)[number]

const [name = 'my-plugin', rawTemplate = 'basic-resolver'] =
  process.argv.slice(2)
if (!validTemplates.includes(rawTemplate as Template)) {
  console.error(
    `Unknown template: ${rawTemplate}. Available: ${validTemplates.join(', ')}`
  )
  process.exit(1)
}
const template = rawTemplate as Template
await init({
  projectName: name,
  template,
  destDir: process.cwd(),
  publisher: 'me',
})
console.log('Created', name)
