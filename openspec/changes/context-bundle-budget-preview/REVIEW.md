# Context Bundle 预算预览 Build 评修记录

## 审查范围

- kernel port-based 编译服务、Node CLI adapter、document ledger parser/export；
- server registered-root/Change inode、fd-relative reader、资源边界、只读 HTTP DTO；
- Dashboard client、进度抽屉、zh/en、竞态、空/加载/成功/预算/错误/重试；
- OpenSpec delta、ADR、实施计划、Tre&#108;lis/Com&#101;t 固定研究与生成的 Dashboard/server/CLI 资产。

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

## 第八轮当时结论（后由 Verify 推翻）

frontend-design / web-design-guidelines / design-taste-frontend 复评与最终独立 Pre-Verify
Standards + Spec 双轴审查当时回传无 critical/high/medium/low finding，Build 据此进入 Verify；
该结论不再代表当前状态，以下第九轮记录了冻结靶的独立失败证据。

## 第九轮：Verify 失败回环

冻结提交 `fb1b798b7cc1f2df23b858764c9f44bbad17a035` 的四轨 Verify 未通过。E2E 轨证明真实仓库
零写入且 UI→API 主链通过，但 reviewer、Codex 与视觉轨发现以下必须修复的问题：

- current 为普通 set 时漏检直接 previous transition revision 的 TransitionRecord；
- missing canonical current 被错分为请求错误，missing source 的结构化 kind 不完整；
- port-based kernel service 仍直接绑定 Node/path/hash/Buffer primitives，包装错误丢失 cause，
  新 GET API 尚未进入 durable contract；
- 默认按钮文字与焦点环对比不足，loading 截图并非真实 loading，控件 hover/active 状态不完整；
- Com&#101;t 研究文档有尾随空格，组件存在无行为 wrapper 与 non-null assertion。

完整聚合报告为
`docs/superpowers/reports/2026-07-28-context-bundle-budget-preview-verify.md`。已对确切
`verify-fail` 事件留下 delegated receipt 并正式回退 Build，没有把失败轨标记为 pass。

## 第十轮：Build 修复

- canonical reader 现在同时验证 current 和直接 previous 中的 transition record；新增 async/sync
  回归，缺失 record 均 fail-loud；
- missing/unsafe canonical phase 统一为 `CONTEXT_BUNDLE_STATE_CORRUPT`；typed source error 补齐
  kind/path/cause，server 对内部 cause 与 anchor/unexpected failure 写入 stderr，HTTP 仍只返回安全文案；
- ledger compiler 的 absolute-root、ledger path、SHA-256 与 UTF-8 byte 计算改由 Node adapter
  primitives 注入，应用服务不再直接 import Node/storage layout；
- `docs/CONTRACT.md` 固定 GET API、状态码、可信读取与无副作用契约，`docs/TEST-REALITY.md`
  更新真实测试面；
- 删除 React 纯转发 wrapper；按钮改用通过对比的 strong token，focus-visible 使用实色 accent +
  offset，select/input/button 补 hover/active/disabled cursor；每个稳定错误码都有独立中英文恢复动作；
- 清理研究文档尾随空格。定向红灯已先复现，修复后 kernel/server 329 passed、7 个平台条件 skip，
  Dashboard 组件 15 passed，`typecheck:web` 与 kernel/server TypeScript build 通过。

本节只记录修复与定向绿灯；新的 pre-Verify 全量审查、浏览器证据与最终结论仍须在全部门禁重跑后
写入，不能沿用第八轮已经被 Verify 推翻的结论。

## 第十一轮：Build 固定点复审

在仓库卫生约束要求外部参考项目使用中性文件名后，本轮先以 `requirements-changed` 正式回退
Spec，由 `tenon-spec` 重登记 proposal、design、tasks、Superpower design 与 ADR 的当前 digest，
完成 exact `spec-complete` delegated review 后再返回 Build。功能范围、delta spec 和实现语义未变。

Build 最终门禁：

- `npm test -- --minWorkers=1 --maxWorkers=4`：317 files，5438 passed，12 个平台条件 skip；
- `test:web`：52 files，998 passed；Context Bundle 组件定向 15 passed；
- `npm run build`、`typecheck:web`、architecture、comments、bundle、docs、repository hygiene、
  identity、skills、oracle、hooks（482 passed）与 adapters（272 passed）全部通过；
