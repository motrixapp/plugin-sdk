import { readFile, writeFile } from 'node:fs/promises'

const declarationPath = new URL('../dist/index.d.ts', import.meta.url)
const reference = '/// <reference path="../src/virtual-module.d.ts" />\n'
const declaration = await readFile(declarationPath, 'utf8')

if (!declaration.startsWith(reference)) {
  await writeFile(declarationPath, `${reference}${declaration}`, 'utf8')
}
