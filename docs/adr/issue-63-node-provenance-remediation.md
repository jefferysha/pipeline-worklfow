# 架构决策记录

## 背景

#44 的 frozen candidate 只把 trusted Node pathname 传给 provenance Bash verifier。拥有 Bash spawn 的 adapter 会重验 Bash，但不会重验随后由脚本使用的 Node；`setupSkills` 还直接回退 `process.execPath`，Doctor 只重新解析 PATH。#63 要求在不重置 #44 Review 2/2 的前提下关闭这一唯一阻断。

## 决策

- 在 CLI native command adapter 定义 Bash+Node 复合 provenance binding，caller 在每次 verifier spawn 前同步重验两份 `TrustedExecutable`，随后立即 spawn。
- native setup/update 从首个 mutation 前冻结到流程结束都复用同一 lifecycle binding；release store 在 runner wrapper 识别 provenance Bash 时复验两份 proof；Doctor 使用物理 binding 而非 pathname。
- 将 Doctor production probes 从过长的 `main.ts` 提取为独立 adapter，保持 kernel/automation/registry/public CLI 不变。
- `inspectCandidatePayload()` 的既有 proof 顺序是参考实现，所有新路径以 `bash-proof → node-proof → spawn` 和 drift 时零 child 为验收事实。

## 备选方案

- 仅在流程开始验证一次：拒绝，保留 TOCTOU。
- 在 Bash 里复制物理身份算法：拒绝，形成第二套且 Windows/POSIX 语义漂移。
- 全部改成 direct Node verifier：拒绝，会绕过 Bash 完整资产检查。
- 各 caller 独立手写 proof：拒绝，容易再次遗漏或与 spawn 分离。

## 后果

- production provenance spawn 缺 Bash 或 Node physical binding 时失败关闭；pathname-only legacy test seam 不会被升级为可信声明。
- Node drift 将更早暴露，并可能把过去的假成功变成非零，这是预期的安全收紧；公开 registry、error category、CLI 参数和 release manifest 不变。
- 需要更新 command/runtime 定向测试、Doctor adapter 测试和 tracked CLI bundle；无需新依赖或数据迁移。
- #44 的其他四项 finding 与 Review 预算均不受本决策影响。
