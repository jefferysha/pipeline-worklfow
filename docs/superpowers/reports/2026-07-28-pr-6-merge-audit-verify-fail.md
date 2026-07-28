# PR #6 合并审计验证报告（首轮失败）

> Change：`pr-6-merge-audit`
> 冻结构建：`7280dd3d45be69e88a695b82580ea2c5b3779f88`
> 对比基线：`origin/main`
> 结论：失败；必须回到 Build/Spec 修复后重新冻结并全量验证

## 结论

四轨与 OpenSpec 隔离应用聚合为 **FAIL**：

- Critical：0
- High：0
- Medium：3
- Low：3
- E2E：PASS，但隔离副本的全 workspace suite 证据为 `DEGRADED`

GitHub exact-head `CI/verify` 已成功，但不能覆盖独立 Reviewer、Codex 和 OpenSpec 演练发现。
本轮不在 Verify 修改实现或规格。报告登记后将通过精确 `verify-fail` review receipt 返回
Build，再因 delta 与既有 capability 场景不完整通过 `requirements-changed` 返回 Spec。
所有已知项修复并补回归后，重新冻结新 SHA，重新执行四轨和隔离应用。

## 冻结边界与零输出

- 页面身份：`Tenon Dashboard`
- PR #6 head / `build_sha`：
  `7280dd3d45be69e88a695b82580ea2c5b3779f88`
- GitHub exact-head CI：run `30357631211`，`CI/verify` 成功，耗时 7m41s。
- 合并状态观察时为 `MERGEABLE/CLEAN`；本报告的失败裁决优先，禁止合并。
- 主工作树仅有 Tenon Build→Verify、文档回读和 revision 产生的
  `openspec/changes/pr-6-merge-audit/**` 治理输出。
- 排除该允许目录后的实现 diff SHA-256，四轨前后均为
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- canonical capability spec 的 SHA-256 前后均为
  `39829bf745e187ee03849579099216912a8e736cdde830a4dd34c48ac3ae8fe5`。
- Reviewer、E2E、Codex 与视觉轨均未修改被冻结实现。

## 聚合发现

### M1：shared 层反向依赖 verification 功能域

`packages/dashboard-app/src/shared/TaskDocumentsSection.tsx` 直接导入
`../verification/VerificationEvidenceComposer`，并让 shared props 承担 feature 专属的
`locale/phase/root/onToast`。这违反 `FRONTEND.md` 对 shared 的准入和禁止反向依赖规则。

修复方向：由上层 feature/shell 装配 composer，通过 slot 或中性 prop 注入
`TaskDocumentsSection`，使 shared 不认识 verification。

### M2：title 空白语义与 canonical spec 冲突

canonical spec 规定内容只做 CRLF 规范化，title/result 中的 Tab、前后空白和 CRLF 内容必须保留。
冻结实现同时在 UI `draftEntry` 和 kernel formatter 修剪 title。运行时探针把带前导 Tab 与尾随
CRLF 的 title 输出为 `Title`，与规范不符；原设计中“title trimmed”的描述也与规范漂移。

修复方向：只用 `trim()` 判定“是否为空”，传输和 formatter 保留合法原文；修订当前审计设计/
计划说明，补 UI、kernel 与 HTTP 回归。

### M3：MODIFIED Requirement 缺少既有场景，隔离 apply 失败

真实 `/opt/homebrew/bin/openspec` 版本 1.6.0。目标 Change 的 `show` 与 strict validate 通过，
但隔离副本
`/private/tmp/pr6-openspec-verify.mkLZpm`
执行：

```text
openspec archive pr-6-merge-audit --yes --json
```

返回 `archive_spec_update_failed`。delta 修改
“Dashboard 必须提供 Verify-only 完整编排交互”时省略了主规格已有
“键盘路径完整”场景，应用将删除该场景。隔离副本没有写入；主规格 strict validate 与 digest
保持不变。

修复方向：经 `requirements-changed` 回到 Spec，MODIFIED Requirement 必须完整携带全部既有
场景及本 Change 新场景，再在隔离副本验证 archive/apply 和目标规格 strict validate。

### L1：缺失 root 可隐式采用 server cwd

`serverPostVerificationRoutes.ts` 把缺失或非字符串 `root` 变为 `''`，随后
`resolvePath('')` 可把 server cwd 当作显式 root。只读探针已证明 resolver 接收空字符串时，
handler 可以返回 200。

修复方向：route 先对 root 做 closed validation，返回稳定的 400
`verification_evidence_invalid` envelope，并补真实 HTTP 无 root/非字符串 root 测试。

### L2：请求缺少取消和过期响应防护

compose API client 没有 `AbortSignal`，组件没有 request identity 或 cleanup。用户提交后关闭
dialog，请求仍运行；重开后可能继续 busy 或接收已放弃请求的响应，不符合
`FRONTEND.md` 的请求取消、并发与恢复规则。

修复方向：client 接受 signal；组件在关闭/卸载时 abort，并以 request identity 防止过期响应
覆盖新会话，补关闭、重开和旧响应晚到测试。

### L3：字段级错误关联与聚焦可以加强

验证错误已经通过 polite live region 被辅助技术感知，草稿也保留，但具体失败控件尚未设置
`aria-invalid`/`aria-describedby`，提交失败后焦点仍停留在 Compose。多 entry 时定位成本较高。

修复方向：把字段路径映射到控件级错误语义，关联描述，并把焦点移到首个无效控件；补键盘和
DOM 可访问性测试。

## 四轨结果

### Reviewer

结论：**FAIL；C0/H0/M1/L1**。

- 覆盖 kernel DTO/预算/确定性、server Host/token/content-type/root/error、Dashboard
  Verify-only/状态/i18n/focus、治理/回滚/生成物。
