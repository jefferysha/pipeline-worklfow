# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`3bf189576542a572b71c10d2bc2118bd5f62f2c2`
> 本轮结论：失败，退回 Build 修复

## 已执行验证

- `npm run test:all`：通过；后端/集成 301 个文件、5208 个测试通过，5 个外部认证场景如实跳过；
  Dashboard 50 个文件、939 个测试通过。
- build、身份、Skill、adapter、bundle、文档、架构、仓库卫生、npx、legacy bridge 与
  golden oracle 门禁：常规入口通过。
- 真实浏览器：18765 进度页正确区分终端来源与自动运行；中文文档页 4 张 1440×900 WebP
  全部加载，GitHub Pages base 正确且无横向溢出。
- OpenSpec 1.6.0：delta show、Change strict validate、隔离副本 archive/apply 与五个受影响
  capability strict validate 全部通过；真实主规格 digest
  `ad96f88699a651f1cab09659d229e78dc9175e5b22d26db7aa506b75c536f4f6`
  前后相同。
- 786 个冻结变更文件均已逐项回读并映射到 capability spec，详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。

## 阻断问题

两路独立冻结审查一致发现 canonical CI 的 N−1 升级回放入口漂移：

- `tools/fixtures/n-minus-one-release.json` 正确声明历史入口
  `packages/cli/dist/pipeline.mjs`；
- `tools/prepare-n-minus-one-release.sh` 也按 fixture 提取并校验该旧文件；
- 但 `.github/workflows/ci.yml` 把 `TENON_N_MINUS_ONE_CLI` 硬编码为不存在的
  `$output/payload/packages/cli/dist/tenon.mjs`。

按 CI 原样重放后，`bash tools/test-bundle.sh` 得到 22 项通过、1 项失败，失败项为
“显式 N-1 bundle 存在”。因此 GitHub Actions 的 bundle smoke 在发布分支上必然失败，
属于 release-blocking 问题。

## 处理决定

- 不降低或绕过 N−1 发布回放门禁。
- 走 `verify-fail` 返回 Build。
- 让 CI 从冻结 fixture 的 `cliEntry` 动态导出旧 CLI 入口，消除再次硬编码漂移的可能；
  增加 workflow/fixture 一致性回归后重新冻结并执行完整 Verify。
