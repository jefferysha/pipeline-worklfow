# 技术设计

## 背景

PR #34 的 server 先以 `O_DIRECTORY | O_NOFOLLOW` 打开 Change 目录并校验 dev/ino，再优先通过 Linux `/proc/self/fd/<n>` 读取 Skill invocation ledger。通用 `readBoundedRegularFile` 正确拒绝 symlink parent，但也因此拒绝这个由已持有目录句柄产生的可信 alias。CI run `31170809291` 在 6,246 个通过测试后仅此项失败；本地三份定向测试当前为 23/23 通过。

用户结果：恢复 Linux 读取兼容性，同时不扩大普通路径读取能力、不改变 API DTO 或持久化格式。`search-first` 不适用：问题完全位于仓库现有 Node 文件系统边界，无外部库或替代依赖需要评估；按委托约束也不派生研究 agent。

## 不变量与读取状态

1. 普通入口始终对 parent 执行 `lstat`，任意 symlink/path alias 继续失败关闭。
2. anchored 入口只有在调用者提供的 dev/ino 与 alias 解析后的目录身份相等时继续；server 的身份必须来自同一时刻仍持有的已打开 Change 目录 `fstat`。
3. leaf 始终以 `O_NOFOLLOW` 打开且必须是普通文件；读前、读中、读后核对父目录身份/realpath 与 leaf dev/ino/size/mtime/ctime。
4. 身份错误、alias 重定向、realpath 变化、leaf 替换、超限、无效 UTF-8 均不得返回证据；optional 语义只把真实 `ENOENT` 映射为空。
5. repository 的读前/读后 ledger identity fence 保持不变，server 返回前仍复核 Change/root/version anchor。

## 决策

选择“显式 anchored-directory capability”方案：kernel 增加只携带 `{ dev, ino }` 的窄身份类型与专用读取入口；Skill invocation repository 仅在显式 option 存在时调用该入口；server 仅在 `traversableDirectoryFdPath` 成功且已验证打开目录身份时传入 option。通用 API 的默认分支完全不变。

数据流：

`open Change dir (no-follow) → fstat 与 Change anchor 匹配 → 获得可遍历 fd alias → repository anchored option → parent/. dev/ino + realpath fence → leaf no-follow read → 全链再次核对`

能力参数不能自行证明“句柄仍被持有”，因此所有生产调用方必须在 `try/finally closeSync(fd)` 生命周期内使用；当前唯一生产调用方是 server route。该限制写入类型注释、集成边界和回归测试，不新增依赖或 native `openat` 封装。

## Assumptions / Decision Log

- 假设：支持 Node 22 的 Linux 暴露可遍历 `/proc/self/fd`；若不可遍历，现有 helper 返回 `undefined` 并走已锚定真实路径，能力 option 不启用。
- 决策：使用 full preset，因为跨 kernel/server、tracked bundles 与安全/public API 边界。
- 决策：不改变 ledger codec、HTTP 状态码、DTO、写入路径或其他 document reader。
- 决策：先采用现有未提交实现，仅在定向/全量验证或审查发现真实缺陷时做最小修正。

## 备选方案

1. **总是退回真实 Change path**：代码更少，但会失去已打开目录 FD 对 rename/swap 的锚定价值，拒绝。
2. **放宽通用 parent symlink 检查**：能让 Linux 测试通过，但任意 alias 都会进入读取面，违反既有安全契约，拒绝。
3. **引入 native `openat`/addon**：语义最直接，但增加平台构建、分发和维护面，超出单点 CI 修复，暂不采用。

## 风险

- dev/ino 从非句柄来源伪造：通过生产调用点约束、默认入口拒绝和 option wiring 测试控制。
- alias 在读取期间重定向：父目录身份与 realpath 在读前/读中/读后复核，测试强制重定向并期望失败。
- leaf symlink/替换：`O_NOFOLLOW` 加 handle/path 双身份栅栏。
- 生成 bundle 漂移：`npm run build`、bundle freshness/smoke 与 `git diff --check` 联合验证。

## Grill 自检

- **谁拥有身份？** server 的已打开 Change 目录句柄；kernel 只消费最小能力，不推断信任。
- **证据是什么？** `fstat` 与 `ChangePathAnchor.chain` 末端 dev/ino 相等，并在 fd 关闭前完成读取。
- **假设为假会怎样？** 任何身份、realpath 或 leaf 变化抛错，route 映射为 path forbidden/corrupt，不返回成功证据。
- **契约写在哪里？** 本设计、ADR、`skill-invocation-evidence` delta spec、专用类型注释与三层测试。

```coverage
touches:
L1_api:      waived -> HTTP 路径、DTO、状态码不变；仅 kernel 内部集成 option
L2_data:     waived -> 无 ledger codec、DTO 或持久化格式变化
L3_rules:    filled -> #不变量与读取状态
L4_state:    filled -> #不变量与读取状态
L5_errors:   filled -> #不变量与读取状态
L6_security: filled -> #不变量与读取状态
L7_perf:     waived -> 保持既有有界读取与大小上限
L8_deps:     waived -> 无新增依赖或 native addon
L10_terms:   filled -> #不变量与读取状态
```
