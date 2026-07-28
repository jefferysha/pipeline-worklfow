# Codex 插件安装认证引导调用链调研

日期：2026-07-28

范围：`install.sh`、CLI `setup` / `update` / `doctor`、Codex adapter、clean-install acceptance、相关中英文安装文档与测试。
边界：只读调研；本文不修改实现、OpenSpec Change 或既有契约。

## 结论

Tenon 已经具备一段“凭证存在性”检查，但它属于 **AFK runtime readiness**，不是 Codex 宿主登录检查：

- `OPENAI_API_KEY` 只判断宿主环境或 Tenon secrets 中是否存在非空字符串；
- 默认 `~/.codex/auth.json` 会检查可读性，但显式 `CODEX_HOME` 只要非空就直接判为已配，没有检查其中的 `auth.json`；
- 缺失时只给出 `codex login` 和 API Key 两条粗粒度提示；
- 没有执行 `codex login status`，因此无法识别“文件存在但登录已失效”；
- 没有明确提示 ChatGPT 订阅账号、远程/无浏览器的 `--device-auth`、API Key 的 `--with-api-key`；
- 首次/重复安装最终会经过这段提示，但它出现在 managed runtime、Dashboard、skills 已处理之后，且被描述成 AFK 凭证；
- `tenon update --codex` 不调用这段 readiness，Codex adapter 也不做登录检查；
- 顶层安装脚本没有 Codex CLI 预检，CLI 不存在时由第一条宿主命令以通用 `command not found` 失败。

推荐新增一个共享的、只读的 **Codex host auth probe + guidance renderer** 作为单一事实源，使用 `codex login status` 的退出码判断登录状态，绝不解析或回显凭证内容。它与现有 AFK 凭证 readiness 保持两个不同概念：前者回答“当前宿主 Codex 是否已登录”，后者回答“AFK runner 是否有可传入容器的凭证来源”。

## 当前安装调用图

```text
curl .../install.sh | bash -s -- --codex
  |
  +-- install.sh 参数/--ref 校验
  |     `--dry-run` 到此只打印计划，不调用宿主
  |
  +-- codex plugin marketplace add ...
  +-- codex plugin add tenon@tenon --json
  +-- codex plugin list --json -> ROOT
  |
  +-- node ROOT/packages/cli/dist/tenon.mjs setup --codex --yes
        |
        +-- cmdSetupHost
        |     +-- 再读宿主 inventory，完整既有安装则复用
        |     +-- 否则执行 nativeInstallPlan
        |     +-- 校验 payload -> 发布 managed runtime -> Dashboard
        |     +-- 输出 /hooks trust 引导
        |
        +-- cmdSetupSkills
        |
        +-- cmdSetupRuntime
              +-- probeAfkReadiness
              |     +-- OPENAI_API_KEY: host env > Tenon secrets
              |     +-- CODEX_HOME/default ~/.codex/auth.json
              +-- 缺失时输出 codex login / API Key 粗粒度提示

tenon update --codex
  +-- marketplace upgrade -> plugin add -> inventory
  +-- payload 校验 -> managed runtime/Dashboard 原子切换
  +-- /hooks trust 引导
  `-- 当前不进入 cmdSetupRuntime，也不输出认证引导

tenon doctor
  `-- probeAfkReadiness -> afk:credential-codex 黄/绿灯
        （当前是 AFK 口径，不是宿主 login status）
```

## 文件与行号证据

### 顶层 bootstrap 与 CLI 缺失

- `install.sh:54-72`：`--dry-run` 只打印 Marketplace、plugin、packaged setup 计划，不调用宿主。
- `install.sh:75-84`：通过 `codex plugin list --json` 解析已安装根。
- `install.sh:111-122`：首次安装直接调用 `codex plugin marketplace add` / `plugin add` / `plugin list`，此前没有 `command -v codex` 或 `codex --version` 预检。
- `install.sh:136-147`：解析 bundle 后执行 `setup --codex --yes`；安装结束只补 hook trust 与新会话提示。
- `packages/cli/src/commands/setupEnvironment.ts:136-146`：已有通用 `commandExists` 能力，但目前只用于 npm skill 的幂等判断，没有用于 native host preflight。
- `packages/cli/src/commands/setupEnvironment.ts:174-185`：缺少 CLI 或命令非零会被折算为通用 `{code, stdout, stderr}`，因此 direct `tenon setup --codex` 只能在 inventory/host command 处间接失败。
- `packages/cli/src/commands/plugin-host.ts:194-206`：Codex native install plan 只有 marketplace add、plugin add、plugin list，没有 CLI/auth preflight。