- `npm test`：317/317 files，5465 passed，5 skipped。
- `npm run test:web`：1004 passed；一个既有 GSAP 挂钟焦点用例在全量中波动，精确独立重跑通过。
- architecture、comments、目标 OpenSpec strict validation、state 与 diff check 通过。
- 发现 M1 shared 反向依赖与 L1 root 隐式 cwd。

### E2E

结论：**PASS；C0/H0/M0/L0**。

- 隔离目录：`/private/tmp/tenon-pr6-verify-zGgGZh/repo`。
- kernel 12/12、server route 4/4、Dashboard focused 25/25 通过。
- 真实 HTTP 覆盖 200/400/401、中英文 locale、确定性输出。
- Chromium 覆盖 empty、client/server validation、loading、单次提交、success、断网、
  重试、clipboard 成功/失败、手工选择、双向 Tab、嵌套 Escape、焦点恢复和 phase 可见性。
- fixture governance digest 前后均为
  `08df7a0d84ec5da68c656d48e802c5edb517ac43293d5fee35e6b1aa786a4c19`。
- Dashboard 全量：56 files / 1005 tests；`typecheck:web` 通过。
- 连续两次 `npm run build` 通过，CLI/server/Dashboard 产物 SHA 清单一致并与 tracked dist
  无差异。
- 首次全 workspace suite 在只预编译 kernel/server 的隔离顺序下有 40 suites 因其他 workspace
  包尚未构建而收集失败；已有 4890 passed / 5 skipped。之后完整 build 已通过但未重跑该耗时
  suite，因此准确标记 `DEGRADED`，不伪称全绿，也不单列产品 finding。主线 Reviewer 的全量
  `npm test` 已为冻结 SHA 提供成功证据。
- 证据根：`/private/tmp/tenon-pr6-verify-zGgGZh/artifacts`。

### Codex CLI

结论：**FAIL；C0/H0/M1/L1**。

第一次把 2.326MB 完整 binary diff 送入 Codex 时，真实失败为：

```text
Input exceeds the maximum length of 1048576 characters
```

随后改为只读、让 Codex 在仓库内自行读取冻结 diff，成功覆盖全部源码、测试、规格、文档与生成物，
并发现 M2 title 空白语义和 L2 请求取消/过期响应问题。其无写构建与 tracked 产物逐字节相同：

- CLI：`ca7ff1f…`
- server：`27830c…`
- Dashboard JS：`c6d084…`
- Dashboard CSS：`a87627…`
- Dashboard HTML：`9c4238…`

### 视觉与无障碍

结论：**PASS_WITH_LOW_ADVISORY；C0/H0/M0/L1**。

- 覆盖 empty、增删、字段互斥、loading/success、server/network error、复制、手动焦点、
  双向 Tab、Escape/focus restore、zh/en、light/dark、reduced-motion。
- 覆盖 1728、1280、390、375；无页面横向溢出，移动字段单列且动作可达。
- 浅/深主题输入与次级内容对比度均通过；focus-visible 可见。
- 最终 network failure、runtime exception、console warning/error 均为 0。
- L3 为字段级错误关联与聚焦增强。
- 证据：`/private/tmp/pr6-verify-visual.qoxCBs/audit-summary.json` 及同目录截图。

## 逐文件 capability 回读

`git diff --name-only origin/main...7280dd3d45be69e88a695b82580ea2c5b3779f88`
共 211 个文件。以下互斥分组覆盖全部 211 个实际路径，组内每个文件均已回读：

| 完整改动文件组 | 数量 | capability / evidence | 回读 |
| --- | ---: | --- | --- |
| `docs/**` | 11 | `verification-evidence-composer`、`repository-architecture-compliance` | ☑ |
| `openspec/changes/archive/2026-07-28-verification-evidence-composer/**` | 118 | 原 Change delta/applied spec、`document-evidence-contract`、`interaction-and-skill-provenance`、`dashboard-execution-provenance` | ☑ |
| `openspec/changes/pr-6-merge-audit/**` | 53 | 审计 delta、`repository-architecture-compliance`、document/review/revision provenance | ☑ |
| `openspec/specs/verification-evidence-composer/spec.md` | 1 | canonical `verification-evidence-composer` | ☑ |
| `packages/**/src/**` | 21 | formatter/kernel、server/API、Dashboard composition capability | ☑ |
| `packages/**/dist/**` | 7 | 同 capability 的正式生成物绑定与可复现构建 | ☑ |
| **合计** | **211** | 无遗漏 | ☑ |

隔离 apply 暴露的 M3 说明“已回读”不等于“可应用”；因此本轮明确失败，下一轮必须同时取得
逐文件回读和 OpenSpec archive/apply exit 0。

## 回退与下一轮

1. 登记本报告并取得 exact-event `verify-fail` review receipt，返回 Build。
2. 立即以 `requirements-changed` 返回 Spec，补全 MODIFIED Requirement 的全部既有场景，
   同步当前审计设计/计划的 title 空白语义与验证矩阵。
3. exact-event Spec review 后回到 Build，以 TDD 修复 M1/M2、L1/L2/L3。
4. 正式重建 CLI/server/Dashboard 产物，执行定向、全量、架构、文档和规则检查。
5. 独立 pre-Verify 复审达到 C0/H0/M0；不遗留本轮已知 Low。
6. 非强制 push 新 exact head，等待所有必需 GitHub checks 成功。
7. 重新冻结并执行 Reviewer、E2E、Codex、视觉、repo-zero-output、逐文件 capability 回读及
   OpenSpec 隔离 archive/apply；只有全门禁通过才能进入 Ship。
