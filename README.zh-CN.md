# Motrix 插件 SDK

[English](./README.md) · **简体中文**

本仓库是 [Motrix](https://motrix.app) 的插件开发 SDK：四个包，供第三方作者
编写、校验、打包 Motrix 插件。它是从 `motrix-turbo` 这个 app monorepo 中拆分
出来的——拆分的完整理由见
`motrix-turbo/docs/superpowers/specs/2026-07-20-plugin-sdk-repo-extraction-design.md`——
目的是让 SDK 能按自己的节奏发版，不再跟 app 的发布绑在一起。

## 包组成

| 包 | npm 包名 | 作用 |
|---|---|---|
| `packages/plugin-manifest-schema` | `@motrix/plugin-manifest-schema` | 插件 manifest（`motrix-plugin.json`）的 [Zod](https://zod.dev) schema——这个形状的唯一权威来源 |
| `packages/plugin-api` | `@motrix/plugin-api` | 面向插件作者的类型定义，以及插件运行时导入的 `motrix:plugin-api` 虚拟模块（ambient module）声明 |
| `packages/plugin-cli` | `@motrix/plugin-cli` | `motrix-plugin` CLI——`init` / `validate` / `lint` / `pack` / `dev`——构建时会把 manifest schema 内联进自己的产物 |
| `packages/create-motrix-plugin` | `create-motrix-plugin` | `pnpm create motrix-plugin` 脚手架，内部委托给 `plugin-cli` |

## 依赖关系

```
plugin-manifest-schema ← plugin-cli ← create-motrix-plugin
plugin-api（独立，不依赖其他三个）
```

`plugin-cli` 对 `plugin-manifest-schema` 只是 **devDependency**——它在构建时
（tsup 的 `noExternal`）把 schema 内联进自己的产物，所以安装
`@motrix/plugin-cli` 并不会把 `@motrix/plugin-manifest-schema` 作为独立的运行时
依赖拉进来。`create-motrix-plugin` 对 `plugin-cli` 是普通的运行时依赖，本身只是
一个 bin，没有构建步骤。`plugin-api` 不依赖另外三个包。

仓库内部这些依赖都写成 `workspace:*`；发布每个包时 pnpm 会把它们改写成真实的
版本区间。

## 开发

```bash
pnpm install
pnpm build              # pnpm -r build —— 构建所有包
pnpm typecheck          # pnpm -r typecheck
pnpm test               # pnpm -r test
pnpm lint               # biome check .
pnpm run check:facade   # 校验 manifest-schema 门面（见下文）
```

## manifest-schema 门面规则

`packages/plugin-cli/src/manifest-schema.ts` 必须始终是一份纯粹的重导出——
`export * from '@motrix/plugin-manifest-schema'`——不允许再多写一行。
`scripts/check-facade.mjs` 负责校验这一点，并在 CI 中执行。如果要改 manifest
的校验行为，改动应该落在 `packages/plugin-manifest-schema/`，绝不要动这个
门面文件本身。

## 发布

发布由人工执行：逐个包运行 `pnpm publish`，按依赖顺序进行——
`plugin-manifest-schema` → `plugin-api` → `plugin-cli` →
`create-motrix-plugin`。本仓库不涉及任何产物签名；给插件包签名的 Ed25519
`.moext` 签名流水线属于 `builtin-plugins` 仓库，跟这里发布的 npm 包无关。

## 使用方

- 外部插件作者——从 npm 安装这些包来开发自己的插件。
- `motrix-turbo`——Motrix app 通过一层 host 校验器门面依赖
  `@motrix/plugin-manifest-schema`（这一层由它自己的 `check:schema-parity`
  检查守护），并在 `examples:pack` 脚本里使用 `@motrix/plugin-cli`。这里的
  schema 一旦变更：先在本仓库发新版本，再去 `motrix-turbo` 里升级依赖版本，
  然后必须跑通它的 `check:schema-parity`。
- `builtin-plugins` 仓库，依赖 `@motrix/plugin-api`。

## 许可证

MIT——见 [LICENSE](./LICENSE)。