### 首次与重复 setup

- `packages/cli/src/commands/setup.ts:44-70`：顺序为 `cmdSetupHost` 成功后再执行 skills 和 `cmdSetupRuntime`；认证提示因此位于安装事务末端。
- `packages/cli/src/commands/setupHost.ts:102-136`：重复 setup 会先读取 inventory，已安装 payload 完整时复用同一宿主登记。
- `packages/cli/src/commands/setupHost.ts:139-228`：首次 setup 执行 native plan；duplicate marketplace/already-installed 只在 inventory 证明后按幂等成功处理。
- `packages/cli/src/commands/setupHost.ts:279-337`：候选校验并发布 managed runtime，最后输出 Codex hook trust；此处没有宿主登录检查。
- `packages/cli/src/commands/setupEnvironment.ts:225-233`：setup 计划只把凭证列入“运行时检查”，没有区分宿主登录与 AFK 凭证。

### 当前凭证探测与提示

- `packages/cli/src/afkReadiness.ts:71-81`：`OPENAI_API_KEY` 只判断 host env / secrets 的非空性，绝不返回值。
- `packages/cli/src/afkReadiness.ts:93-102`：显式 `CODEX_HOME` 非空即判就绪；只有默认 home 分支检查 `auth.json` 可读。这会把“存在一个空 CODEX_HOME 路径”误判为凭证已配。
- `packages/cli/src/afkReadiness.ts:105-141`：整个结构明确是 AFK readiness，并与 Docker/image 一起返回。
- `packages/cli/src/commands/setupRuntime.ts:25-35`：真实 setup 使用 `~/.codex` 和只读文件可读性探针，不读取凭证内容。
- `packages/cli/src/commands/setupRuntime.ts:58-86`：输出只包含 set/source 与获取提示，不回显值。
- `packages/cli/src/commands/setupRuntime.ts:89-118`：Codex 缺失提示发生在 AFK 清单中；任一 API Key/Codex home 就绪后不再引导。
- `packages/kernel/src/types.ts:115-129`：当前唯一提示常量 `PREREQ_HINTS.openaiKey` 只有 `codex login` 和 platform API Key 两条路。
- `packages/cli/src/commands/doctor.ts:190-205`、`235-257`：doctor 同样把 Codex 认证呈现为 `afk:credential-codex`，缺失为 yellow，不阻断交互式安装。
- `packages/cli/src/main.ts:341-352`：doctor 装配复用同一 AFK 探针，输入为当前进程 env、Tenon secrets 和默认 home。

### update、adapter 与真实 runner

- `packages/cli/src/commands/update.ts:45-57`：update 的 native plan 只刷新 Marketplace、重装、读 inventory。
- `packages/cli/src/commands/update.ts:255-270`：成功后只输出 runtime 切换、新会话和 hook trust；不调用 auth/readiness。
- `packages/cli/src/commands/update.test.ts:311-335`：成功路径断言的真实命令序列没有 `codex login status`。
- `adapters/codex/install.sh:26-46`：adapter 只选择模式、target、`CODEX_HOME` 并处理确认。
- `adapters/codex/install.sh:236-256`：adapter 只写/合并 hook 配置并输出 trust 指引。
- `adapters/codex/install.sh:282-297`：三种 adapter 主流程都没有 Codex CLI/auth 检测。该 adapter 是项目级兼容面，不适合作为新的认证事实源。
- `tools/sandcastle/tenon-afk-run.sh:472-486`：真正 AFK Codex runner 会明确检查 CLI，并要求非空 API Key 或可读 `CODEX_HOME/auth.json`；这比 setup readiness 对显式 `CODEX_HOME` 的检查更严格。
- `packages/cli/src/commands/afk-executor.ts:224-241`：AFK 执行器只在默认 `~/.codex/auth.json` 可读时自动补 `CODEX_HOME`，且不读取凭证内容。

### clean-install、文档与现有测试

