# 发布 SDK

[English](releasing.md) | 简体中文

仓库统一入口为 `pnpm run release`，默认仅校验、构建和打包四个 npm 包，不执行发布。上传必须由维护者在交互式终端明确触发。CI 和代理可以运行准备模式；代理不得执行发布模式。

这套流程只发布 SDK npm 包，不修改版本号、不合并 PR、不创建 Git tag、不发布 Motrix、不签名 `.moext` 插件，也不更新插件注册表。

## 前置条件

- Node.js 20 或更高版本、Git、支持 gzip 的 `tar`，以及根 `package.json` 指定的精确 pnpm 版本。Windows 使用独立的 `pnpm.exe`（与 CI 一致），或能够提供 JavaScript `npm_execpath` 的 pnpm 启动器。
- 先通过评审的 PR 在四个 package manifest 中设置目标版本。脚本首版只接受稳定的 `x.y.z` 版本，目标固定为公共 npm registry 和 `latest` tag。CLI 内嵌 schema，因此两者版本必须一致；API 和 create wrapper 可以使用不同版本，但每次均核对四个包。
- 正式发布要求干净的 `main`，包括没有未跟踪文件，且 HEAD 与当前 `origin/main` 完全一致。运行期间保持源码和产物不变。需要能访问 GitHub 和 npm，并使用有权发布这些包的 npm 账号。登录和 OTP 交互由 pnpm 处理；脚本不读取或保存凭据。

## 仅准备，不发布

在 SDK 仓库根目录执行：

```bash
pnpm run release
# 显式等价命令：
pnpm run release -- --dry-run
```

准备模式允许功能分支、CI detached checkout 和本地修改。报告记录源码提交及工作树是否有修改；带修改的准备结果可以用于开发验证，但不能作为发布授权。

脚本按以下顺序执行，任一步失败立即停止：

1. 核对包身份、稳定版本、发布配置、schema/CLI 版本配对及固定 pnpm 版本。
2. 执行 `pnpm install --frozen-lockfile`。
3. 执行 `pnpm run lint` 和 `pnpm run check:facade`。
4. 依次执行 `pnpm run build`、`pnpm run typecheck`、`pnpm run test`。
5. 使用 pnpm 打包四个包，并检查实际 tarball。

四个包全部打包完成后才会考虑上传。归档检查覆盖包身份、必需入口和文件、workspace 依赖重写。发布依赖中不能残留 `workspace:`、`link:` 或 `file:`；CLI 必须内嵌 SDK 代码，不能残留运行时 `@motrix/` 依赖。

每次运行都会创建新的 ignored 目录 `dist/release/sdk-*/`，包含四个 `.tgz` 和 `release.json`。报告记录 Git 状态、pnpm 版本、包版本、大小、SHA-256、npm SHA-512 integrity、进度和失败信息。历史运行目录保留，便于排查。准备模式不查询 npm 发布元数据，也不上传；安装锁定的构建依赖仍可能访问包 registry。

## 人工发布

版本和工具 PR 合并后，在干净且已同步的 `main` 上，由维护者本人执行：

```bash
pnpm whoami --registry=https://registry.npmjs.org
# 如果失败，使用发布时实际调用的包管理器登录：
pnpm login --registry=https://registry.npmjs.org
# 确认 pnpm whoami 返回预期发布账号后再继续。
pnpm run release -- --publish
```

`npm whoami` 成功不代表 pnpm 当前选用的凭据有效。pnpm 弹出浏览器或 2FA 验证时请及时完成；验证链接过期后，需要重新运行命令获取新链接。

该命令会重新完成整个准备流程。发布模式会在运行流程前拒绝 CI 和非交互式终端，没有 `--yes`、`--force` 或跳过校验选项。

上传前先核对 npm 上四个精确版本。404 表示尚未发布；认证、限流、网络或其他 registry 错误都会使流程停止。仅当已有版本的 SHA-512 integrity 与本次归档一致时才会跳过。任一版本冲突都会在首次上传前阻止整个批次。

终端会展示包版本、integrity、目标 registry，以及哪些包待发布、哪些包已存在。必须准确输入 `publish SDK packages to npm` 才能授权待发布项。拒绝确认不会上传。如果整个批次都已发布且摘要一致，则直接结束，不要求确认，也不重复上传。

发布顺序固定为：

```text
@motrix/plugin-manifest-schema
@motrix/plugin-api
@motrix/plugin-cli
create-motrix-plugin
```

确认后及每次上传前，脚本都会重新核对 Git 状态和归档摘要。发布时向 pnpm 传入已验证 tarball、明确的公共 registry、public access 和 `latest` tag，保留 Git 检查及交互式 OTP 支持。每个包必须在 npm 上可查询且摘要一致，才会继续下一个。上传命令成功后，状态变为 `verifying`。核验使用单调时钟，最多等待 5 分钟；查询间隔从 2 秒逐步增加到 10 秒，单次请求最多 15 秒，且不能超出剩余等待时间。每次读取元数据都使用新的查询参数并要求缓存重新验证，避免复用上传前预检查到的 404。

只重试核验读取：元数据暂不可见、网络失败、超时、HTTP 429 和 HTTP 5xx。`Retry-After` 可以在总时限内延长查询间隔，等待时至少每 30 秒输出一次进度。认证或权限错误、元数据格式错误、摘要冲突立即停止。上传前的 registry 预检遇错仍直接停止。脚本不会自动重试上传，也不会越过尚未核验的包。

## 失败与部分发布恢复

四个 npm 包的发布不具备原子性。上传或发布后校验失败时，后续包不再尝试，不自动撤销已发布包，也不自动重试上传。请保留运行目录，检查 `release.json` 和 npm 实际状态。报告中的 `publishing` 属于不确定状态：即使客户端失败或元数据尚不可见，服务端也可能已接收包。

`verifying` 表示上传命令已成功，但 registry 核验尚未完成。核验超时不等于上传失败；报告保留查询次数及最后一条核验信息。重试前先检查 npm，并保留原始产物。

解决原因后，使用同一份经过评审的源码和固定构建工具重新运行。脚本重新构建并核对已发布包的精确 integrity；完全一致的包会跳过，只对缺少的包请求确认并上传。不会覆盖不可变版本。如果重建结果与已发布版本不同，应停止并查明原因，不能强制上传或静默忽略冲突。需要调整版本时，提交新的评审 PR，并保持 schema/CLI 版本一致。

在整个 SDK 批次核验完成前，消费者仍保持阻塞。完成后再更新 Motrix 和官方插件的依赖及锁文件，并复跑干净 CI。SDK 发布不代表兼容的宿主或插件也已发布，二者仍需独立核验。

## 测试与 CI

`pnpm test` 会运行发布脚本的 Node 测试及原有 SDK 测试。发布测试注入命令和 registry 替身，不向 npm 上传，覆盖顺序、检查失败、归档验证、版本冲突、确认、产物变化、部分发布及上传结果不确定等情况。CI 还会在各操作系统与 Node 组合上运行真实的默认准备命令，没有任何 workflow 会自动发布包。
