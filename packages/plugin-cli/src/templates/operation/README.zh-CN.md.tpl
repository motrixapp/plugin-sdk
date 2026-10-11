# {{PROJECT_NAME}}

[English](./README.md) | **简体中文**

为 `{{PLUGIN_ID}}` 生成的文本去重操作项目。

> **协议与模板尚未发布。** 使用包含操作 v1、可组合 UI 和受限文本文件能力的 Motrix 构建及 SDK 包。宿主范围为 `>=2.0.0-beta.48 <3.0.0`，以 beta.48 为首个支持版本目标。beta.47 会被拒绝，包括仍使用该版本号的开发构建。此目标与依赖版本范围不代表已发布支持；若功能晚于 beta.48 发布，须同步提高最低宿主版本。

## 配置匹配的开发依赖

先在匹配的 plugin-sdk 源码仓库执行 `pnpm install --frozen-lockfile` 和 `pnpm build`。如果本项目直接创建在该仓库根目录下，请在**本项目目录**执行：

```sh
pnpm add -D @motrix/plugin-api@file:../packages/plugin-api @motrix/plugin-cli@file:../packages/plugin-cli
```

如果项目位于其他位置，将两个 `file:` 路径改为实际构建好的 SDK 包位置。不能用普通安装旧版 npm API/CLI 来代替这一步；源码中的 Schema 会内嵌到 CLI 构建产物中。配套 SDK 正式发布后，再将本地依赖改为实际发布版本；模板目前不指定已发布 SDK 包的最低版本。

## 检查与打包

```sh
pnpm run typecheck
pnpm run validate
pnpm run pack
pnpm run lint
```

`pack` 打包 `src/index.ts`，输出未签名的 `dist/{{PLUGIN_ID}}-0.1.0.moext`。`lint` 检查 bundle，因此在 pack 后执行。`pnpm run build` 是可选的单独构建 bundle 步骤。这些命令不签名或发布。通过兼容宿主的正常第三方安装流程安装归档，并检查两项所选文件权限。

## 需要编辑的文件

| 文件 | 作用 |
|---|---|
| `motrix-plugin.json` | 私有操作命令、参数和结果 Schema、字段、布局、文件、入口、再次执行策略 |
| `src/index.ts` | 带类型的沙箱处理函数、取消检查、进度和受限文件调用 |
| `locales/en-US.json`、`locales/zh-CN.json` | 完整标签、说明、按钮和结果标题 |
| `tsconfig.json` | 通过安装的 `@motrix/plugin-api` 严格检查，不内嵌 SDK 仓库路径 |
| `esbuild.config.mjs` | 独立 ES2020 bundle，保持 `motrix:plugin-api` 为 external |

处理函数和清单使用相同的 `{{PLUGIN_ID}}.deduplicate` 身份。修改参数时，同时调整 Schema、处理函数类型、字段和布局引用。长期偏好属于插件配置，不属于操作参数；当前模板不从 Schema 自动生成类型。

## 行为与限制

选择一个 UTF-8 `.txt` 文件，按需启用“忽略大小写”，再选择新的输出。处理函数按 LF 分行，保留每行首次出现的位置和原文，忽略大小写时使用 `toLowerCase()` 比较键。不裁剪空白、不归一化换行；空片段也计为一行，包括末尾换行和空文件产生的片段，CRLF 保留 `\r`。宿主显示去重后的行数。

插件页面及一个已完成的单文件任务菜单均提供入口。“再次处理”保留选项、重新授权未变化输入并清空输出。语言切换保留表单值。Electron 选择原生文件；Web 选择服务器上的文件，不上传浏览器本机文件。

文件字符串是不透明单次调用引用，不是路径；声明权限不授予任意文件访问。宿主将文本输入、输出各限制为 1 MiB，禁止覆盖目标，执行时重新检查授权，并管理进度、取消、临时文件和最终保存。模板不申请 FFmpeg、网络或任意文件系统能力。

## 验证方法

- 使用没有末尾换行的 `Apple\napple\nBanana\nApple`，关闭忽略大小写时应得到 3 行，开启时应得到 2 行。
- 检查中英文标签、可折叠选项组、两个入口，以及用新输出再次执行。
- 已有目标、过期或变化的输入、未经授权引用应被拒绝；不能移除宿主授权检查来运行示例。
- 在保存前取消并等待清理。小文件可能快到无法手工取消，不能将其算作取消验证证据。

控件、布局及条件、文件授权、限制和未支持能力见 [SDK 操作指南](https://github.com/motrixapp/plugin-sdk/blob/main/docs/operations.zh-CN.md)。源码发布前，请改为阅读配套 SDK 仓库中的 `docs/operations.zh-CN.md`。新增 UI 节点或能力需要宿主支持；模板不提供自定义 renderer HTML、JavaScript 或 CSS。