- `tools/clean-codex-install-acceptance.mjs:483-529`：local/public 两条安装路径都执行真实 Codex plugin/bootstrap；public 模式下载精确 ref 的 `install.sh`。
- `tools/clean-codex-install-acceptance.mjs:531-584`：验收检查 launcher、doctor、managed runtime、Dashboard 产品身份。
- `tools/clean-codex-install-acceptance.mjs:604-671`、`714-720`：外部状态快照包含 `auth.json`，但对敏感文件只记录元数据，绝不读取内容。
- `tools/clean-codex-install-acceptance.mjs:833-879`：验收使用独立空 `HOME`、空 `CODEX_HOME`、`CI=1`，并执行两次相同安装；这是“缺登录、非交互、重复安装”最合适的真实验收入口。
- `tools/install-bootstrap.node-test.mjs:13-45`：dry-run 当前断言不调用 Codex 且不写 HOME。
- `tools/install-bootstrap.node-test.mjs:64-107`：bootstrap 单测只验证 Marketplace 命令和 packaged setup 参数，没有 CLI 缺失或认证引导断言。
- `packages/cli/src/commands/setup.test.ts:922-968`：已有缺凭证、无秘密回显、默认 `auth.json`、`codex login` 和 API Key 提示测试；缺少 `login status`、订阅/device/API-key 三分支和显式空 `CODEX_HOME` 测试。
- `packages/cli/src/commands/doctor.test.ts:483-553`：已有 doctor 缺凭证 yellow、无秘密值和默认 home 就绪测试。
- `docs/usage/installation.md:8-13`、`docs/usage/zh-CN/installation.md:9-21`：前置条件没有 Codex CLI 获取方式，也没有认证步骤。
- `docs/usage/installation.md:19-63`、`docs/usage/zh-CN/installation.md:27-61`：一步安装和真实验收写得完整，但未描述 ChatGPT 订阅/API Key/device auth。
- `docs/usage/installation.md:196-199`：英文文档把 credential yellow 仅描述为 AFK 可选项；中文安装文档的常见失败段也没有 Codex 登录引导。
- `README.md:55-100`：README 安装入口只要求“明确选择的宿主 CLI”，没有 CLI 获取或登录恢复步骤。

## 当前 Codex CLI 实测事实

本机固定版本 `codex-cli 0.144.1` 的只读帮助与隔离空 `CODEX_HOME` 探测结果：

- `codex login status` 存在；空登录态退出码为 `1`，stderr 为 `Not logged in`。
- `codex login` 是 ChatGPT 浏览器登录入口。
- `codex login --device-auth` 可用于远程/无浏览器场景。
- `codex login --with-api-key` 从 stdin 读取 API Key。

实现不应解析成功输出文案来判断“订阅还是 API Key”，因为输出不是仓库控制的稳定 JSON 契约。可靠边界是：以退出码判断 logged-in / missing / probe-error；缺失时把三种安全选项全部呈现给用户。

## 推荐单一事实源

建议在 CLI 源码新增一个最窄的共享模块（示意名）：

```text
CodexHostAuthProbe
  input:
    commandExists("codex")
    run(["login", "status"], timeout, stdio=ignore/capture)
    isTTY / CI / updateMode（只影响呈现，不影响探测事实）
  output:
    cli: available | missing
    login: authenticated | missing | unknown
    reason: exit-code / timeout / spawn-error（不得包含未经清洗的宿主输出）

CodexAuthGuidance
  missing CLI:
    安装官方 Codex CLI -> npm install -g @openai/codex
    验证 -> codex --version
  login missing:
    ChatGPT 订阅/账号 -> codex login
    远程或无浏览器 -> codex login --device-auth
    API Key -> platform.openai.com/api-keys
               codex login --with-api-key（从 stdin 读取，不拼到 argv）
    验证 -> codex login status
```

模块只输出状态和固定指导，不读取 `auth.json`、不打印 host stdout/stderr、不自动登录、不把 Key 放到 argv、日志或文档。`PREREQ_HINTS` 可演进为结构化 `CODEX_AUTH_GUIDANCE`，让 setup、update、doctor 和文档检查共用稳定命令文本；AFK `PREREQ_HINTS` 可以引用其短版，避免另造字面串。

### 为什么不直接复用 AFK readiness

两者的真值边界不同：

| 问题 | 宿主登录检查 | AFK runner readiness |
| --- | --- | --- |
| 目标 | 用户安装后能运行 Codex | 容器能获得 runner 凭证 |
| 权威探针 | `codex login status` | 环境/secrets/可挂载 auth 目录 |
| API Key 来源 | Codex 自己的登录状态或用户后续输入 | Tenon secrets / host env |
| `CODEX_HOME` | 交给 Codex CLI 解释 | 必须有可读 `auth.json` 才能挂载 |
| 缺失影响 | 安装成功但 Codex 尚不可用，明确 WARN | 只影响 AFK Codex runner |

