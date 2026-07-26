# `fix-tenon-entry-skill-contract` 验证报告

## 结论

`FAIL`。冻结工作区基线
`workspace:sha256:a1f106492ec68e50f2e2e09598bfc63ef095b4b56b1f7e1eecd757d54295a66a`
不得进入 Ship。实现需要经 `verify-fail` 返回 Build，修复安装/更新事务、宿主库存失败语义、
生成边界和 OpenSpec 主规格结构后重新冻结。

## 验证范围

- 产品身份真相源、生成投影、Codex Agent 入口和插件 Skill 入口；
- `setup --codex`、自动更新、doctor 与宿主插件库存收敛；
- npx/Marketplace 打包、CLI 发行 bundle 和版本矩阵；
- 仓库卫生与外部参考项目身份零残留；
- OpenSpec delta 严格校验和隔离 archive/apply 演练；
- 冻结工作区的独立 Reviewer 与 E2E 审查。

## 已通过验证

- `node tools/check-product-identity.mjs`：通过。
- 产品身份 Node 测试：5/5 通过。
- `doctor.test.ts`、`setup.test.ts`、`update.test.ts`：101/101 通过。
- `bash tools/test-adapters.sh`：270/270 通过。
- 仓库卫生测试：5/5 通过，当前工作区外部参考项目名称扫描无命中。
- npx/bootstrap：4/4 通过；临时 `npm pack` 中版本、固定 tag、入口 Skill 均为 `1.0.1`、
  `v1.0.1`、`tenon`。
- `openspec validate fix-tenon-entry-skill-contract --strict`：通过。
- OpenSpec CLI：`1.6.0`。

## 发布阻断项

### 1. 公开 CLI bundle 泄漏退役身份

`npm run check:identity` 返回 1：

```text
current product contains retired identity residues:
packages/cli/dist/tenon.mjs:31532: retired identity slug
```

迁移常量被打入公开 CLI bundle，违反当前产品和发行资产只暴露 Tenon 的身份门禁。

### 2. setup 删除旧登记的时序可能锁死用户

`packages/cli/src/commands/setupHost.ts` 在 Tenon 候选、managed runtime 和新会话入口完成验证前，
先调用官方宿主管理器删除旧登记；后续验证、安装或发布失败时，用户可能失去可用入口。删除后仍复用
删除前库存快照。必须采用“激活候选 → 验证 launcher/新会话 → 最终清理”的单一迁移事务。

### 3. update 未收敛宿主插件冲突

`packages/cli/src/commands/update.ts` 的 native update 没有检查或移除冲突宿主插件，和
OpenSpec 中 setup/update 均须收敛为单一 Tenon 入口的要求不一致。自动更新后旧 hook 仍可能劫持
正常对话。

### 4. doctor 把库存不可用误当成可跳过

宿主库存命令不可用或返回畸形 JSON 时，当前实现把结果折叠成 `null` 或空集合，doctor 随后跳过
唯一宿主身份检查并可能整体报绿。库存不可用、畸形和合法空库存必须是三个不同状态；前两者必须
fail closed。

### 5. 生成和安装边界校验不足

- 产品身份检查对 `AGENTS.md` 使用包含关系，未证明哨兵块唯一且逐字等于生成模板；
- Codex adapter 只检测起始 marker，缺失结束 marker 时可能删除 marker 后全部用户内容；
- `entrySkill` 缺少安全 slug、路径根边界和唯一 first-party Skill 校验。

这些问题需要通过结构化解析和行为测试修复，不能添加字符串兜底。

### 6. OpenSpec 主规格结构无效

真实主规格 `openspec/specs/normal-chat-routing/spec.md` 缺少 OpenSpec 1.6 必需的
`## Purpose`。因此：

- `openspec validate normal-chat-routing --strict` 返回 1；
- 隔离副本中的 `openspec archive fix-tenon-entry-skill-contract --yes --json` 返回
  `archive_spec_validation_failed`；
- Change delta 本身严格校验通过，但不能在 Ship 可靠应用。

真实主规格演练前后摘要保持
`cac4fc5b6de55aa9c3927d330a43d8285fa8e81d9822dead3c8cc3810b00e496`，Verify 未写入
真实 `openspec/specs/`。

## 独立验证轨

### Reviewer Agent

`FAIL`。发现上述 setup 时序、update 冲突收敛、doctor fail-closed、bundle 身份泄漏及三个生成边界
问题；没有修改工作区。

### E2E Agent

`FAIL`。确定性复现 `npm run check:identity` 的发行阻断。其余身份链路、101 项定向测试、
270 项 adapter 测试、仓库卫生和 npx tarball 验证通过。临时失败注入证明当前 setup 在官方
plugin remove 返回失败时不会发布 runtime，但该断言尚未进入持久测试套件。

### Codex Skill 证据

本阶段已由真实 Codex 插件会话完整加载 `tenon:tenon-verify` 与
`tenon:verification-before-completion`；报告只记录实际运行结果，不把未运行项写成通过。

## 逐文件规范回读

本轮按 `git status --short` 回读全部冻结改动，并按责任归入：

- `tenon-product-identity`：身份 JSON、生成器、生成投影、CLI 入口、版本和身份门禁；
- `plugin-distribution`：setup/update/doctor、宿主库存、adapter、npx 与插件 manifest；
- `normal-chat-routing`：Codex Agent managed block 和正常对话唯一入口。

对照结果不是通过：上述六类阻断分别违反这些 capability 的单一身份、失败关闭、原子迁移和
可归档规范要求。

## 必须返工

1. 让迁移识别不进入公开 bundle，同时保留受控旧安装识别能力。
2. 把 setup/update 统一到可回滚的宿主迁移事务，并新增 remove、验证、发布各阶段失败注入。
3. 让 doctor 对库存不可用和畸形响应明确报红。
4. 对 Agent 哨兵块、adapter marker 和 `entrySkill` 实施唯一性、成对性、slug 与路径边界校验。
5. 规范化 `normal-chat-routing` 的 `## Purpose`，严格校验后重跑隔离 archive/apply。
6. 重新 build、冻结、三轨验证和真实浏览器验收。

## 剩余风险

- 本轮没有发布、推送或修改真实宿主安装；
- 尚未执行最终 18765 Dashboard 与 GitHub Pages 的发布后浏览器验收；
- npm 公网发布能力取决于仓库发布凭证，未获得真实发布结果前不得宣称可公网 npx 安装。
