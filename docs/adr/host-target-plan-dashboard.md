# ADR：宿主计划以 CLI 为真相源并保持只读

## 背景

Tenon 已在 `packages/cli/src/commands/plugin-host.ts` 维护 `TENON_HOSTS`、native/adapter 分类和 native setup plan，在 `update.ts` 维护 native update plan。Dashboard server 已有通过 argv 数组调用 CLI bundle 的窄端口。若 server 或 UI 再生成一套计划，会削弱显式单宿主和零副作用边界。

外部证据提供两条启发：

- Comet `2945693e4061c369be0d400ed2999a66fa87c680` / PR #227 将 `init/update --platform` 收敛到共享目标 resolver，并只在 project scope 接受 custom target。
- Trellis v0.6.9 强调角色化、按任务读取；未发布 PR #468 / `5f543960` 研究按路径、有预算的上下文刷新，但仓库为 AGPL-3.0。

## 决策

1. 新增稳定、纯只读的 `tenon host-target-plan --json` 命令，catalog 和单计划均使用 `host-target-plan/v1`。
2. P1 只接受 Tenon 已注册 `TENON_HOSTS`；不采用 Comet 的 project custom target，不接受任意 `.foo` 或路径。
3. server 通过现有 `PipelineCliRunner` 调 CLI，先严格校验 HTTP 查询，再严格验证 CLI DTO；不调用 setup/update。
4. Dashboard 只消费 catalog/plan，展示 native/adapter、能力、命令和步骤；只允许复制命令，没有执行按钮。
5. Adapter 计划按真实控制流区分操作：setup 在 `adapter-deploy` 后继续 `bundled-skills` 与 `runtime-readiness`，update 在 `adapter-deploy` 后结束；用真实命令集成测试而非三端同源 fixture 证明该差异。
5. Trellis 只作 clean-room 设计启发。不得复制 AGPL-3.0 或未发布 beta 的源码、测试、文案、状态机或文件结构。

## 选择理由

- CLI 是宿主 flags 与写路径的现有 owner，把计划放在相邻模块能复用真实 native plans。
- server→CLI argv adapter 已是仓库既定的“避免第二套生产实现”模式，无需增加 workspace 依赖。
- 白名单 P1 比 custom target 更保守，符合 Tenon 已有 adapter registry 和本轮零副作用目标。
- 版本化 DTO 与三层 decoder 比解析 `--dry-run` 文本更稳定。
- 将 Trellis 的“按目标给最小上下文”映射为 catalog→单计划请求即可，不需要引入其复杂注入机制。

## 备选方案

- 把计划移到 kernel：拒绝，供应商命令不属于 workflow/state 领域。
- server 直接解析 `adapters/registry.yaml`：拒绝，会与 CLI 目标和 setup/update 逻辑漂移。
- server 调 `setup/update --dry-run` 并解析文本：拒绝，文本不是稳定 DTO。
- 支持 project custom target：推迟到未来版本；必须先有共享 registry contract、scope 和能力验证，不能由 P1 猜测。

## 后果

### 正向

- Dashboard 与终端使用同一宿主集合和 native plan。
- API 零路径输入、无写 token、无执行入口，攻击面有界。
- 新宿主进入 `TENON_HOSTS` 后会自动进入 catalog，并由契约测试迫使 UI/能力映射显式处理。

### 代价

- Dashboard server 以实例级 runtime 合并同键 in-flight 请求、串行不同 key，并缓存最多 25 个
  canonical 成功结果；失败不缓存且可重试。
- adapter 内部步骤只展示稳定外层计划，不承诺脚本内部每个文件动作。
- setup/update 的外层步骤必须分别对齐 `cmdSetup`/`cmdUpdate`；三端 fixture 一致但与真实命令不一致时视为契约失败。
- CLI/server/frontend 各有 decoder，需要用契约测试保持同步。

### 后续

- 若未来需要 custom target 或真实 project target，必须设计 v2，绑定机器项目注册表信任锚并定义 capability source；不得向 v1 追加任意路径。
- 若将来形成真正跨 CLI/server 的宿主分发领域包，再评估共享 DTO；本轮不提前抽象。
