---
change: fix-tenon-entry-skill-contract
design-doc: docs/superpowers/specs/fix-tenon-entry-skill-contract-design.md
locale: zh-CN
---

# 实施计划

## 阶段 1：曳光弹——从身份源打通入口到 doctor

> 子阶段边界：完成后建议 `/clear`。

- [ ] 在 `product/identity.json` 增加 `entrySkill: "tenon"`，扩展
  `tools/generate-product-identity.mjs`，一次生成 TypeScript 身份与 Codex managed block 模板。
- [ ] 让 `packages/cli/src/commands/doctor-skills.ts` 的 contract skills 从
  `PRODUCT_IDENTITY.entrySkill` 开始，补充 `packages/cli/src/commands/doctor.test.ts` 回归。
- [ ] 运行 `npm run generate:identity`、产品身份定向测试和 doctor 定向测试，证明最小链路
  “JSON 身份 → 生成常量 → doctor 发现根入口”打通。

## 阶段 2：统一所有投影与宿主安装态

> 子阶段边界：完成后建议 `/clear`。

- [ ] 将根 `AGENTS.md` 的 Tenon 哨兵块替换为生成模板内容；修改
  `adapters/codex/install.sh` 只读取该模板，并在 `tools/test-adapters.sh` 验证
  `tenon:tenon`、唯一 CLI 与哨兵外内容保留。
- [ ] 扩展 Codex 宿主 inventory 诊断，区分“当前根入口缺失”和“冲突工作流插件仍启用”；
  修复指引只使用宿主插件管理器，不直接修改 cache。
- [ ] 扩展 `tools/check-product-identity.mjs` 与 `tools/product-identity.node-test.mjs`，验证入口目录、
  frontmatter、完整 Skill 引用、AGENTS 新鲜度、adapter 模板消费和宿主冲突诊断。

## 阶段 3：仓库卫生、版本与分发闭环

> 子阶段边界：完成后建议 `/clear`。

- [ ] 复核 `tools/check-repository-hygiene.mjs` 对受版本控制路径与正文的摘要式受禁身份扫描，
  增加漏扫/大小写/错误输出不回显的回归，并确保根测试与 Release workflow 调用该门禁。
- [ ] 将 workspace、Codex/Claude plugin、Marketplace 与文档站版本统一推进到 `1.0.1`，
  更新中英文 release notes，并重新生成 CLI/server/dashboard/bundle。
- [ ] 在最终 payload、tracked paths 和 tracked text 上执行零残留扫描；验证 npm tarball 与
  GitHub Release 资产不包含内部研究、测试运行态或受禁身份。

## 阶段 4：Dashboard 显式项目上下文曳光弹

> 子阶段边界：完成后建议 `/clear`。

- [ ] 先在 `packages/dashboard-app/src/shell/dashboardLocation.test.tsx` 将
  `resolveDashboardRoot()` 的契约改为“无偏好或失效偏好返回无选择”，并在
  `packages/dashboard-app/src/App.test.tsx` 增加两个失败用例：有已注册项目但 URL 无 `root`
  时 URL 不被补 root、per-root API 零调用；失效 root 不回退首个项目且清除 `change`。
- [ ] 在 `packages/dashboard-app/src/shell/dashboardLocation.ts` 建立显式项目上下文解析，
  把 root 的规范化别名只用于验证已显式给出的选择，删除 `roots[0]` 默认值。
- [ ] 在 `packages/dashboard-app/src/App.tsx` 让 URL/用户动作成为选择的唯一写入口，移除
  `tenon-dashboard-root` 的自动恢复和 `okRoots[0]` 工作台回退；进度、自动运行、工作台在
  `none` 时统一展示或导航到项目总览，不发 per-root 请求。
- [ ] 覆盖项目被移除、浏览器前进/后退、显式选择、清除选择、非 Dashboard query 保留和单项目
  环境仍不自动选择，运行 Dashboard 聚焦测试证明红转绿。

## 阶段 5：真实安装与交付

> 子阶段边界：完成后建议 `/clear`。

- [ ] 运行聚焦测试、`npm test`、`npm run test:web`、hook/adapter/Skill/bundle/oracle 全门禁。
- [ ] 从最终候选执行 `tenon update --codex` 与 `tenon setup --codex --auto-update -y`，
  新宿主会话验证入口 Skill 与阶段 Skill，`tenon doctor` 除未配置的可选 runner 凭证外无黄红。
- [ ] 在 `127.0.0.1:18765` 先打开无 `root` URL，证明不会自动进入任何项目；再显式选择当前
  项目，复验进度来源与自动运行来源隔离。随后提交推送，等待 CI，
  应用主规格、归档 Change，发布并验证 `v1.0.1`。

## 验证

- `npm run generate:identity && npm run check:identity`
- `node --test tools/product-identity.node-test.mjs tools/check-repository-hygiene.node-test.mjs`
- `npx vitest run packages/cli/src/commands/doctor.test.ts`
- `npx vitest run packages/dashboard-app/src/shell/dashboardLocation.test.tsx packages/dashboard-app/src/App.test.tsx`
- `bash tools/test-adapters.sh && bash tools/verify-skills.sh && bash tools/test-hooks.sh`
- `npm run build && npm test && npm run test:web && npm run oracle`
- `git ls-files` 驱动的路径/文本零残留扫描
- `tenon doctor --json`、`curl http://127.0.0.1:18765/api/health` 与真实浏览器验收

## 回滚

- 代码提交可用普通 Git revert 回退；不改写历史，不删除用户文件。
- managed runtime 使用已验证的 `tenon runtime rollback` 回到 previous release。
- 宿主插件登记只通过 Codex/Claude 官方插件管理器恢复；Tenon 不直接恢复或覆盖宿主 cache。
- Dashboard 提交失败时沿用现有原子补偿，恢复 selection、launcher 与上一健康进程。
- Dashboard 项目上下文变更可用普通 Git revert 回退；不得通过恢复首项目 fallback 作为运行时兜底。
