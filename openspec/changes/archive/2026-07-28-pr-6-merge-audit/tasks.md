# 任务

## 立项

- [x] 固定 PR #6、最新 head/base、原归档 Change 与独立审计分支身份。
- [x] 记录持续授权、无强推和不绕过 review/CI/证据门禁的边界。

## 调研

- [x] 审查三点 diff、冲突、实现、调用方、测试、公共契约与原 Change 证据。
- [x] 完成前后端规则、架构、GitHub review/check、文档与回滚覆盖审查。
- [x] 产出审计设计与 ADR，登记并读取精确文档证据。

## 规格

- [x] 把全部发现转为 capability delta、冲突解决策略、验证矩阵和可执行计划。
- [x] 登记 delta/plan/tasks 并取得 exact-event Spec review receipt。
- [x] 首轮 Verify 失败后补全既有键盘场景、title/root/请求生命周期/shared/ARIA 修订与返工计划。

## 实现

- [x] 以 merge commit 纳入最新 `origin/main`，解决冲突并完成最小充分修复。
- [x] 运行 TDD、定向/全量测试、构建、静态、分发与真实行为检查。
- [x] 完成独立 pre-Verify 复审，提交并非强制 push 到原 PR 分支。
- [x] 以 TDD 修复 shared 依赖、title 保真、root 失败关闭、请求取消/过期响应和字段错误定位。
- [x] 补全 OpenSpec 隔离 apply，正式重建生成物并重跑风险匹配的定向与全量门禁。
- [x] 独立 pre-Verify 全量复审通过后非强制 push 新 exact head，并等待 GitHub CI。
- [x] 第二轮 Verify 后以 TDD 修复不可信数组 canonical snapshot 与非治理 Verify 入口。
- [x] 补旧请求晚失败回归，并重建与新 head 匹配的正式产物及 sandcastle 验证环境。
- [x] 串行重跑定向/全量门禁与独立 pre-Verify 全量复审，非强制 push 后等待 exact-head CI。
- [x] 以 TDD 修复嵌套证据 composer 的 body portal、模态层所有权与草稿保留。
- [x] 在真实生产 Dashboard 上验证桌面/移动端全屏遮罩、外部点击、Escape、焦点恢复与无横向溢出。
- [x] 按 Dashboard 适用范围完成第四轮 Standards、Spec、前后端架构、安全与 design-taste-frontend 复审。
- [x] 重跑全部风险匹配门禁，提交并非强制 push 新 exact head，等待 GitHub CI 全绿。

## 验证

- [x] 冻结新 `build_sha`，执行 Reviewer、E2E、Codex 与适用视觉轨全量聚合。
- [x] 执行 OpenSpec 隔离 apply、逐文件 capability 回读和 repo-zero-output 检查。
- [x] 复核新 head GitHub CI、mergeability、review threads 与最新 main，登记验证报告。
- [x] 第三次冻结新 `build_sha`，重新执行 Reviewer、E2E、Codex 与适用视觉轨全量聚合。
- [x] 第三次执行 OpenSpec 隔离 apply、逐文件 capability 回读和 repo-zero-output 检查。
- [x] 复核第三次冻结 head 的 GitHub CI、mergeability、review threads 与最新 main，登记最终验证报告。
- [x] 第四次冻结 `build_sha=f111bd09...`，执行 Reviewer、E2E、Codex 降级与 Dashboard 视觉轨全量聚合。
- [x] 第四次执行 OpenSpec 隔离 apply、277 路径 capability 回读和 repo-zero-output 检查。
- [x] 复核第四次冻结 head 的 CI、mergeability、review threads 与最新 main，登记通过报告。

## 交付

- [x] 应用审计 delta，确认 README/docs/回滚，登记 applied-spec。
- [x] 所有最终门禁成功后按仓库历史方法合并 PR #6；merge SHA `8f9c5fa2b5712b5f0422f61d9ecea32b0f3d41b9`。

## 归档

- [x] 确认 merge SHA `8f9c5fa2...`、main CI `30380596631`、applied digest、文档 receipts 与无活跃子 Change，允许 canonical archived transition。
- [x] 原 PR worktree clean、0 commits ahead、已合并且无人占用，已用普通 `git worktree remove` 安全清理；当前自动化 worktree 保留。