把二者合并会继续造成“空 `CODEX_HOME` 被当成登录成功”或“Tenon secrets 已配就声称宿主 Codex 已登录”的误导。

## 明确接入点

### 1. `install.sh`：缺少 Codex CLI 的前置失败

- 正常 `--codex` 安装在任何 mutation 前执行 `command -v codex`；缺失时输出官方 CLI 安装、`codex --version` 验证命令并退出非零。
- `--dry-run` 保持零宿主调用，只在计划中列出“将检查 Codex CLI/登录状态”，不能因缺 CLI 让 dry-run 失败。
- 不在 shell bootstrap 中实现完整 auth 逻辑；插件 root 尚未解析，重复一份提示会漂移。完整提示由 packaged CLI 单一事实源完成。

### 2. 首次安装与重复 `tenon setup --codex`

- `cmdSetupHost` 前做 CLI availability preflight，避免 WAL/host inventory 之后才得到模糊 ENOENT。
- 宿主插件和 managed runtime 成功后、最终 “installed” 成功文案前调用共享 `codex login status` 探针。
- 登录缺失只 WARN，不回滚插件/runtime：公开 Marketplace 安装和交互式登录是两个独立动作。
- 首次与重复安装调用同一探针；重复安装不得写 auth，不得自动触发浏览器，只重复给出可复制的下一步和 `codex login status` 复验。
- 已登录只输出一行 `[就绪] Codex 已登录`，不要推断/展示账号、邮箱、订阅层级或 token 类型。

### 3. `tenon update --codex`

- 手动 update 成功后调用共享探针；缺失时输出完整三路引导，因为用户此刻在交互终端。
- `--auto` 后台更新只记录一条稳定、无秘密的 WARN 与复验命令，不能启动浏览器/device flow，也不能把 auth 缺失变成 update 失败。
- update 失败时不运行登录引导，避免掩盖真正的 Marketplace/runtime 事务错误。

### 4. `tenon doctor`

- 新增独立检查（示意 `host:codex-auth`），与 `afk:credential-codex` 并列而非替换。
- CLI 缺失：若 active runtime host 是 Codex，应为明确 red；否则可为 yellow/not-applicable，需产品契约决定。
- login missing：yellow，给完整三路引导；probe timeout/异常：yellow 或 red 取决于 active host，但不能把 stderr 原样带入 JSON。
- 保留现有 AFK 灯，修正显式 `CODEX_HOME` 必须验证 `auth.json` 可读，避免两个检查互相矛盾。

### 5. 项目级 Codex adapter

- 不在 `adapters/codex/install.sh` 内复制认证探针；它是兼容/受管项目投递面，不是发布安装事实源。
- adapter 完成文案可固定提示运行 `tenon doctor` / `codex login status`，但不自行解析状态。

### 6. clean-install acceptance

- 保持隔离 `CODEX_HOME` 为空，验证安装在无登录态、`CI=1`、stdin 非交互时仍成功。
- 捕获首次和第二次安装输出，断言都包含三路登录引导和复验命令。
- 继续用敏感路径元数据快照证明 `auth.json` 没有被创建、读取内容、覆盖或复制。
- 增加已登录 fixture 应通过 fake Codex wrapper/unit test 完成；真实 clean-install 不应复制开发机登录态。

## 非 TTY、CI、幂等与秘密风险

| 场景 | 必须行为 | 禁止行为 |
| --- | --- | --- |
| `curl | bash` | 只读 `login status`，缺失后打印命令 | 直接运行 `codex login`；stdin 正被脚本管道占用 |
| 非 TTY / `CI=1` | 安装继续成功，输出确定性指导 | 打开浏览器、等待交互、把缺登录当插件失败 |
| 远程 SSH | 明确推荐 `codex login --device-auth` | 假定能打开本地浏览器 |
| API Key | 引导 `--with-api-key` 从 stdin 读取 | 把 Key 拼进 argv、echo、日志或测试 fixture |
| ChatGPT 订阅 | 明确 `codex login` 无需 API Key | 继续只要求 `OPENAI_API_KEY` |
| 重复安装 | 同一探针、同一稳定结果、零 auth 写入 | 重复创建/覆盖 `auth.json` 或每次启动登录 |
| stale/corrupt auth | 以 `login status` 非零判 missing/unknown | 只因 `auth.json` 存在就判成功 |
| auto update | 最多一条无秘密 WARN | 后台弹登录 UI 或让 update 回滚 |
| probe stderr | 丢弃或映射为受控 reason | 原样输出可能含宿主路径或未来敏感信息 |

