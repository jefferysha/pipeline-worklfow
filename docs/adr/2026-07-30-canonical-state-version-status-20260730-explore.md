# ADR：由 kernel 分类未来 canonical 版本并投影结构化升级要求

日期：2026-07-30
状态：Accepted

## 背景

当前 canonical decoder 把未来 `schemaVersion` 与 JSON、字段、摘要损坏统一抛为 `RunStateCorruptError`。server 再将异常和绝对 source path 拼接为自由文本。Dashboard 因而无法安全、稳定地区分“升级 runtime”与“恢复状态”，且零个可读 Change 时会进入教学空态。

## 决策

由 kernel 在确认根值为对象后，优先识别“安全整数且高于当前支持版本”的 `schemaVersion`，抛出带 `foundVersion` 与 `supportedVersion` 的 typed error，并立即拒绝继续读取。

server 只捕获该 typed error，在项目 snapshot 增加 optional `compatibilityIssues`。DTO 仅含稳定 reason/action、Change 名和两个版本号。Dashboard 严格解码，在 Progress 入口展示中英文升级要求，并复用现有 refresh。未来状态不迁移、不降级、不写入。

## 备选方案

1. 继续复用自由文本：拒绝，因为字符串不稳定、不可安全 i18n 且包含路径。
2. server 解析 JSON：拒绝，因为复制 kernel 的信任边界和版本规则。
3. 把未来状态伪造成 `ChangeSnapshot`：拒绝，因为当前 runtime 无法证明其 phase、workflow 或操作权限。
4. 自动运行更新命令：拒绝，因为扩大外部 mutation 权限且无法保证当前 session 安全切换。

## 后果

- 正向：用户得到正确恢复路径；未知版本继续失败关闭；新字段支持滚动升级；路径不进入新 DTO。
- 代价：Project 可以同时 `ok=false`、含可读 Changes 和 compatibility issues，消费方必须按结构化 issue 展示，而非假设所有 `ok=false` 都完全不可达。
- 风险控制：只有明确的未来安全整数得到升级提示；其余异常保持 corruption；测试覆盖 mixed project、decoder fail-closed 与 Onboarding 遮蔽。
