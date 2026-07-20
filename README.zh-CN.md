# Motrix Plugin SDK

[English](./README.md) | **简体中文**

为开源下载管理器 [Motrix](https://motrix.app) 编写插件。插件挂载在下载的
生命周期上 —— 在下载开始前改写 URL、在文件落盘前重命名、在下载完成后做
后续处理 —— 并运行在一个隔离的 JavaScript 沙箱里,权限模型基于 capability。

```bash
pnpm create motrix-plugin my-plugin
cd my-plugin && pnpm install
pnpm dev      # watch-build + launch Motrix with your plugin loaded
pnpm run pack # produce a distributable .moext
```

## 插件能做什么

- **Resolve**:在下载创建之前拦截它 —— 改写 URI、指定文件名、注入
  headers 或 proxy(`beforeCreate`)。
- **Post-process**:在下载完成后运行 —— 用 `beforeFinalize` 重命名、用
  `afterComplete` 发通知或交接给其他工具、用 `onError` 响应失败。
- **贡献 command**:注册可被其他插件(或 host)调用的 command,参数由
  JSON Schema 校验。
- **携带设置**:声明一份 configuration schema;用户在 Motrix 的 UI 里
  编辑,你的代码通过 `config` capability 读取。

插件是打包成单个 ES2020 module 的 TypeScript/JavaScript。它运行在沙箱
里 —— 没有 Node.js API,不能直接访问文件或网络。与外界的一切交互都要
经过你在 manifest 里声明的 capability,用户在安装时能看到你申请了什么。

## 快速开始

```bash
pnpm create motrix-plugin my-plugin              # basic-resolver template
pnpm create motrix-plugin my-plugin post-action  # template as second argument
```

模板:

| 模板 | 初始内容 |
|---|---|
| `basic-resolver`(默认) | 一个检查并改写下载的 `beforeCreate` hook(`site-resolver` category) |
| `post-action` | 一个下载完成后发桌面通知的 `afterComplete` hook(`post-action` category) |

脚手架生成的插件 id 初始为 `me.<name>`。要设置真实的 publisher
(`<publisher>.<name>` 的前缀),可以直接编辑 `motrix-plugin.json` 里的
`id`,或改用支持 flag 的完整 CLI 来脚手架:

```bash
pnpm --package=@motrix/plugin-cli dlx motrix-plugin init my-plugin -t post-action -p acme
```

脚手架结构:

```
my-plugin/
├── motrix-plugin.json      # the manifest — identity, permissions, hooks
├── src/index.ts            # your entry point
├── locales/                # en-US.json, zh-CN.json (UI strings)
├── esbuild.config.mjs      # standalone build (pack/dev bundle for you)
├── package.json            # scripts: build / pack / dev
└── tsconfig.json
```

第一个 hook 已经接好了:

```ts
import { hooks, log } from 'motrix:plugin-api'

hooks.beforeCreate(async (ctx) => {
  log.info('resolving', { uri: ctx.uris[0] })
  // rewrite the download before it starts:
  // ctx.update({ filename: 'nicer-name.zip' })
  return ctx
})
```

## 开发循环

```bash
pnpm dev        # = motrix-plugin dev
```

`dev` 会 watch-build `src/index.ts`(带 inline sourcemap),并启动你本机
的 Motrix、从工作目录加载插件。改代码,bundle 自动重建;改
`motrix-plugin.json` 或 `locales/`,host 会重载插件。Motrix 从标准安装
路径自动定位,也可以用 `MOTRIX_BIN=/path/to/motrix` 显式指定。

发布之前:

```bash
pnpm exec motrix-plugin validate   # manifest against the official schema
pnpm run pack                      # minified bundle + .moext archive
pnpm exec motrix-plugin lint       # static checks on the packed bundle
```

(注意是 `pnpm run pack` 而不是 `pnpm pack` —— 裸的 `pnpm pack` 会调用
pnpm 内置的 tarball 打包命令,而不是脚手架里的 script。)

## Manifest

`motrix-plugin.json` 是插件与 host 之间的契约。一个最小的 resolver:

```json
{
  "manifestVersion": 1,
  "id": "acme.example-resolver",
  "name": "Example Resolver",
  "version": "0.1.0",
  "description": "Rewrites example.com download links",
  "categories": ["site-resolver"],
  "engines": { "motrix": ">=2.0.0 <3.0.0" },
  "main": "dist/plugin.js",
  "permissions": ["http"],
  "hostPermissions": ["https://example.com/*"],
  "activationEvents": ["onTaskType:http"],
  "contributes": {
    "hooks": { "beforeCreate": { "role": "resolve" } }
  },
  "l10n": "locales"
}
```

字段参考(由 `motrix-plugin validate` 强制):

| 字段 | 规则 |
|---|---|
| `id` | `<publisher>.<name>`,小写 `a-z0-9-`。publisher 前缀 `motrix`、`verified`、`official`、`system` 为保留字。 |
| `version` | Semver(`1.2.3`,允许 prerelease/build 后缀)。 |
| `categories` | 从 `site-resolver`、`post-action`、`theme`、`productivity`、`integration` 中选 1–8 个。hook 的 role 与 category 挂钩(见下)。 |
| `engines.motrix` | 支持的 Motrix 版本 semver range。可选的 `engines.ffmpeg` 同理。 |
| `permissions` | 必需的 capability(如 `http`、`notify`)。自动注入的 capability(`log`、`i18n`、`config`、`lifecycle`、`commands`、`app`、`crypto`)不允许列出。最多 32 个。 |
| `optionalPermissions` | 缺了也能用的 capability —— 不可用时安装照样成功;运行时检查 `.available`。 |
| `hostPermissions` | URL match pattern(`https://*.example.com/*`、`<all_urls>`),限定 `http` 能访问的范围。最多 64 个。`motrix-plugin validate-host-permissions` 可以帮你检查。 |
| `activationEvents` | host 何时加载你(如 `onTaskType:http`、`onStartup`)。必填。 |
| `contributes.hooks` | 你实现了哪些生命周期 hook,每个都要带 `role`。 |
| `contributes.commands` | 你注册的 command:id 形如 `<publisher>.<plugin>.<command>`,最多 64 个。标记 `public: true` 的 command 必须声明 `argsSchema` + `resultSchema`(受限的 JSON-Schema 子集 —— 不支持 `$ref`/`oneOf`,≤ 8 KiB,深度 ≤ 8)。 |
| `contributes.configuration` | 你的设置 schema(同一受限子集)。运行时通过 `config` capability 读取。 |
| `requestedHeapMB` | 沙箱堆大小,32(默认)到 64。 |
| `l10n` | locale JSON 文件所在目录。 |

## 运行时 API — `motrix:plugin-api`

一切都从 `motrix:plugin-api` 这个 virtual module import。类型来自
`@motrix/plugin-api` 包(脚手架里是 devDependency);实现由 host 注入 ——
永远不要把它打进 bundle(脚手架的 esbuild 配置已将其标记为 `external`)。

始终可用(自动注入):

| Namespace | 提供什么 |
|---|---|
| `log` | 结构化日志:`trace/debug/info/warn/error/fatal(msg, fields?)` |
| `i18n` | `t(key, params?)`、当前 `language`/`dir`、语言切换事件 |
| `config` | 读取你的 `contributes.configuration` 值;`onChange` 订阅 |
| `lifecycle` | `onActivate`/`onDeactivate`,做初始化与清理 |
| `commands` | 跨插件的 `register(id, handler)` / `execute(id, args)` |
| `app` | Host 的 `version`、`platform`、`arch`、`runtime`(`electron`/`server`)、`locale` |
| `crypto` | `hash`、`hmac`、`randomBytes`、`aes`(cbc/gcm) |

按权限开通(在 `permissions` / `optionalPermissions` 中声明,再检查
`.available`):

| Namespace | 提供什么 |
|---|---|
| `http` | `request`/`get`/`post`,响应类型化(`text`/`json`/`bytes`),支持 timeout、range、cookie-jar 按需开启 —— 范围受 `hostPermissions` 约束 |
| `storage` | 带版本号的 key-value 存储,`compareAndSet` 保证并发更新安全 |
| `fs.task` | 读取/stat/hash/重命名当前 hook 正在处理的任务文件 |
| `fs.storage` | 插件私有的 scratch 目录 |
| `notify` | 桌面通知 |
| `ffmpeg` | `probe`、`transcode`、`extractAudio`、`mergeStreams`、`generateThumbnail`,带 progress 流(需要用户系统里有 ffmpeg —— 请声明为 optional) |

优雅降级的写法:

```ts
import { notify } from 'motrix:plugin-api'

if (notify.available) {
  await notify.show({ title: 'Done', body: ctx.filePath })
}
```

## Hooks 与 roles

Hook 就是下载的生命周期。代码里实现的每个 hook 都要同时在
`contributes.hooks` 里声明并附带 role:

| Hook | 时机 | 能做什么 |
|---|---|---|
| `beforeCreate` | 下载创建之前 | 检查 `uris`、`headers`、`saveDir`;`ctx.update({ uris, filename, connections, headers, proxy })` |
| `beforeFinalize` | 数据下载完、文件尚未定稿 | `ctx.update({ filePath })` 重命名 |
| `afterComplete` | 文件已落盘 | 副作用:通知、后处理、交接 |
| `onError` | 任务失败 | 读取 `error.code`/`error.message`,记日志或通知 |

Role 决定同一 hook 上多个插件的执行顺序:
`resolve` → `enrich` → `post-process` → `audit`。其中两个与 category
挂钩:`resolve` 要求 `site-resolver` category,`post-process` 要求
`post-action`。不声明时,代码注册的 hook 按 `enrich` 执行。
(`pre-resolve` 保留给内置插件。)

每个 hook context 都带 `AbortSignal`(`ctx.signal`)—— 长耗时操作请
尊重它 —— 以及一个 `metadata` 存储,可在同一任务生命周期内的各个 hook
之间传值。

## CLI 参考

| 命令 | 作用 |
|---|---|
| `motrix-plugin init <name> [-t basic-resolver\|post-action] [-p publisher]` | 脚手架一个新插件项目 |
| `motrix-plugin dev` | watch-build + 启动本机 Motrix 并加载插件(`MOTRIX_BIN` 可覆盖自动定位) |
| `motrix-plugin validate` | 用官方 schema 校验 `motrix-plugin.json`;有错误时非零退出 |
| `motrix-plugin pack` | 打包(esbuild、minified、ES2020)并压成 `dist/<id>-<version>.moext` |
| `motrix-plugin lint` | 对打包产物做静态检查:top-level 副作用是 error;体积告警;`invokesCommands` 提示 |
| `motrix-plugin validate-host-permissions` | 检查 `hostPermissions` pattern 的常见错误 |

`pack` 强制分发上限 —— bundle ≤ 1 MiB、archive ≤ 5 MiB —— 并打入
`motrix-plugin.json`、`dist/plugin.js`、locale 文件,以及存在时的
`icon.png` / `LICENSE` / `CHANGELOG.md`。`lint` 检查的是打包产物,所以
要先 pack。

## 本地化

把 UI 字符串放进 `locales/<lang>.json`(脚手架自带 `en-US.json` 和
`zh-CN.json`),并让 manifest 的 `l10n` 字段指向该目录。运行时用
`i18n.t('key')` 读取。`pack` 会校验 locale 覆盖率 —— 缺 key 在构建时
失败,而不是留到用户会话里。

## 沙箱规则

- **禁止 top-level 副作用。**在顶层只注册 hook 和 command handler,
  工作放在 handler 里做。`lint` 会拒绝 top-level 的副作用调用 ——
  import 时就开始计算的插件会拖慢每一次 Motrix 启动。
- **没有 Node.js。**没有 `fs`、`net`、`process`、`require`。上面列出的
  capability 就是全部的外界入口。
- **管好堆内存。**沙箱给你 32 MB(经 `requestedHeapMB` 最多 64)。用流
  代替整块缓冲:`fs.task.openReader` 和 `http` 的 `range` 请求就是为
  这个准备的。
- **尊重 `ctx.signal`。**用户会取消下载;无视 abort signal 的 hook 会
  把整条流水线扣为人质。
- **目标 ES2020。**脚手架的 esbuild 配置已就绪;若使用自己的 bundler,
  保持 `motrix:plugin-api` external,并输出单个 ESM 文件。

## 分发插件

`motrix-plugin pack` 产出 `dist/<id>-<version>.moext`。用户在 Motrix 的
Plugins 页安装(**Install from .moext**)。安装时 Motrix 会弹出 consent
对话框,列出你的 `permissions`、`hostPermissions` 和 public command ——
只申请你真正需要的最小集合;过宽的 host pattern 和 `<all_urls>` 只会让
弹窗看起来比你的插件更吓人。

## 本仓库的包

| 包 | 是什么 |
|---|---|
| [`@motrix/plugin-api`](packages/plugin-api) | 类型 + `motrix:plugin-api` virtual-module 声明 |
| [`@motrix/plugin-cli`](packages/plugin-cli) | `motrix-plugin` CLI |
| [`create-motrix-plugin`](packages/create-motrix-plugin) | `pnpm create motrix-plugin` 脚手架 |
| [`@motrix/plugin-manifest-schema`](packages/plugin-manifest-schema) | manifest 的 Zod schema —— CLI 与 Motrix host 共同校验所依据的唯一事实来源 |

## 参与贡献

```bash
pnpm install
pnpm build            # tsup, all packages
pnpm typecheck
pnpm test             # vitest, all packages
pnpm lint             # biome
pnpm run check:facade # façade-purity guard
```

两条规则保证所有地方的校验一致:manifest schema 只改
`packages/plugin-manifest-schema`(`plugin-cli` 的 `src/manifest-schema.ts`
是受守护的纯 re-export);schema 发新版时必须同批发布配套的 CLI 版本,
因为 CLI 在构建时内嵌了 schema。

## License

[MIT](./LICENSE)