- OpenSpec strict validate 通过；
- 当前构建的真实浏览器证据位于 `/tmp/tenon-pr-browser-postfix.0YPv6K/`：Linux 200 成功
  `19,745 / 120,000 bytes`（8 份文档）、真实 422、policy-empty、Enter/Tab、720px；macOS
  真实 501；首个请求延迟 1.2 秒捕获真实 loading + disabled；按钮亮色对比 5.02:1，实色焦点环可见。

独立 Standards + Spec 全量 reviewer 覆盖 187 个 tracked/untracked 路径，结论
`PASS — C0/H0/M0/L1`；视觉/无障碍复审结论 `PASS — C0/H0/M0/L0`。唯一 LOW 是第一轮失败
verification report 的 ledger digest 已因记录本轮修复而陈旧。该文档不是 Build 的可变文档，
因此不在 Build 伪装重登记；进入新的 Verify 后将由 `tenon-verify` 更新最终报告、登记当前 digest
并刷新 read receipts。该处置不影响代码冻结，且会在声称最终证据完整前闭合。

## 第十二轮：第二次 Verify 失败与 N-2 链修复

冻结提交 `49b3f3a6d4770f5073d03a179536b24b0eb17d42` 的 E2E、独立 reviewer 与视觉轨通过；
Codex CLI 轨发现 current=N 为普通 set、N-1 为 transition 时只校验 N-1 record，未加载 N-2
验证 `previousRecordId` 与 N-1 effects 的真实连续性。已按 exact `verify-fail` 留下 delegated
receipt 并回 Build，没有接受偏差。

TDD 修复先以一致改写 N-1 revision + TransitionRecord 并重算摘要复现红灯，再完成：

- async/sync 两条 current reader 均加载 N-2，并验证 N-1 revision 身份、effects→真实 state diff、
  run metadata 连续性以及 record `previousRecordId`；
- 两个双路径回归分别覆盖伪造 predecessor id 与同步清空 revision/record effects；
- 共用断言下沉到 `run-revision-continuity.ts`，`run-revision-store.ts` 保持 489 行并通过架构门禁；
- 重建 CLI/server 产物；全仓 317 files / 5,440 passed / 12 skipped，Web 52 files / 1,000 passed，
  docs/architecture/comments/hygiene/identity、hooks、adapters、bundle、skills、双轮 oracle 与
  OpenSpec strict validate 全部通过。

完整 pre-Verify reviewer 对 N-2 修复给出正确性 PASS，但发现运行期间
`origin/main` 已推进至 `15fe619…`，当前 branch merge-base 仍为 `2d103e3…`，且两份生成 bundle
存在 merge conflict，因此本轮结论为 `FAIL — C0/H0/M1/L0`。处置：先保存当前治理修复，再 rebase
最新主线、从合并后源码重建 bundle 并完整重跑门禁与全量审查；不得在旧基线上冻结。

## 第十三轮：最新主线收敛

已将分支 rebase 至 `origin/main@15fe619b2885b928dd27be9668cca6b0ee903c57`。两份生成 bundle
的冲突未手工拼接业务逻辑：rebase 完成后从合并源码重跑 `npm run build`；server bundle 已与
合并结果一致，CLI bundle 重新生成并同时包含主线 Codex auth 能力与本 Change 的 Context Bundle /
N-2 连续性实现。

最新基线门禁：

- `npm test -- --minWorkers=1 --maxWorkers=4`：318 files，5,490 passed，12 skipped；
- `npm run build`、`typecheck:web`、docs、architecture（627 个 production files）、
  comments、repository hygiene、identity、skills 与 OpenSpec strict validate 通过；
- hooks 482/0、adapters 272/0、bundle 31/0；
- oracle 连续两轮均为 0 处不一致。

主线漂移 finding 已修复。仍须在提交重建 bundle 后对 `origin/main...HEAD` 完整差异重新执行
pre-Verify Standards + Spec 固定点审查；该复审通过前不得设置 `pre_verify_review_result=pass`。
