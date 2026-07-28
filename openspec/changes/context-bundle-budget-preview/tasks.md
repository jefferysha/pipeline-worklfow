# 任务

## 立项

- [x] 固定用户问题、非目标、初始影响范围与待验证假设。
- [x] 登记 proposal、design、tasks 的真实 OpenSpec 证据。

## 调研

- [x] 固定上游 A / 上游 B 的一手来源、版本、SHA、URL 与读取日期。
- [x] 对比 Tenon 当前实现、在途 Change/分支和近期 PR，证明功能独特且不重复。
- [x] 用 brainstorming 形成共享编译服务、API 与 Dashboard 交互设计，并记录 ADR。

## 规格

- [x] 编写 `context-bundle-budget-preview` delta spec，覆盖成功、空、加载、错误与键盘场景。
- [x] 冻结 API、错误码、兼容性、测试和回滚计划。
- [x] 根据 Build 红队审查补充可信 fd reader、资源上限、结构化错误与 custom-step 契约。
- [x] 根据二轮红队审查冻结无 fd-relative traversal 平台的 fail-closed capability error。
- [x] 根据固定点审查冻结 canonical state 损坏机器码与 UI-neutral reason domain token。

## 实现

- [x] 以 TDD tracer bullet 打通共享服务、真实 GET 路由与抽屉成功态。
- [x] 补齐 typed error、source/materialized bytes、空态与预算失败，并保持 CLI 字节级兼容。
- [x] 实现 registered root anchor、Change/phase/budget 校验和无正文的只读 API。
- [x] 实现 Dashboard API decoder、竞态隔离、成功/错误/空/加载/重试状态。
- [x] 补齐中英文文案、Enter/Tab/焦点路径与无障碍测试。
- [x] 修复可信 fd 读取、资源上限、custom-step 与结构化错误安全边界。
- [x] 补齐 kernel、CLI、server、前端组件与跨端契约测试。
- [x] 将损坏 canonical state 映射为安全 409，并将 Dashboard reason 本地化与 kernel 包边界解耦。

## 验证

- [x] 运行定向测试、typecheck:web、test:web、build:web、build 与 npm test。
- [x] 在真实 Tenon Dashboard 覆盖成功、预算失败、缺文档/空态、重试和键盘路径。
- [x] 完成四轨 review、verification report 与 exact-event delegated receipt。

## 交付

- [ ] 应用 delta spec，提交并推送范围内变更。
- [ ] 创建非草稿 PR，写明上游证据、前后端影响、验证、风险和回滚。
- [ ] 检查 PR URL、标签与 CI，修复可控失败或记录外部阻塞。

## 归档

- [ ] 读取全部治理文档，完成最终 tasks/ledger 登记并归档 Change。
- [ ] 将本轮时间、候选、选择、Change、分支、worktree、PR、SHA、验证和阻塞写入 automation memory。
