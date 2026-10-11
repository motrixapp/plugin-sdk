# 音视频合并操作示例（尚未发布）

[English](./README.md) | **简体中文**

这是根据官方可选插件 `motrix.media-merge` 改编的完整 SDK 示例。官方实现和签名权限仍属于 [motrixapp/builtin-plugins](https://github.com/motrixapp/builtin-plugins)。教学版本使用 **`example.media-merge`** 和独立显示名称，可以作为未签名第三方示例安装，不冒用官方插件，也不需要官方签名密钥。它不是已经上架的插件。

**需要 SDK 和宿主都包含尚未发布的操作实现。** `engines.motrix` 为 `>=2.0.0-beta.48 <3.0.0`，以 beta.48 为首个支持版本目标，不代表已经发布。beta.47 会被拒绝，包括仍使用该版本号的开发构建。若功能延期，最低版本也必须相应提高。使用匹配的 SDK 包，并在兼容宿主中配置 FFmpeg。

## 完整源码

| 文件 | 阅读重点 |
|---|---|
| [motrix-plugin.json](./motrix-plugin.json) | 私有命令、有界 Schema、文件绑定、两个入口、网格及 accessory 布局、重复执行策略 |
| [src/index.ts](./src/index.ts) | 轨道探测、输入顺序修正、取消检查和受限合并 |
| [locales/en-US.json](./locales/en-US.json) | 完整英文界面和业务错误文案 |
| [locales/zh-CN.json](./locales/zh-CN.json) | 完整中文界面和业务错误文案 |
| [tsconfig.json](./tsconfig.json) | 使用当前 SDK 仓库 ambient API 声明进行严格类型检查 |

以上文件是完整源码，不是片段。完整协议说明见 [操作编写指南](../../docs/operations.zh-CN.md)。

## 构建与校验

从 SDK 仓库根目录开始：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @motrix/plugin-api exec tsc --noEmit -p ../../examples/media-merge/tsconfig.json
cd examples/media-merge
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js validate
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js pack
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js lint
```

输出为 `dist/example.media-merge-0.1.0.moext`。这些命令不会签名或发布。通过兼容宿主的正常第三方安装流程安装，检查 `ffmpeg`、`files.selected.read`、`files.selected.write` 权限。示例没有网络权限或下载生命周期 Hook。内嵌旧 Schema 的已发布 CLI 不能校验此示例。TypeScript include 有意使用仓库相对路径；独立项目需要在相关包发布后使用匹配的 API 类型。

## 行为与界面

两个输入文件卡片使用响应式双栏布局；输出区域跨一整行，标签旁显示 MP4/MKV 选择器。建议文件名来自视频输入，加上 `-merged`，扩展名跟随格式。建议路径不授予写权限，宿主仍要求选择或确认输出。桌面和 Web 显示不同的文件位置提示。

处理函数探测两个授权输入。如果当前顺序不能提供“视频在前、音频在后”，但反向顺序可以，就交换执行时的引用。它直接复制第一条视频轨和音频轨，不重新编码，不做片段拼接、同步偏移、编码转换，也不会在界面上交换已选卡片。MP4 不支持当前编码时可以尝试 MKV。

插件详情页和任务菜单共用同一操作。任务菜单接受恰好两个已完成的单文件任务，且存在本地最终文件。宿主负责进度、取消、快照、输出校验和无覆盖保存。“再次合并”使用 `preserve-options`：清空两个输入、输出和上次结果，保留 MP4/MKV，不重新填入上次任务选择。

两种语言的文案均完整，切换宿主语言会更新标签而不清空当前选择。通用拖入、更换、取消和状态文字来自宿主；`browseLabel` 是文件卡片的无障碍名称。

## 手工验证

以下是验证步骤，不代表所有平台均已验证：

1. Electron 使用原生对话框选择独立视频和音频，保存到新的 MP4/MKV 路径。Web 在服务端目录策略范围内选择 Motrix 服务器文件，不上传浏览器本机文件。
2. 将明确的视频和音频输入选反，输出应同时包含视频和音频，表单不必交换卡片。重复选择同一文件，或选择缺少所需轨道的文件，应报错且不生成最终输出。
3. 切换 MP4/MKV，确认输出扩展名随之改变。选择已有目标文件，应被拒绝且不改动原文件。
4. 开始足够长的操作，在最终保存前取消。等待清理完成，不应生成最终输出，源文件保持不变。迟到的取消不能删除已成功保存的结果。
5. 完成后点击“再次合并”，确认文件选择清空而格式保留。切换页面、刷新、中英文切换，检查状态、重复提示和意外未翻译标签。
6. 测试两个入口；停用插件或使 FFmpeg 不可用，确认宿主解释不能执行的原因。
7. 桌面拖放时只在宿主确认框中授权目标文件。伪造路径、过期引用或另一调用的引用都不能取得文件访问权，不得通过削弱宿主授权检查来测试。

输入必须是支持的独立媒体，不能是播放列表、concat 脚本或图片序列，内部引用的本地或网络资源不因此获得授权。当前限制包括每个输入 8 GiB、总输入 16 GiB、最多四次探测及两次并行探测、一次合并，还需要足够快照和暂存空间。不支持的目标文件系统会安全失败。共享的时间、草稿和描述大小限制见指南。

## 改造成自己的插件

同时修改插件 ID、所有操作和命令 ID、激活引用，使用自己的非保留发布者。保持 `argsSchema`、`fields`、`ui.layout`、文件绑定、处理函数类型和翻译键一致。业务行为在沙箱处理函数中修改，呈现在清单中修改。不要复制官方身份或签名前提；SDK 教学版本不是官方插件的发布源码。
