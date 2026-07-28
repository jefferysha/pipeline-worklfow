# Host Target Plan Center：Tenon 当前实现调研

## 一句话定位

Tenon 在基线 `2d103e330f847e003ff5909097d892f5722cca04` 已经拥有单宿主选择、native/adapter 分流和人类可读 `--dry-run`，但缺少可供 Dashboard 稳定消费、严格校验且不执行写路径的结构化计划契约。

## 现有事实

### 宿主注册与选择

- `packages/cli/src/commands/plugin-host.ts:8-24` 的 `TENON_HOSTS` 是 setup/update 共同使用的宿主白名单，共 12 个目标；`codex`、`claude` 被明确分类为 native，其余为 adapter。
- `packages/cli/src/commands/plugin-host.ts:164-179` 的 `selectPipelineHost` 要求写操作必须且只能选择一个宿主。
- `packages/cli/src/program-install.ts:18-60` 把同一组宿主展开为 setup/update flags，adapter 额外支持 project `--target`。
- `adapters/registry.yaml` 是 adapter 能力矩阵真相源，但当前 CLI 的 `TENON_HOSTS` 仍是手工对齐列表；本轮不得再开放任意自定义目标。

### 已有计划原语

- `packages/cli/src/commands/plugin-host.ts:189-207` 已有 Codex/Claude setup 的 native command plan。
- `packages/cli/src/commands/update.ts:45-63` 已有 Codex/Claude update 的 native command plan 与文本渲染。
- `packages/cli/src/commands/setupHost.ts:231-259` 的 `--dry-run` 能预览 native marketplace 命令或 adapter 部署目标，并保证不进入实际安装分支。
- 这些原语只输出非结构化文本，且 setup/update 的展示分散在多个命令路径；Dashboard 若直接复制规则会产生漂移。

### Server 与 Dashboard 接入模式

- `packages/server/src/operations.ts:1-92` 已确立“生产逻辑归 CLI，Dashboard server 通过 argv 数组调用 bundle”的窄端口，避免 server 复制执行语义；相同方式可承载只读计划命令。
- `packages/server/src/server.ts:173-192` 已装配可注入的 `PipelineCliRunner` 与 capability 声明，测试可用 fake runner 验证 HTTP/argv 映射。
- `packages/dashboard-app/src/api/client.ts` 是稳定 facade，具体领域 client/decoder 应放在 `src/api/`；视图不应解析任意 JSON。
- `packages/dashboard-app/src/shell/Nav.tsx:18-31` 和 `App.tsx` 只负责视图白名单与装配，新计划中心应作为独立功能域进入 rail，而不是把计划逻辑塞入外壳或 MachineView。

## 方案比较

| 方案 | 单一真相源 | 包耦合 | 零副作用证明 | 结论 |
| --- | --- | --- | --- | --- |
| A. 把 setup/update 命令计划整体搬入 kernel | 高 | CLI/server 都依赖 kernel，但 kernel 会吸收宿主 CLI 协议 | 纯函数容易证明 | 拒绝：违反 kernel 领域层不承载 CLI/供应商协议的边界，迁移范围过大 |
| B. 在 CLI 宿主模块旁新增稳定只读 `host-target-plan` JSON 命令，server 只做严格 HTTP 校验和 CLI adapter | 高 | 沿用现有 server→CLI argv 端口，无新 workspace 依赖 | 命令只构建 DTO；测试断言 runner 未进入 setup/update | 采用：最窄、兼容现有分层 |
| C. server 直接读取 adapter registry 并重建 setup/update 计划 | 低 | server 自包含 | handler 可只读 | 拒绝：形成第二套宿主/命令规则，最容易与 CLI 漂移 |

## 推荐边界

1. CLI：
   - 计划类型、白名单解析和 DTO 构建位于 `packages/cli/src/commands/host-target-plan.ts`。
   - `tenon host-target-plan --json` 返回 catalog；显式 `--host <id> --operation <setup|update> --json` 返回单计划。
   - DTO 只从 `TENON_HOSTS`、native 分类、`nativeInstallPlan`、`nativeUpdatePlan` 和现有 flag 生成；不接受自定义 `.foo` 或自由路径。
2. Server：
   - `GET /api/host-targets` 返回经严格 decoder 验证的 catalog。
   - `GET /api/host-target-plan?host=&operation=` 拒绝缺失、重复、未知参数和白名单外值，再用固定 argv 调 CLI；不接收 root/target，不调用 setup/update。
3. Dashboard：
   - `src/hostPlan/` 拥有目标卡、操作选择、状态与命令/步骤预览。
   - `src/api/hostTargetPlanClient.ts` 拥有请求、错误映射和 runtime decoder。
   - 外壳只新增 view/rail 装配；所有新增可见文本进入中英文 i18n。

## 红队自检

- 假设：`TENON_HOSTS` 是 P1 唯一可选集合。证据：setup/update 的 flag 类型和选择器直接消费它。若不成立，CLI 与 Dashboard 会显示不受支持的宿主；因此 API 只消费该 catalog，不解析任意 adapter 路径。
- 假设：CLI plan 可以作为 server 的稳定只读真相源。证据：server 已用 `PipelineCliRunner` 承载 CLI 生产逻辑。若 CLI 输出畸形，server 必须返回稳定错误而不是透传未知 JSON。
- 假设：不用 project root 也能给出有价值预览。native 计划不需要 root；adapter 以 `<project>` 占位符展示 project-scope 命令。若未来需要真实目标目录，应新增受注册表信任锚约束的 v2 输入，不能把任意路径塞进 v1。
- 假设：计划不是执行。DTO 必须显式 `side_effects: "none"`，UI 必须标明只读并仅提供复制命令，不提供运行按钮。

## 开放问题与保守结论

- 是否展示 adapter 的完整 hook tier？本轮只展示由 CLI 可稳定证明的 native/adapter、target scope、auto-update/project-target 等能力；完整 registry tier 留给后续共享 registry contract。
- 是否允许 custom target？不允许。Comet 的 project-scope custom target 只作为设计启发，P1 仅支持 `TENON_HOSTS`。
- 是否在 API 接受 `target`？不接受。P1 的计划保持机器级稳定且零路径输入；adapter 命令使用 `<project>` 占位。
- 是否提供执行按钮？不提供。用户只能复制现有 setup/update 命令并回到终端自行执行。
