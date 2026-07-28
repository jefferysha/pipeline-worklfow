# 设计

## 初始假设

- 认证引导应属于安装结果的一部分，而不是把 `OPENAI_API_KEY` 当作唯一就绪信号。
- 若 `codex login status` 可用，应优先使用其退出状态判断；环境变量或文件存在性只能作为受限降级，
  不能读取秘密内容。
- 交互式安装应给用户清晰的选择与下一步；非交互安装应输出简短、可操作的后续提示但不得等待输入。
- 所有命令、链接、订阅能力与 API Key 行为都需在 Explore 对照当前 Codex 官方手册和仓库调用链验证。

## 风险

- 误把 ChatGPT 订阅登录与 API Key 计费混为一谈，导致错误购买或错误配置。
- 探测命令意外触发登录、阻塞无头安装，或把认证输出写入日志。
- 安装器、setup/update、doctor 和中英文文档出现互相矛盾的提示。
- 只覆盖首次安装而遗漏重复安装、更新、CI 和无 Codex CLI 的场景。

## Explore 结论

- 采用 CLI 内单一的三态认证契约：`authenticated`、`unauthenticated`、`unavailable`。
  只执行有超时的 `codex login status`；退出 `0` 为已认证，退出 `1` 只有在有界 stderr 精确等于
  官方 `Not logged in` 哨兵时才是未认证，其他 `1` 与其他非零均保守为不可确认。哨兵只在进程内
  比较后立即丢弃，不进入状态、日志或人读输出。
- `install.sh` 继续只负责 Marketplace bootstrap。Codex CLI 缺失时在任何 mutation 前失败并给前置引导；
  插件解析成功后由包内 `tenon setup --codex --yes` 复用统一认证检查。
- 首次安装和重复安装走 setup；成功的前台 `tenon update --codex` 与 `tenon doctor` 也消费同一探测和
  固定文案。自动后台更新、dry-run、Claude 和非 Codex adapter 不启动认证探测或交互登录。
- 未登录或无法确认时同时提供四个官方动作：`codex login`、`codex login --device-auth`、
  `printenv OPENAI_API_KEY | codex login --with-api-key` 和 `codex login status`；API Key 创建入口固定为
  `https://platform.openai.com/api-keys`。
- ChatGPT 路径只表述为“如果你的方案包含 Codex”，不得推断具体套餐；Platform API Key 明确为按用量计费。
- `OPENAI_API_KEY`、`CODEX_HOME` 和 `auth.json` 存在性仅保留为 AFK 容器凭证转发信号，不再充当本地
  Codex 登录事实。新探测不得打开 `auth.json` 或读取 API Key。
- 当前 `codex-cli 0.144.1` 实测：ChatGPT 登录时 status exit `0`；隔离空 `CODEX_HOME` 时输出
  `Not logged in` 并 exit `1`；损坏 `auth.json` 时输出 `Error checking login status: ...`
  也 exit `1`，所以退出码 `1` 本身不再足以证明未登录。
  实现只依赖官方未登录英文哨兵的有界精确匹配；任何本地化、附加警告或未来文案变化都保守归为
  `unavailable`，不得猜测未登录。
- clean-install 继续使用隔离且无凭证的 HOME；认证缺失只产生确定性引导，不影响插件/Skill/hook/runtime
  身份验收，也不改变 `/hooks` 人工信任边界。

详细决策和覆盖矩阵见：

- `docs/superpowers/specs/2026-07-28-codex-auth-official-contract-research.md`
- `docs/superpowers/specs/2026-07-28-codex-auth-install-guidance-design.md`
- `docs/adr/2026-07-28-guide-codex-auth-during-plugin-install-explore.md`
