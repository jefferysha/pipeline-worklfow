# 任务

## 立项

- [x] 固定 PR #5、最新 head、base、独立审计分支与原归档 Change 身份。
- [x] 记录授权边界、连续执行与不绕过门禁的处理原则。

## 调研

- [x] 读取三点 diff、修改实现、调用方、测试、公共契约和原 Change 产物。
- [x] 完成前后端规则、架构、代码质量、GitHub review/check 与文档覆盖审查。
- [x] 产出合并审计设计与 ADR，登记精确文档证据。

## 规格

- [x] 将发现转为可验证需求、修复计划和验证矩阵。
- [x] 登记 delta spec、实施计划与 exact-event review evidence。
- [x] 将首次 Verify 的 ADR 漂移、1024px Workbench 阶段发现性与主题测试缺口写入规格和计划。

## 实现

- [x] 增加互补的 `mobile` / `desktop` variant，统一替换 720px class 并更新临界点测试。
- [x] 补齐 TrafficPanel i18n，修正抽屉关闭 easing 并增加定向测试。
- [x] 修复 Markdown 空白并从真实 Dashboard 刷新进度页截图。
- [x] 提交修复与治理产物，以非强制 push 更新原 PR head。
- [x] 增加 1024px 阶段滚动提示与可访问关联，并加固主题解析路径测试。
- [x] 修正 ADR、实施命令、Nav 注释和 Lucide 线宽说明。
- [x] 统一 Tailwind transition 的 ease-out 基线，修正 AppHeader popover 关闭缓动并补测试。

## 验证

- [x] 运行定向测试、前端与全仓构建/测试、适用静态和分发门禁。
- [x] 对真实 Tenon Dashboard 执行桌面/移动、明/暗、键盘及受影响状态浏览器验收。
- [x] 复核 GitHub CI、mergeability、review threads 与最新 main，产出验证报告。

## 交付

- [x] 应用审计 delta、确认 README/docs 与回滚说明，登记 applied-spec。
- [x] 在所有门禁成功后以仓库允许的方法合并 PR #5 并记录 merge SHA。

## 归档

- [x] 确认 merge SHA 可从 `origin/main` 到达后归档审计 Change。
- [x] 仅在无人占用、完全干净且无未推送提交时安全清理 PR worktree，否则保留并记录原因。
