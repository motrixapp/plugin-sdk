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

## Operation template (unreleased)

The development wrapper accepts `my-operation operation` as its two positional
arguments and generates a complete text deduplication project with publisher `me`.
For a custom publisher, use `motrix-plugin init my-operation -t operation -p acme`.
Use a matching development SDK and host; current published packages and the
generated dependency ranges do not establish support. See the [English guide](../../docs/operations.md)
or [Chinese guide](../../docs/operations.zh-CN.md) for a runnable source-checkout
workflow and local dependency setup. After matching packages are released, the
public shorthand will be `pnpm create motrix-plugin my-operation operation`.

Part of the [motrixapp/plugin-sdk](https://github.com/motrixapp/plugin-sdk)
monorepo. MIT licensed.
