# ADR：AFK empty fixture 必须显式绑定 hermetic phase Skill 根

## 背景

`runAfkRound` 在扫描 ready 队列之前执行 active-loop wiring。W_LOOPS_YAML 的 `_all` bundle 会解析 default `build` / `ship` phase Skill slots，并由 production locator 从 `doctor.pluginRoot` 与宿主 roots 定位内容。

Issue #43 的 empty-ready-queue fixture 直接使用 `makeDeps` 的默认 `/plugin` 根。宿主有 Codex Skill cache 时测试通过；以 `HOME=/tmp` 模拟无宿主安装面时，wiring guard 先失败，CLI 返回 configuration-error exit `1`，掩盖了应为成功的空队列分支。

## 决策

empty fixture 使用同一临时 `.test-plugin` 根和 `withEnterAfkSkillAuthority` helper；生产执行顺序与 fail-closed 错误分类保持不变。空队列仍只由 `scanReadyFromFs` 判定，Docker/policy/Skill 失败仍非零。

## 备选方案

- **移动 wiring guard**：拒绝，会让未接线 active loop 在空队列时绕过安全闸。
- **缺失 Skill fail-open**：拒绝，会削弱 #43 phase Skill enforcement。
- **fixture-only hermetic 装配**：采用，最小、可回滚且隔离宿主差异。

## 后果

- macOS、Linux 和 CI 都使用显式可重复的 phase Skill 内容，测试不依赖本机安装。
- 真实生产路径、队列语义、Docker 探针和公共接口零变化。
- 后续新增 AFK fixture 必须从临时 plugin root/authority helper 装配，不得直接依赖 `makeDeps` 默认 host roots。
