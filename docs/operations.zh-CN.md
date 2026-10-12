# 编写插件操作（SDK 2.2.0+）

[English](./operations.md) | **简体中文**

> 操作 Schema、API 和 CLI 模板已随 SDK 2.2.0 发布。运行仍需宿主提供声明的能力。示例和模板要求 `>=2.0.0-beta.48 <3.0.0`；beta.48 是计划中的首个支持版本，不代表宿主功能已发布。beta.47 会被拒绝，包括仍使用该版本号的开发构建；若宿主功能延期，必须提高最低版本。SDK 发布及公开 JSON Schema 地址不能证明宿主支持；这些示例不是已上架插件。

## 从完整示例开始

- [文本去重](../examples/text-tools/README.zh-CN.md)：一个输入、折叠组中的布尔选项、一个输出和结果计数。建议先看这个示例。
- [音视频合并](../examples/media-merge/README.zh-CN.md)：两个文件卡片、双栏布局、内联 MP4/MKV 选择器、平台提示和输入顺序识别。SDK 教学版本使用 `example.media-merge`，不使用官方保留身份 `motrix.media-merge`。

两个目录都包含完整清单、处理函数、中英文语言文件和 TypeScript 配置，是可以执行的源码示例。下文代码片段只解释局部字段，不是完整清单。

对熟悉 TypeScript 的开发者，修改现有示例的工作量较小；从零定义操作的学习成本中等。主要难点是对齐参数 Schema、UI 引用、翻译键和文件授权，无需编写 React 或 CSS。这是基于源码的评估，没有经过开发者可用性研究。CLI 已提供 `operation` 模板，自动生成初始引用和文件；`basic-resolver` 和 `post-action` 仍为生命周期 Hook 模板。类型仍需手写维护，尚未实现从 Schema 生成 TypeScript 类型或 UI 预览。

### 生成自己的操作项目

在任意工作目录使用已发布的 SDK 2.2.0 CLI，选择尚未占用的项目名：

```sh
pnpm --package=@motrix/plugin-cli@2.2.0 dlx motrix-plugin init my-operation -t operation -p acme
cd my-operation
pnpm install
pnpm run typecheck
pnpm run validate
pnpm run pack
pnpm run lint
```

生成项目声明 API/CLI 2.2.0 或兼容的新版本，无需链接本地 SDK。已发布的 2.2.0 CLI 仍会显示过时的“尚未发布”提示，并生成源码依赖安装说明；该版本请按上方执行 `pnpm install`，不用生成文档里的 `file:` 配置。本次文档和下一版 CLI 会修正文案。宿主兼容性要求仍有效，不能通过修改宿主 Schema 或权限来安装。

也可使用已发布的 create 包装器：

```sh
pnpm create motrix-plugin@2.2.0 my-operation operation
```

它默认使用发布者 `me`；自定义发布者请使用完整 CLI 的 `-p`。仅在开发 SDK 未发布改动时，才需要构建本仓库、调用仓库内 CLI，并使用匹配的本地 API/CLI 依赖。

生成器提供完整清单、处理函数、中英文语言文件、基于安装包的严格 `tsconfig.json`、esbuild 配置、package scripts、`.gitignore` 和成对 README。操作、命令和激活 ID 自动使用项目的发布者与名称。模板只申请所选文件读写权限，包含插件页面及单任务菜单入口，使用 `preserve-inputs`。提供明确的 typecheck、validate、pack、lint 脚本；pack 不代替类型检查，处理函数类型仍需手写维护。生成项目不会安装、启动、签名或发布插件。

### 在 SDK 仓库中运行示例

