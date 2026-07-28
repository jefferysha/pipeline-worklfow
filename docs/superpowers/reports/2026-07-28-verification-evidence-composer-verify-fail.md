# `verification-evidence-composer` Verify 失败报告

## 结论

- 冻结 commit：`fe2067f01bf97dfe2262d76087da62564cd55c3d`
- 冻结 tree：`ce2a2b439e282fa027d4a295bcf5b13721fb69ea`
- Track：`frontend`（共享 kernel/server/Dashboard 纵向切片）
- 结论：**FAIL**
- 决策：登记精确 `verify-fail`，返回 Build；规格语法修订经
  `requirements-changed` 回到 Spec 重新登记和复核，代码缺陷修复后重新冻结验证。

四条独立验证轨均读取冻结 commit。reviewer、E2E 与视觉轨前后复核 commit/tree 未变化；
当前工作树中的治理文件变化来自正常 Verify 状态记录。另观察到未进入冻结 commit 的
`packages/npm-bootstrap/bin/tenon-bootstrap.mjs` mode 漂移，返工时必须恢复后重新计算指纹。

## OpenSpec 严格校验

- `openspec show verification-evidence-composer --json --deltas-only`：成功读取 5 条增量需求。
- `openspec validate verification-evidence-composer --strict`：**失败**。
- 失败原因：5 个 `ADDED Requirement` 正文使用中文“必须”，但 OpenSpec 1.6.0 严格校验要求每个
  requirement body 含字面量 `MUST` 或 `SHALL`。
- 因严格校验已失败，本轮未执行隔离 archive 应用演练；修订后 Verify 必须重跑 strict validate、
  隔离 archive 和真实主规格前后 digest 对比。

这属于规格文档内容变化，不能在 Verify 或 Build 内覆盖旧 hash；返回 Build 后必须用
`requirements-changed` 进入 Spec，重新登记、读取和 exact-event review。

## 独立 reviewer 轨

独立 reviewer 覆盖 `origin/main...fe2067f` 的全部 73 个变更文件，结论 **FAIL**：

1. **Medium — 闭集 DTO 可被 `__proto__` 绕过。**
   `packages/server/src/serverPostVerificationRoutes.ts` 把不可信字段复制到普通 `{}`；
   JSON 自有 `__proto__` 会触发 legacy setter 并从 own keys 消失，导致未知字段未被 fail closed。
   必须改用 null-prototype/descriptor-safe copy，并增加真 HTTP 回归。
2. **Medium — 证据正文被 `trim()` 改写。**
   kernel 与 Dashboard 对 `command`、`result`、`skipReason` 取 `trim()`，删除合法首尾空格、
   Tab 和换行，违反“仅 CRLF→LF、其余合法内容保真”的 delta spec。应只用 trimmed view
   判断空白，canonical value 保留规范化后的原内容。
3. **Low — 非对象 validation envelope 不兼容 decoder。**
   server 的非对象错误缺少 `overflow`，而 Dashboard decoder 强制要求 boolean，真实错误会降级为
   通用 API error。服务端应返回 `overflow:false` 并补客户端回归。

## E2E 与真实浏览器轨

定向自动化通过：

- kernel formatter：11/11；
- Dashboard API client + composer：9/9；
- protected true HTTP route：3/3；
- 未鉴权 POST：真实返回 401；
- Dashboard 标题 `Tenon Dashboard`、版本 `1.0.1`、目标 root 和 Change 均已核实。

真实浏览器覆盖 1200px、768px 和 320px；空态、客户端错误、受控服务端错误、loading、真实成功、
复制成功、Shift+Tab 环绕和窄屏无横向溢出均通过。截图位于
`/private/tmp/verification-evidence-composer-visual/`。

但键盘路径存在可复现 **Medium**：

- 在 Change detail 内的 composer 按一次 Escape，内层 composer 与外层 TaskDetail 同时关闭；
- URL 丢失 `change=`，`[role=dialog]` 数量变为 0；
- 焦点回到 Change 卡片而非 composer 入口，未提交草稿上下文丢失。

现有 standalone composer 单测未覆盖真实嵌套 Dialog。修复必须保证同一 Escape 仅关闭 topmost
dialog、外层 detail 保持打开、焦点返回入口，并补嵌套回归。

## Codex CLI 轨

独立 Codex CLI 以 frozen commit 审查完整 diff。其定向 frontend 测试 9/9 通过；本机只读沙箱下
监听端口的测试遇到 `EPERM`，该环境限制不归类为产品失败。审查长时间持续读取，最终输出若未能在
本轮形成稳定结论，则按 Verify skill 降级，不覆盖 reviewer、OpenSpec 与真实浏览器的 FAIL。

## Build 已有门禁证据

- `typecheck:web`、`test:web`（52 files / 972 tests）、`build:web`、`npm run build`：通过。
- kernel 11/11、Dashboard composer/API 9/9、server route 3/3：通过。
- hooks、architecture、comments、repository hygiene、docs、identity、npx package：通过。
- `npm test` 并发全量曾触发现有
  `internal-skill-gate-hook.integration` 5 秒 timeout；同一目标独立 15 秒预算内通过。
- `npm run oracle` 首个 fixture 后未收束并被终止；不能声称通过。

## 返工后必须重验

1. 5 个 requirement body 具备字面量 `MUST`/`SHALL`，strict validate 和隔离 archive 全绿。
2. `__proto__` 及其他未知字段在真 HTTP 层稳定拒绝。
3. command/result/skipReason 的合法首尾 whitespace 与换行逐字保真。
4. 非对象 validation error 能被 Dashboard 结构化解码。
5. 嵌套 Dialog 单次 Escape 只关闭 composer、保留外层 detail 并归还焦点。
6. 重新冻结后跑四轨、完整浏览器状态矩阵和受影响的全量门禁。
