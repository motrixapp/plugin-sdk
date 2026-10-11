#!/usr/bin/env node
import { init, type TemplateName, templateNames } from '../commands/init'

const [name = 'my-plugin', rawTemplate = 'basic-resolver'] =
  process.argv.slice(2)
if (!templateNames.includes(rawTemplate as TemplateName)) {
  console.error(
    `Unknown template: ${rawTemplate}. Available: ${templateNames.join(', ')}`
  )
  process.exit(1)
}
const template = rawTemplate as TemplateName
const result = await init({
  projectName: name,
  template,
  destDir: process.cwd(),
  publisher: 'me',
})
console.log('Created', name)
if (result.notice) console.log(result.notice)
