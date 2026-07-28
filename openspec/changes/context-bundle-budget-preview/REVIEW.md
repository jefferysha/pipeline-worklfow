# Context Bundle 预算预览 Build 评修记录

## 审查范围

- kernel port-based 编译服务、Node CLI adapter、document ledger parser/export；
- server registered-root/Change inode、fd-relative reader、资源边界、只读 HTTP DTO；
- Dashboard client、进度抽屉、zh/en、竞态、空/加载/成功/预算/错误/重试；
- OpenSpec delta、ADR、实施计划、Trellis/Comet 固定研究与生成的 Dashboard/server/CLI 资产。

## 第一轮：纵向功能与交互

发现并修复：

- 入口位于长抽屉底部，用户难以发现：移到当前 Build stage 的可见区域；
- 英文界面显示 server 中文错误：改为 stable code + 本地 i18n；
- budget/target 快速修改可被旧响应覆盖：加入 AbortController 与 generation guard；
- custom workflow step 隐藏入口：始终展示，非 canonical current step 默认 target 为 `open`；
- 成功 DTO decoder 对 digest、预算一致性与 `content` 不够严格：全部 fail closed。

视觉复评覆盖信息层级、既有 tokens、label/focus、Tab/Enter、桌面与 720px 窄屏。无
critical/high/medium 视觉问题。

## 第二轮：安全与 DDD

发现后通过 `requirements-changed` 返回 Spec，并修复：

- source pathname TOCTOU 与无界读取：server 使用目录/file fd、`O_NOFOLLOW`、identity 复核与
  `maxBytes + 1` 有界循环；
- required records、单文件、累计 source 固定边界；
- HTTP 绝对路径泄漏与前端 raw error 显示；
- kernel 应用服务改为显式 `ledgerRepository` / `sourceReader` ports；
- 超长 kernel 文件拆分 contract、Node source 与 adapter。

## 第三轮：平台能力与请求绑定

再次通过 `requirements-changed` 返回 Spec，冻结并实现：

- Darwin/Node 无可遍历目录 fd 时在任何 Change 内容读取前返回
  `CONTEXT_BUNDLE_TRUSTED_READER_UNAVAILABLE`；Linux `/proc/self/fd` 提供成功能力；
- 修复 `path.join(fdPath, ".")` 归一化掉 traversal 的根因；
- 请求开始捕获的 Change `dev/ino` 传入每次 state/ledger/Change-local source lookup；
- 共享 kernel 同时生成兼容 `reason` 与中立 domain token `reasonCode`；Dashboard 通过显式
  allowlist 映射本地化文案，不依赖 kernel 内部 kind 公式，并将 success/422 preview 的
  change/target/budget 回显绑定原请求；
- failure detail 拒绝未知 kind、绝对/穿越 path；
- Node adapter 从 port-based 应用服务分离，CLI 错误不输出 workspace 绝对路径；
- ledger 独立 16 MiB transport cap，不占用或冒充 `totalSourceBytes`。

## 第四至第七轮：固定点安全与跨端一致性

后续全量审查继续发现并修复：

- ledger 缺失、非法 UTF-8、超限与 canonical state 损坏都映射为稳定机器码和安全恢复动作；
- canonical current/immutable/previous/transition linkage 由可信 reader 校验，损坏 state 返回
  `CONTEXT_BUNDLE_STATE_CORRUPT`，不跌落通用 500；
- 合法 UTF-8 BOM 使用 `TextDecoder(..., { fatal: true, ignoreBOM: true })` 保留，server 与
  CLI 对同一输入的 digest、stale 判定和字节数一致；
- non-regular file、entry/directory swap 与可信读取完整性失败分别稳定映射到 state corrupt
  或 ledger missing，registered root / Change anchor 替换仍优先返回 403；
- 所有可信文件以 `O_NONBLOCK` 打开，FIFO 在 `fstat` 前不会阻塞 Node event loop；canonical
  current 与 ledger 的 FIFO 均有 Linux/macOS 非阻塞 typed-error 回归测试；
- `openSync` 只把 `ENOENT` 分类为文档缺失；symlink `ELOOP`、权限或其他打开完整性失败统一进入
  trusted-file error，再由 canonical state/ledger 边界映射稳定机器码；
- Dashboard 为 state corrupt 提供专用中英文修复指引，并用组件测试固定；
- 新增 kernel、trusted reader、macOS server、Linux server 与 Dashboard 跨层断言。

## 第八轮：最终固定点

在重建 Dashboard/server/CLI 资产、完成 Linux 与 macOS 浏览器回归、全量测试及静态门禁后，
独立 Pre-Verify Standards + Spec 双轴复审真实回传 `PASS — C0 / H0 / M0 / L0`。审查同时
确认本记录曾预写结论的问题已纠正，FIFO/symlink/open errno 修复与最终浏览器、全量测试证据成立。

## 运行证据

- macOS Tenon Dashboard：目标页 title 为 `Tenon Dashboard`，真实 Change 为
  `context-bundle-budget-preview`，最终资产 `index-DG6mYpt0.js`，501 capability error 无绝对路径；
- Linux 容器 Tenon Dashboard：同一最终资产成功 `19,717 / 120,000 bytes`（8 份文档）、低预算 422、
  `open` policy-empty、临时 missing proposal、恢复后 retry、Enter 提交与 720px 窄屏；
- 截图保存在仓库外：
  `/tmp/tenon-pr-browser-20260728.7Fttdn/context-bundle-final-focused-macos-fail-closed.png`、
  `/tmp/tenon-pr-browser-20260728.7Fttdn/context-bundle-final-focused-linux-success.png`、
  `/tmp/tenon-pr-browser-20260728.7Fttdn/context-bundle-final-focused-linux-budget-error.png`、
  `/tmp/tenon-pr-browser-20260728.7Fttdn/context-bundle-linux-narrow.png`。

## 当前结论

frontend-design / web-design-guidelines / design-taste-frontend 复评与最终独立 Pre-Verify
Standards + Spec 双轴审查均无 critical/high/medium/low finding；Build 可据真实结论进入 Verify。
