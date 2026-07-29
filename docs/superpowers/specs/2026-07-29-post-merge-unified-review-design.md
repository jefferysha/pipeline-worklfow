# 最终主干统一审查设计

## 用户结果

用户要求先把全部开放非 Draft PR 合入 `main`，再用一个统一 Review Change 审查最终组合，而不是逐 PR
重复七阶段。交付结果必须证明最终主干的前端、Dashboard、后端、共享契约、依赖、安全、文档和发布
资产能够一起工作；发现的问题必须在 release 前修复。

## 约束与非目标

- 基线固定为 `main@907dac067c17ed77fb440b91b20d64fd0f24773b`。
- 审查修复只使用当前独立 worktree/Change/`codex/` 分支。
- 不改变自动化的每四小时配置，不修改 canonical state 或 `.pipeline.yaml`。
- 不新增无关产品功能，不发布 npm 包或生产部署。
- 不把旧 PR 验证、单次绿色测试或放宽超时当作本 Change 的通过证据。

## 合并能力覆盖

| PR | capability | 前端 / Dashboard | 后端 / 共享契约 | 核心证据 |
| --- | --- | --- | --- | --- |
| #8 | `host-target-plan` | Host Plan 状态、复制、响应式 | CLI owner、loopback GET、严格 DTO | CLI/server/UI tests + API/browser |
| #14 | `dashboard-ui-ux-system` | App/Nav/Progress/Workbench | snapshot 与导航契约 | full Dashboard + design/browser |
| #13 | `trace-timeline` | timeline 空/错/加载/长内容 | metadata-only 解码与脱敏 | contract/API/UI tests |
| #11 | `loop-scope-preview` | Governance 空态与升档确认 | Loop scope DTO | row refresh TDD + browser |
| #12 | `related-session-memory` | Progress 搜索、焦点与取消 | root-scoped bounded search | decoder/server/UI tests |
| #9 | `prompt-routing-bypass` | 无新增 UI | hook/router/Linux stat | hook and portability gates |

`verification-evidence-composer`、`context-bundle-budget-preview`、公开文档和生成物作为相邻组合面纳入
全量回归。

## 调研结果

### 已通过

- 最终 main 的 GitHub Actions run `30435051575` 成功。
- 正式 root build 成功；GovernanceRail 30 轮、ProgressView 20 轮、Dashboard 全量 4 轮连续通过。
- architecture、comment honesty、repository hygiene、docs 与 Dashboard typecheck 通过。
- 390×844 Progress drawer 与 Governance 空态无横向溢出；Escape 关闭与焦点回归正确。
- light/dark/system 主题循环正确。

### 必须修复

1. Governance 确认清理依赖 `[row]`，逻辑等价新对象会关闭当前确认。
2. English Workbench 仍有非技术性中文产品文案和可访问名称。
3. `npm audit` 为 5 moderate / 1 high / 1 critical。

### 已验证的依赖候选

隔离原型以 Vitest `^3.2.6`、Vite `^6.4.3`、AJV `^8.20.0` 和 VitePress→Vite `6.4.3`
override 得到 audit 0、有效依赖树、正式 build、docs check/build 和 101 个关键 Dashboard 测试通过。
由于 override 越过 VitePress 1.6.4 声明范围，它只能在全量 Verify 后保留。

## 关键业务规则与不变量

1. 逻辑等价 Loop 快照不打断用户已开始的升档确认。
2. root、Loop identity、当前级别、可选目标或阻断事实变化时，旧确认必须失效。
3. Dashboard 当前 locale 控制所有产品文案与可访问名称；技术标识和用户数据不翻译。
4. 干净可发布依赖树不允许 Critical/High；本 Change 的目标是 audit 0。
5. 依赖升级不改变 Node `>=22`、workspace 脚本或 CLI/HTTP 公共契约。
6. 所有生成物从冻结的最终源码重建，禁止手工拼接 hashed assets 或 bundle。

## 升档确认状态机

```text
idle
  -> select promotion
confirming(snapshot-key)
  -> equivalent snapshot: stay confirming
  -> decision facts changed: idle
  -> Escape/cancel: idle and restore focus
  -> submit: submitting -> success/error
```

## 设计选项

| 方案 | 取舍 | 结论 |
| --- | --- | --- |
| 仅报告，等 CI | 快，但保留安全与状态缺陷 | 拒绝 |
| 定向状态/i18n 修复 + 已验证安全依赖组合 | 范围最小，可 TDD 与回滚 | 采用 |
| Workbench 重写 + VitePress 2 alpha | 变更面和兼容风险过大 | 拒绝 |

## 验证和回滚

- Build 先建立三个 RED：等价 row refresh、English Workbench 不含硬编码中文、依赖审计门。
- 运行 root/full Dashboard/full server/CLI/hook tests、typecheck、build、docs build、资产 freshness、
  OpenSpec、architecture/comments/hygiene 和 `npm audit`/`npm ls`。
- 真实 production Dashboard 覆盖 390/720/1024/1440、zh/en、light/dark、focus、Escape、
  loading/empty/error/success/disabled 与 reduced-motion。
- 若依赖 override 触发任何 docs/build/test/CI 失败，整组回滚并重新选稳定组合。

## 术语与证据边界

- 最终 main：批次全部合并后的精确 SHA，不是任一旧 PR head。
- 逻辑等价：决策相关字段相同，仅对象 identity 或非决策展示字段变化。
- audit 0：干净安装后的 npm 审计结果，不是人工忽略列表。
- 浏览器通过：当前 worktree 正式 assets 和真实 root/Change identity，不是其他端口进程。

```coverage
touches:
L1_api:      waived -> 不改变公开 API；只做现有 DTO 组合回归
L2_data:     waived -> 不新增持久化 schema
L3_rules:    filled -> #关键业务规则与不变量
L4_state:    filled -> #升档确认状态机
L5_errors:   filled -> #验证和回滚
L6_security: filled -> #调研结果
L7_perf:     waived -> 不改变运行时性能边界
L8_deps:     filled -> #已验证的依赖候选
L10_terms:   filled -> #术语与证据边界
```
