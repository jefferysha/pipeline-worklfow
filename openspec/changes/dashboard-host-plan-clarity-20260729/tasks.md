# 任务：Host Plan 桌面信息清晰度

## 立项

- [x] 建立唯一 Change、`codex/` 分支和独立 worktree 身份。
- [x] 确认 1024–1920px 桌面范围、非目标和开放 PR 非重叠边界。
- [x] 创建 proposal、design 与七阶段任务骨架并登记证据。

## 调研

- [x] 读取 Host Plan 实现、调用方、相邻测试、API 类型和中英文文案。
- [x] 采集 1024、1200、1440、1920px 真实桌面浏览器基线，覆盖布局、主路径和无溢出事实。
- [x] 形成审计、技术设计与 ADR，明确紧凑目录 + 已选详情的连贯改进。

## 规格

- [x] 编写 `host-target-plan` 电脑端目录与已选详情 delta spec。
- [x] 冻结实现计划、受影响文件、TDD 场景和桌面浏览器验收矩阵。

## 实现

- [x] 先补失败测试，证明目录去除重复 capabilities、已选详情补齐完整上下文。
- [x] 实现紧凑目录与已选宿主详情，保持请求取消、错误、空态和复制行为。
- [x] 运行定向测试与类型检查，确认无需新增中英文文案或动画。

## 验证

- [ ] 运行定向 Vitest、`npm run typecheck:web`、`npm run test:web` 和 `npm run build:web`。
- [ ] 在 1024、1200、1440、1920px 做真实桌面浏览器验收并记录成功/失败/空态、键盘、主题和 reduced-motion 证据。
- [ ] 完成代码、可视、E2E/浏览器三轨审查并修复 Critical/High/Medium 问题。

## 交付

- [ ] 提交并 push 当前 `codex/` 分支，创建非草稿 PR。
- [ ] 填写设计前后、可访问性、动效、测试、浏览器、兼容性、风险和回滚证据。
- [ ] 检查并修复 actionable PR review/CI 失败直至终态。

## 归档

- [ ] 应用主 spec，复核全部文档收据并完成 Tenon Archive。
- [ ] push 归档提交并更新 automation memory 的最终身份、验证、CI 和阻塞。