## 候选方案

### A. 只扩写当前 `PREREQ_HINTS`

优点：改动小。

缺点：仍以 env/文件存在性冒充宿主登录，update 不覆盖，空/stale `CODEX_HOME` 误判继续存在。
结论：不足以满足需求。

### B. `install.sh`、setup、update、doctor 各自实现

优点：每个入口可快速显示提示。

缺点：四份命令、翻译、退出码与安全处理会漂移；adapter/clean-install 更难保持一致。
结论：不推荐。

### C. 共享 host-auth 探针与结构化引导，入口只编排

优点：`login status` 是宿主权威；文案和命令单一事实源；可单测 timeout/ENOENT/non-TTY；不改变插件安装事务和 AFK 凭证契约。

代价：需要给 setup/update/doctor 注入可测试的 command runner，并明确新 doctor check schema。
结论：推荐。

## 建议测试清单

1. `install-bootstrap.node-test.mjs`
   - 正常安装前 Codex CLI 缺失：给安装与 `codex --version` 指引，host mutation 零调用。
   - `--dry-run` 即使 CLI 缺失仍 exit 0、零调用、零写。
   - packaged setup 仍只调用一次并承接完整 auth guidance。
2. 共享 auth probe 单测
   - CLI missing / status exit 0 / exit 1 / timeout / signal / malformed或超长 stderr。
   - 只依赖退出码，不解析成功文案，不泄露捕获输出。
   - `CODEX_HOME` 通过 env 自然传给宿主，但不读取 `auth.json`。
3. setup 单测
   - 首次与重复安装、登录成功/缺失都不改变安装返回码。
   - 缺失文案包含订阅、device auth、API Key、`--with-api-key`、`login status`。
   - non-TTY/`CI=1` 从不调用 `codex login`。
4. update 单测
   - 手动成功后完整提示；`--auto` 只给短 WARN；失败路径不输出 auth 提示。
   - auth 缺失不回滚已验证 runtime。
5. doctor 单测
   - `host:codex-auth` 与 `afk:credential-codex` 独立；
   - 缺 host login 但 AFK secret 已配、host login 已配但 AFK 不可挂载的交叉状态；
   - JSON 中无 stdout/stderr、路径、账号或 token。
6. AFK readiness 回归
   - 显式 `CODEX_HOME` 无 `auth.json` 必须为未就绪；
   - 文件不可读、空目录、默认 home、API Key env/secrets 优先级。
7. clean-install local/public
   - 空 auth、`CI=1`、非 TTY 两次安装均成功并出现确定性引导；
   - hook 仍为 untrusted；
   - 外部/隔离 `auth.json` 内容不读不写，真实用户状态不变。
8. 文档/分发
   - README、中英文 installation、troubleshooting/update 指令逐字一致；
   - bundle freshness 证明共享常量进入 `dist/tenon.mjs`；
   - shell 输出不得包含 Key 示例值或鼓励把 Key 放入命令行参数。

## 开放问题

1. 新的 `host:codex-auth` 在 active host 为 Codex 且未登录时应为 yellow 还是 red？建议安装/setup 为 WARN，doctor 对“宿主可运行性”显示 yellow；AFK 仍由自身硬门决定。
2. 是否要求兼容不支持 `codex login status` 的旧 Codex CLI？建议识别为 CLI 过旧/探针 unknown，并引导更新 Codex，而不是退回解析 `auth.json`。
3. 自动 update 的 WARN 应进入普通日志还是仅在下一次交互式 doctor 展示？建议后台只留一条，不触发任何交互。
4. 英文 CLI 文案是否纳入本 Change，还是仅保证英文文档？当前 setup/doctor 主输出整体为中文；如果改为 locale-aware，会扩大为 CLI i18n。
5. API Key 引导是否推荐“直接运行 `codex login --with-api-key` 后粘贴/通过安全 stdin 输入”，还是展示 Codex help 中的 `printenv` 管道示例？建议前者，避免形成会被用户复制到日志/历史中的秘密处理坏习惯。
