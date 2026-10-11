# 文本去重操作示例（尚未发布）

[English](./README.md) | **简体中文**

这是完整的未签名第三方示例 `community.text-tools`，去除用户所选 UTF-8 文件中的重复行并另存新文件。它与媒体示例使用相同的操作协议，不需要 FFmpeg、网络权限或任意文件系统访问。它不是已经上架的插件。

**需要 SDK 和宿主都包含尚未发布的操作实现。** 引擎范围为 `>=2.0.0-beta.48 <3.0.0`，以 beta.48 为首个支持版本目标；它必须实际提供 `operations.ui.v1` 和 `files.text.v1`，若延期须同步提高最低版本。beta.47 会被拒绝，包括仍使用该版本号的开发构建。此目标不代表宿主或 npm 包已发布支持。

## 完整源码

| 文件 | 阅读重点 |
|---|---|
| [motrix-plugin.json](./motrix-plugin.json) | 有界参数与结果 Schema、文件卡片、开关、折叠组、结果计数和任务绑定 |
| [src/index.ts](./src/index.ts) | 受限读写、保留首次出现行的去重、取消检查和进度 |
| [locales/en-US.json](./locales/en-US.json) | 完整英文 UI 文案 |
| [locales/zh-CN.json](./locales/zh-CN.json) | 完整中文 UI 文案 |
| [tsconfig.json](./tsconfig.json) | 使用当前 SDK 仓库 ambient API 声明进行严格类型检查 |

所有文件均为完整源码，共享协议见 [操作编写指南](../../docs/operations.zh-CN.md)。

## 构建与校验

从 SDK 仓库根目录开始：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @motrix/plugin-api exec tsc --noEmit -p ../../examples/text-tools/tsconfig.json
cd examples/text-tools
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js validate
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js pack
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js lint
```

输出为 `dist/community.text-tools-0.1.0.moext`。这些命令不签名或发布。通过兼容宿主的第三方安装流程安装，检查 `files.selected.read`、`files.selected.write` 权限。无需为示例单独安装依赖，命令和类型都来自当前 SDK 仓库；契约较旧的已发布包不能代替。`pack` 打包源码，`lint` 检查生成的 bundle，必须在后面执行；类型检查是独立步骤。

## 行为与界面

选择输入 `.txt` 文件，在默认展开的“匹配选项”组中按需启用“忽略大小写”，再选择新的输出 `.txt`。宿主建议基于输入加 `-unique` 的文件名，但仍要求输出授权。处理函数读取 UTF-8，保留每行第一次出现的位置和原有大小写，写入结果，返回输出引用及 `lines`。`result.fields` 使用本地化标题展示该计数。

比较遵循示例的 `split('\n')` 算法，不裁剪空白，不按特定语言进行大小写折叠，也不归一化换行格式。“忽略大小写”通过 JavaScript `toLowerCase()` 生成比较键。空行也计为一行，包括末尾换行产生的空片段；空文件也有一个分割片段。CRLF 中的 `\r` 会保留。这是刻意保持简单的示例，不是完整文本清洗产品。

对于**没有末尾换行**的输入字符串 `Apple\napple\nBanana\nApple`：

| 忽略大小写 | 输出 | 结果计数 |
|---|---|---:|
| 关闭 | `Apple\napple\nBanana` | 3 |
| 开启 | `Apple\nBanana` | 2 |

“再次处理”使用 `preserve-inputs`：保留普通选项，重新检查未变化的输入身份并获得新的单次调用授权，清空输出。它不会自动重放任务。任务菜单支持一个已完成的单文件任务，且存在本地最终文件；两个入口共用同一处理函数。

标签、说明、按钮和结果标题通过 `%key%` 引用跟随宿主语言。示例同时包含英文和中文，其他语言回退英文。语言切换保留表单和已选文件。

## 手工验证

以下描述预期行为，不代表所有平台均已完成验证：

1. 安装并启用示例，在操作页用上述字符串分别测试关闭、开启“忽略大小写”，确认输出和计数。
2. Electron 使用原生输入和保存对话框；Web 在允许的目录策略内选择服务端文件，不上传浏览器本机文件。
3. 在中英文下检查折叠选项、输入输出标签、进度和结果计数，通用文件操作指引不应重复。
4. 点击“再次处理”，输入和选项保留，输出清空。若输入自选择后发生变化，重新授权必须拒绝旧文件。
5. 选择已有输出、不允许的文件类型、无效 UTF-8 或超过 1 MiB 的文本，应被拒绝，不覆盖文件、不生成部分输出。伪造路径或引用、另一调用的引用不能取得访问权。
6. 在最终保存前取消并等待清理，不应出现部分输出，输入保持不变。小文件可能快到无法手工取消，这不能作为取消验证证据。确定性取消应使用受控宿主集成测试，不增加不安全 API。
7. 使用已完成任务菜单入口，再次处理应获得新授权。在宿主持续运行时切换页面、刷新，不把历史成功状态当成新执行的结果。

宿主将 UTF-8 输入和输出各限制为 1 MiB，最多读取四次，每个输出写入一次，并拒绝已有目标。取消、最终保存和临时资源由宿主管理，共享限制见指南。

## 改造成自己的插件

将插件 ID 以及对应操作、命令、激活引用改为自己的非保留发布者。先定义有界普通参数，再添加对应 `fields` 和布局引用；参数定义和布局绑定都必须恰好出现一次。保持处理函数类型与翻译文件一致。业务规则放在沙箱处理函数中，不要放进 `visibleWhen`，也不要发明 UI 回调字段。

## 生成自己的项目

开发版 CLI 现提供 `init <name> -t operation [-p publisher]` 和 `create-motrix-plugin <name> operation`，以此文本操作为起点，自动替换身份，生成基于安装包的独立类型检查配置、构建脚本和成对 README。请按 [指南](../../docs/operations.zh-CN.md) 配置匹配的本地 SDK 依赖，不能据此推断已发布模板或 API 支持。
