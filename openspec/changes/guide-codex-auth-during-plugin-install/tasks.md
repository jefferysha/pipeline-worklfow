# 任务

## 立项

- [x] 创建并激活独立 backend/default/full Change。
- [x] 固定订阅账号与 API Key 双路径引导的目标、安全边界和非目标。

## 调研

- [x] 对照官方 Codex 认证手册，验证 ChatGPT、API Key、device auth 与状态检查契约。
- [x] 追踪 install/setup/update/doctor/文档/clean-install 的现有调用链与文案来源。
- [x] 实测认证状态探测的兼容、无头、非交互和秘密泄露边界。

## 规格

- [x] 为 `plugin-distribution` 编写认证引导 delta spec、场景矩阵和失败语义。
- [x] 完成实现计划、覆盖映射、回滚策略与安全审查清单。
- [x] 根据 Verify 发现补充退出码 `1` 的未登录哨兵与认证存储错误区分契约。
- [x] 消除 design 对英文哨兵依赖的自相矛盾表述，不改变已批准 requirement。

## 实现

- [x] TDD 实现三态 Codex 宿主认证 probe、固定完整/延后引导和秘密丢弃边界。
- [x] 接入 Codex foreground setup 与独立 `auth:codex` doctor 检查。
- [x] 为 `install.sh` 增加缺 CLI mutation 前失败和 dry-run 零执行计划。
- [x] 接入成功的 manual/auto Codex update，失败路径保持主要错误。
- [x] 修正显式空 `CODEX_HOME` 的 AFK 误判并区分宿主登录/容器凭证术语。
- [x] 更新 README、中英文安装/故障排查、npm bootstrap 文档和命令一致性断言。
- [x] 扩展单元、集成、shell、分发与 clean-install 首次/重复安装回归。
- [x] 完成 Build 内全量自检、secret scan、分发 freshness 和候选冻结。
- [x] TDD 修复退出码 `1` 歧义：只有精确 `Not logged in` 哨兵判为未登录，其余保守为不可确认。
- [x] TDD 保证 timeout 后的子进程错误不会提前绕过进程组关闭证明。
- [x] 收敛 CLI/Server 的 `CODEX_HOME` 共享纯判定，显式错误目录不得回退默认目录。
- [x] TDD 保证 stderr 超出哨兵上限时即使退出 `0` 也保守为不可确认，并立即清空缓冲。
- [x] TDD 固定 doctor 认证异常输出，禁止 secret-like 异常进入 JSON。
- [x] TDD 在直接 `tenon setup --codex` 的 journal/host mutation 前处理 CLI 缺失并给获取引导。
- [x] TDD 拆分 setup 的只读 CLI availability 前置检查与 host/runtime 成功后的新鲜登录状态探测。
- [x] 在 timeout、signal、spawn/status error 后立即丢弃并停止追加认证状态 stderr 缓冲。
- [x] TDD 要求 PATH 中的 Codex 候选为可执行普通文件，拒绝同名目录并接受有效 symlink。
- [x] TDD 修复 Windows cwd shim 劫持：PATH-only 解析绝对 Codex 对象并绑定可信工作目录执行。
- [x] TDD 修复 POSIX 空/相对 PATH 劫持：解析并执行同一个可信绝对 Codex 对象。
- [x] TDD 移除 Windows batch `call` 二次展开并拒绝无法安全表示的 shim 路径。
- [x] TDD 为 Windows `taskkill.exe` 挂起增加 killer 跟踪、终止与有界关闭证明。
- [x] TDD 收紧裸 `codex login` 验收边界，防止 device/status 子命令造成子串假通过。
- [x] 补齐所有安装与排障入口的 ChatGPT 权益条件和 Platform 按用量计费语义。
- [x] TDD 将 setup/update 的 availability、inventory、mutation、observation 与认证探针绑定到同一个可信绝对 Codex 对象。
- [x] TDD 让一步安装脚本跳过空/相对 PATH 项，阻止当前目录同名 `codex` 劫持全部宿主调用。
- [x] 将可信宿主解析与普通工具发现分离，保留 `./node_modules/.bin` 等合法相对 PATH 幂等检测。

## 验证

- [x] 在冻结候选上完成全量测试、独立 Review、秘密扫描与真实干净安装验收。
- [x] 验证 ChatGPT 订阅、API Key、device auth、已登录、未登录、无 CLI 和非交互场景。

## 交付

- [x] 应用 delta 并登记 applied spec。
- [ ] 按用户授权完成提交、推送 `main`、远端验证与交付。

## 归档

- [ ] 完成最终文档读取、终态检查和官方 OpenSpec 归档。