使用 Node.js 20 或更高版本，以及仓库声明的 pnpm 版本。从仓库根目录开始：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @motrix/plugin-api exec tsc --noEmit -p ../../examples/text-tools/tsconfig.json
cd examples/text-tools
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js validate
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js pack
node ../../packages/plugin-cli/dist/bin/motrix-plugin.js lint
```

将 `text-tools` 换成 `media-merge` 即可运行另一个示例。`pack` 会自行打包 `src/index.ts`，将未签名 `.moext` 写入示例目录下被 Git 忽略的 `dist/`。`lint` 读取构建后的 bundle，必须放在 **pack 之后**。这些命令不会签名或发布。通过兼容宿主的正常第三方安装流程安装，并检查所申请的权限。

示例直接使用当前仓库的 CLI 和 ambient API 类型声明，不需要为示例单独安装依赖。独立项目可使用已发布的 CLI/API 2.2.0 及模板生成的包级 `types` 配置，替代相对路径类型声明。打包时保持 `motrix:plugin-api` 为 external。`pack` 负责校验和打包，不代替 TypeScript 类型检查。

## 文件与职责

操作是一张由宿主渲染、连接到沙箱处理函数的表单：

```text
manifest → host form → user file authorization → host job → sandbox handler
                                                       → validate and save result
