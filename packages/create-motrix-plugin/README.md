# create-motrix-plugin

Scaffold a new [Motrix](https://motrix.app) plugin project:

```bash
pnpm create motrix-plugin my-plugin
# or: npm create motrix-plugin my-plugin
```

This is a thin wrapper that delegates to
[`@motrix/plugin-cli`](https://www.npmjs.com/package/@motrix/plugin-cli)'s
`create-motrix-plugin` bin (`motrix-plugin init` under the hood). See the
plugin-cli README for template options and the full authoring workflow.

Part of the [motrixapp/plugin-sdk](https://github.com/motrixapp/plugin-sdk)
monorepo. MIT licensed.