```

| 编写位置 | 职责 |
|---|---|
| `commands[].argsSchema` / `resultSchema` | 数据类型、必填项、默认值、范围和返回值 |
| `operations.items[].fields` | 标签、控件、说明和呈现条件 |
| `operations.items[].files` | 输入输出角色、文本或媒体用途、文件名建议 |
| `operations.items[].ui` | 布局、操作按钮文案和重复执行策略 |
| `operations.items[].entries` | 插件详情页和任务菜单入口 |
| `operations.items[].result` / `errors` | 展示的结果和本地化业务错误 |
| `commands.registerOperation()` | 现有沙箱中的业务逻辑 |
| `locales/*.json` | 插件提供的界面文案 |

宿主管理组件、加载 Skeleton、键盘和焦点行为、进度、取消、资源限制、文件授权及最终输出保存。插件不提供 renderer JavaScript、HTML、CSS、DOM 访问或 React。长期配置仍属于 `contributes.configuration` 和 `config` API；操作参数属于本次调用的表单，不会自动保存为偏好设置。

## 声明操作及其命令

`contributes.operations` 的结构是 `{ "version": 1, "items": [...] }`。每个操作包含 `id`、`title`、`command`、`fields`、`entries`，还可以声明 `description`、`icon`、`requires`、`files`、`ui`、`result`、`errors`。

操作 ID 和处理命令 ID 都必须以插件 ID 加点号开头。处理命令必须在清单中声明 `execution: "operation"`，不能公开，建议显式填写 `public: false`。通过 `commands.registerOperation` 注册处理函数，并声明 `onCommand:<command-id>` 激活事件。普通 `commands.execute` 和跨插件调用不能创建操作上下文或调用这一受控处理函数。

操作图标支持 `action`、`media-merge`、`document`、`checksum`。当前宿主提供以下能力标识：

| 能力标识 | 含义 |
|---|---|
| `operations.v1` | 操作描述和执行 |
| `operations.ui.v1` | 可组合布局与呈现 |
| `files.selected.v1` | 所选文件引用 |
| `files.text.v1` | 受限 UTF-8 文本读写 |
| `media.merge-streams.v1` | 受限媒体探测和轨道合并 |

在 `requires` 中列出所需能力。自定义 `ui` 必须声明 `operations.ui.v1`；未知的必需能力会使操作不可用。能力声明不是权限，也不授予文件访问权。

### 数据 Schema

参数和结果 Schema 都必须是扁平对象，设置 `additionalProperties: false`，最多 24 个属性，只支持 `string`、`boolean`、`number`、`integer`。不支持嵌套对象、数组、正则或通用 JSON Schema 组合。非枚举字符串必须显式指定不超过 4096 的 `maxLength`；数字和整数必须指定 `minimum`、`maximum`。只支持字符串枚举，最多 64 个互不重复的值。默认值必须通过同一 Schema 的校验。

例如，在 `argsSchema.properties` 中定义一次格式参数：

```json
{
  "format": {
    "type": "string",
    "enum": ["mp4", "mkv"],
    "default": "mp4"
  }
}
```

需要必填时，将 `format` 加入 `argsSchema.required`。UI 字段只引用它，不重新声明类型或枚举。标签依次取 `field.label`、Schema 属性的 `title`、参数名。可见说明使用 `field.help`，Schema 的 `description` 不会自动显示为字段说明。处理函数的 TypeScript 泛型目前仍需手写，应与 Schema 保持一致。宿主执行时会重新校验参数，并校验结果；renderer 校验不是权限边界。

## 字段与控件

每个参数必须在 `fields` 中恰好声明一次。`field` 是参数名；控件名支持 `text`、`textarea`、`number`、`switch`、`select`、`segmented`，必须与 Schema 类型匹配。

| Schema 或文件绑定 | 默认控件 | 可选呈现 |
|---|---|---|
| 字符串 | 文本输入框 | `textarea` |
| 数字或整数 | 数字输入框 | 范围来自 Schema；整数步长为 1 |
| 布尔值 | 开关 | 暂无其他布尔控件 |
| 字符串枚举 | 下拉选择 | `segmented` 显示单选分段按钮 |
| 输入文件绑定 | 文件卡片 | 预设图标、色调和桌面拖放入口 |
| 输出文件绑定 | 保存位置卡片 | 可通过布局附加普通参数控件 |

```json
{
  "field": "format",
  "label": "%format%",
  "widget": "segmented",
  "optionLabels": { "mp4": "MP4", "mkv": "MKV" }
}
```

`optionLabels` 只改变显示标签，不改变提交值；没有映射的枚举值直接显示原值。必填状态来自 `argsSchema.required`，宿主目前提供无障碍必填说明，不显示星号。控件行为和执行校验仍由宿主管理。

`appearance` 接受 `placeholder`、`browseLabel`、`drop`、`icon`、`tone`：

- `placeholder` 用于文本、数字、多行输入框和未选择文件的卡片。
- `browseLabel` 当前是文件卡片的无障碍名称，不是可见操作文字。选择、更换、拖入等通用指引由宿主本地化。
- `help` 提供补充说明。文件选中后，卡片优先显示所在目录。不要在说明或占位文字中重复宿主的操作指引。
- 文件图标：`video`、`audio`、`folder`、`document`、`text`、`checksum`。
- 文件色调：`neutral`、`blue`、`violet`、`amber`，均为宿主预设。
- `drop: true` 仅适用于输入文件，实际支持和授权取决于宿主；它不会启用浏览器本机文件上传。

文件字段不能声明 `widget`、`optionLabels`、`visibleWhen`、`enabledWhen`。图标、色调和浏览标签只适用于文件。协议不接受任意样式、图片 URL、class 名称、事件处理器或 HTML。

## 组合布局

不写 `ui` 时，宿主按照 `fields` 顺序纵向渲染。提供 `ui` 时必须填写 `ui.layout`。布局中的 `field` 节点和 accessory 必须将全部字段恰好绑定一次，不能遗漏或重复。

| 节点 | 属性与行为 |
|---|---|
| `field` | `field`，可选 `span: 1\|2`，可选普通参数 `accessory`，放在标签行 |
| `text` | 纯文本 `text`，可选 `tone: muted\|info`、`platform: desktop\|web`、`span` |
| `stack` | `children`，可选 `title`、`span`，纵向排列 |
| `grid` | `children`，可选 `columns: 1\|2`、`title`、`span`，窄窗口变为一栏 |
| `group` | `children`，可选 `title`、`collapsible`、`span`，带边框分组 |

媒体示例采用以下布局：

```json
{
  "type": "grid",
  "columns": 2,
  "children": [
    { "type": "field", "field": "videoInput" },
    { "type": "field", "field": "audioInput" },
    { "type": "field", "field": "output", "span": 2, "accessory": "format" }
  ]
}
```

文件不能成为 accessory，输入文件也不能包含 accessory。折叠组必须有标题，默认展开，不能直接或通过嵌套容器包含文件字段，暂不支持配置初始折叠状态。`columns` 只用于 grid。平台过滤只适用于 text 节点。文本是静态纯文本，不支持 Markdown、HTML 或表单、结果变量插值。

`ui.submitLabel`、`repeatLabel`、`footer` 分别配置执行按钮、再次执行按钮和页脚文案。取消、任务状态、进度和结果容器由宿主提供，不支持额外操作按钮或自定义成功、失败布局。

### 条件

普通参数字段可以使用 `visibleWhen` 和 `enabledWhen`。支持 `{ field, equals }`、`{ field, in: [...] }`、`{ all: [...] }`、`{ any: [...] }`、`{ not: ... }`，采用严格的标量相等判断：

```json
{
  "visibleWhen": { "field": "mode", "equals": "replace" },
  "enabledWhen": { "not": { "field": "readOnly", "equals": true } }
}
```

引用的字段和值必须符合参数 Schema，不能引用文件字段。带条件的必填字段需要有效默认值。隐藏或禁用字段保留原值，仍会参与校验和提交；条件不会改变必填规则、清空值或授予权限。业务规则也应在处理函数中检查。不支持表达式、回调、计算默认值、动态选项或异步字段校验。

## 所选文件与权限边界

文件参数在参数 Schema 中是必填的有界字符串，不能有默认值或枚举，`maxLength <= 128`。当前示例将长度约束为 36。必须将它视为**本次调用的不透明引用**，不能当成路径，也不能自行构造、解析、持久化或跨任务复用。

```json
{
  "input": { "kind": "input-file", "use": "text", "extensions": ["txt"] },
  "output": {
    "kind": "output-file",
    "use": "text",
    "extensions": ["txt"],
    "suggestedName": { "stemFrom": "input", "suffix": "-unique" }
  }
}
```

`use` 为 `text` 或 `media`。输入申请 `files.selected.read`，输出申请 `files.selected.write`；媒体绑定还必须申请 `ffmpeg`。输出必须有 `extensions` 或 `extensionFrom`。扩展名使用不带点的小写字符；`extensionFrom` 引用 `format` 这样的字符串枚举。`suggestedName.stemFrom` 引用一个输入，其后缀只允许最多 32 个 ASCII 字母、数字、下划线或连字符。建议路径不授予写权限；必要时，提交会先打开保存选择器。

Electron 使用原生打开、保存对话框，桌面拖放由宿主确认。Web 在目录策略内选择服务端文件，不上传浏览器所在电脑的文件。任务菜单绑定经过宿主检查的任务文件。插件自行传入的路径不属于这些授权来源。

宿主将授权绑定到所有者、插件、操作以及本次调用和策略版本。草稿 15 分钟后过期，刷新表单不会延长有效期。再次执行会生成新引用。宿主检查包括解析后的路径策略、文件身份和变更、执行时授权；还负责输入快照、临时输出、取消清理、结果校验和原子无覆盖保存。已有输出会被拒绝，不能提供保存保证的文件系统也会被拒绝。重置表单不会删除已经成功生成的文件。官方身份没有豁免。

媒体探测和合并只接受支持的独立容器；播放列表、concat 脚本、图片序列、网络协议和间接文件访问不能借此绕过授权。`OperationContext` 不提供任意 FFmpeg 参数接口。

## 处理函数、进度、错误与结果

在模块顶层注册一次，将实际工作放进处理函数。完整处理函数见两个示例的源码文件。操作上下文提供：

| API | 契约 |
|---|---|
| `jobId` | 本次任务标识，可用于插件日志 |
| `signal` | `aborted`、`reason`、`throwIfAborted`、添加和移除取消监听；是有数量限制的沙箱 `AbortSignal` 子集 |
| `progress({ phase, fraction? })` | 异步进度报告；`phase` 为 `preparing` 或 `running`，fraction 按 0～1 表达 |
| `fail(code)` | 抛出由操作 `errors` 映射的稳定业务错误 |
| `files.readText(ref)` | 读取授权的 UTF-8 输入 |
| `files.writeText(ref, content)` | 写入授权的新文本输出 |
| `media.probe(ref)` | 返回有界轨道信息和可选时长 |
| `media.mergeStreams({ video, audio, output, format, expectedDurationMs? })` | 使用授权引用合并轨道，格式为 MP4 或 MKV |

等待能力调用完成，在工作过程中检查取消，不要捕获取消后伪装成成功。即使处理函数不配合，宿主取消也会撤销能力访问，停止并清理宿主管理的工作。

宿主管理任务阶段：accepted → preparing → running → validating → committing → cleaning → succeeded/failed/cancelled。取消可能进入 `cancelling`；宿主重启后，未完成任务标为 `interrupted`，不会重放。仅关闭表单不会取消任务。最终保存存在提交边界：迟到的取消不能删除已经保存的结果。

进度中的 `phase` 当前不会覆盖宿主的阶段标签，也没有自定义进度文案。每秒最多调用 20 次，应明显低于这一频率。宿主合并更新，上报进度最多显示为 99%，成功保存后由宿主设置 100%。媒体合并进度自动转发。

声明 `{ "invalidInput": "%invalidInput%" }` 错误映射后，调用 `context.fail('invalidInput')`。没有映射的异常使用宿主通用失败文案，不要依赖原始异常字符串直接展示给用户。

`result.fields` 选择要按“标题：值”展示的普通返回字段，标题来自 `resultSchema.properties[key].title`。`result.files` 指定输出文件绑定，结果 Schema 中也必须声明该字段。返回已授权的输出引用，不能返回路径。所有已声明输出都必须包含在 `result.files` 中。宿主校验结果和输出后才保存文件。桌面提供打开文件夹操作，Web 不提供桌面文件夹操作。暂不支持自定义结果卡片、表格或值格式化器。

### 再次执行与刷新

| `ui.repeat` | 普通选项 | 输入 | 输出 |
|---|---|---|---|
| 省略或 `reset` | Schema 默认值 | 清空 | 清空 |
| `preserve-options` | 保留 | 清空 | 清空 |
| `preserve-inputs` | 保留 | 对未变化文件重新检查并授权 | 清空 |

媒体合并使用 `preserve-options`：“再次合并”清空两个输入和输出，保留 MP4/MKV。文本去重使用 `preserve-inputs`。再次执行不会自动重新应用上次任务绑定。

普通页面切换会保留 renderer 中的表单状态；刷新可以恢复有效的宿主草稿，但不会延长授权期限。运行中的任务归宿主管理。重启后不会把历史成功任务恢复成新表单的当前结果。插件安装或更新会重载描述并使过时表单、授权失效；兼容协议内的插件更新不需要重启应用。语言切换只更新标签，不使当前表单或任务失效。

## 操作入口

`entries` 支持 `plugin-detail` 和 `task-menu`，每种最多一个。详情页直接展示单个操作，多操作时提供切换入口。任务菜单可以将所选任务绑定到输入字段：

```json
{
  "surface": "task-menu",
  "selection": {
    "count": { "min": 1, "max": 1 },
    "every": { "status": "completed", "files": "single", "local": true }
  },
  "bind": { "input": { "source": "task-file", "index": 0 } }
}
```

当前任务条件限于 1～4 个已完成的单文件任务，且存在本地最终文件。即使只选择最少数量的任务，绑定索引也必须存在。不支持任意任务判断式或脚本生成菜单标签。不适用的任务选择不显示入口；插件停用、缺少能力、安全限制或缺少 FFmpeg 时显示对应不可用状态。宿主准备和执行时会重新检查资格，不只在画菜单时检查。两个入口共用同一表单和处理函数。

## 多语言与无障碍

设置 `l10n: "locales"`，使用占满整个字段的 `%key%` 引用。声明本地化后必须提供 `en-US.json`；其他语言可以不完整，缺失时回退英文。`"Choose %input%"` 这样的混合文本无效，应将完整句子放入一个翻译键。ID、参数名和枚举实际值不翻译。

操作会解析标题与说明、字段标签与帮助、appearance 文案、选项标签、分组标题、静态文本、按钮与页脚、错误文案、Schema 标题与说明。宿主语言决定显示语言；通用状态、取消和文件操作文字来自宿主语言资源。

翻译后的描述也有大小限制，短 `%key%` 不能绕过限制。CLI 检查英文引用覆盖，不验证每种语言的翻译质量或界面适配，应在宿主检查示例的两种语言。

宿主控件负责标签与说明关联、必填说明、状态 live region 和键盘行为。所有字段都应有清晰标签，包括可见标签被压缩隐藏的 accessory。自定义 `browseLabel` 应说明文件选择用途，不要只依靠图标或色调传递含义。

## 限制与暂不支持的能力

下列是当前实现限制，不代表每个插件能同时耗尽每类资源。

| 项目 | 当前限制 |
|---|---|
| 每插件操作数 | 16 |
| 每操作字段数、每个数据 Schema 属性数 | 24 |
| 输入、输出文件 | 4 个输入、1 个输出；文件字段全部必填 |
| 布局 | 64 个节点、深度 4、每个容器最多 24 个子节点 |
| 条件 | 单操作累计 64 个节点、深度 4；`all`、`any` 最多 8 个子项，`in` 最多 64 个值 |
| 描述校验预算 | 单操作 8 KiB，全部操作声明 64 KiB；采用保守结构计数，不等于清单文件原始大小 |
| 通用 Schema 预算 | 每个参数或结果 Schema 8 KiB，另受有界 Schema 校验约束 |
| 文本能力 | UTF-8；输入、输出各 1 MiB，最多读取 4 次，每个输出写入一次 |
| 媒体能力 | 每个输入 8 GiB、总输入 16 GiB；最多 4 次探测、同时 2 次探测、1 次合并 |
| 宿主操作超时 | 媒体操作 1 小时，其他操作 60 秒；沙箱或资源限制可能更早终止 |
| 草稿配额 | 每个所有者 4 个，全局 16 个；刷新复用同一有效草稿 |

文件快照和暂存还需要足够可用磁盘空间，不能通过在清单增加字段来提高限制。宿主可能在处理函数开始前就报告资源或磁盘空间限制。

尚未实现：自定义 HTML/JS/CSS 组件、任意图片和样式、动态选项或异步字段校验、计算值、数组或对象编辑器、表格、树、多步骤向导、任意额外按钮、复杂结果布局、目录选择、多文件数组字段、浏览器本机上传。适合时可以拆成几个小操作；超出组件或能力集合的需求需要协议与宿主扩展，不能依靠未声明的旁路。

## 兼容性与排错

在当前协议内修改 UI 文案、布局、选项或业务函数，可以通过插件更新交付。新控件、布局节点、条件运算符、能力或结果渲染器需要 SDK Schema/API/CLI 和宿主共同支持。`operations.version` 选择协议，`requires` 在支持操作机制的宿主上检查能力，`engines.motrix` 声明真实的最低宿主版本。旧宿主可能在安装时拒绝未知清单，不一定能进入不可用操作页面。

当前引擎最低版本目标为 beta.48。正式发布前须确认 beta.48 实际包含这些能力；若延期，最低版本必须提高到首个实际支持的版本。使用配套 SDK/CLI，并保持包清单与注册表的兼容性、权限信息一致。CLI 在构建时内嵌 Schema，单独更新 Schema 依赖不能更新旧 CLI。公开 Schema 地址也可能落后于当前开发实现。官方包的签名继续由官方插件仓库负责，本仓库示例保持未签名。

| 现象 | 检查项 |
|---|---|
| 清单校验失败 | 宿主和 CLI 是否匹配；处理命令是否为私有 `execution: operation`；是否为扁平有界 Schema；是否声明所需能力 |
| 布局被拒绝 | 包括 accessory 在内，每个字段是否恰好引用一次；结构与深度是否超限 |
| 条件字段被拒绝 | 引用的普通字段和值是否存在；有条件的必填项是否有默认值 |
| 文件绑定被拒绝 | 必填字符串、无默认值与枚举、权限、输出扩展名和返回输出是否齐全 |
| 显示 `%key%` 或意外英文 | `l10n`、英文覆盖、当前语言键、是否使用完整字段引用 |
| 文件操作文案重复 | 从 `help`、`placeholder` 中移除重复的宿主指引；`browseLabel` 是无障碍名称 |
| `resourceLimit` | 进度频率、读取或探测次数、文件大小、并发草稿和可用磁盘空间 |
| 输出被拒绝 | 选择尚不存在的目标文件，不能关闭防覆盖保护 |

从完整示例开始修改。示例 README 提供 Electron/Web、多语言、取消和文件授权的预期行为与手工检查步骤。通过 CLI 校验不能证明这些运行流程全部正确。
