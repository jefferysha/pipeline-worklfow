# Comet `--platform` 宿主目标调研

> 日期：2026-07-28
> 基线：`0.4.0-beta.9` / `84038b0d6b7c185b233f0f36b294ae74dd9121d0`
> 研究点：`master` / `2945693e4061c369be0d400ed2999a66fa87c680` / PR #227
> 许可：MIT
> 证据形式：只保留固定 URL、SHA 和独立事实摘要，不收录上游源码、测试或文案

## 结论

Comet PR #227 为 `init` 和 `update` 增加显式单目标 `--platform`，并让两个命令使用同一目标解析概念。
已注册平台沿用现有 registry；未注册 ID 只在 project scope 被接受，global scope 明确拒绝。

Tenon 本轮只借鉴“显式目标”和“共享目标边界”两个抽象原则。P1 仍只接受已有
`TENON_HOSTS`，不实现 custom target，不复制 Comet 的 resolver、字段、测试、错误文案或文件结构。

## 固定一手证据

- 研究提交：
  [`2945693e4061c369be0d400ed2999a66fa87c680`](https://github.com/rpamis/comet/commit/2945693e4061c369be0d400ed2999a66fa87c680)
- PR：
  [`rpamis/comet#227`](https://github.com/rpamis/comet/pull/227)
- beta.9 基线：
  [`84038b0d6b7c185b233f0f36b294ae74dd9121d0`](https://github.com/rpamis/comet/commit/84038b0d6b7c185b233f0f36b294ae74dd9121d0)
- 固定比较：
  [`0.4.0-beta.9...2945693`](https://github.com/rpamis/comet/compare/0.4.0-beta.9...2945693e4061c369be0d400ed2999a66fa87c680)
- 目标解析文件：
  [`platform/install/platform-targets.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platform-targets.ts)
- 注册表与 ID 校验：
  [`platform/install/platforms.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/platform/install/platforms.ts)
- CLI 装配：
  [`app/cli/index.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/cli/index.ts)
- init/update 调用方：
  [`init.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/init.ts)、
  [`update.ts@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/app/commands/update.ts)
- 固定提交许可证：
  [`LICENSE@2945693`](https://github.com/rpamis/comet/blob/2945693e4061c369be0d400ed2999a66fa87c680/LICENSE)
- 发布状态：
  [`tags`](https://github.com/rpamis/comet/tags)、
  [`releases`](https://github.com/rpamis/comet/releases)

## 可确认事实

### 显式目标

- `init` 与 `update` 都新增单值 `--platform`。
- 指定该 option 时，本次调用只解析该目标；省略时保留原有检测或选择路径。
- update 在进入执行规划前拒绝与全项目更新语义冲突的参数组合。

### 注册目标与 custom target

- 已注册 ID 返回 registry 中的原目标，并保留 native 身份。
- 未注册 ID 会先经过格式校验。
- 未注册 ID 只允许 project scope；global scope 拒绝。
- project custom target 使用上游定义的保守默认描述符，而不是任意路径输入。

### 发布状态

- 固定提交的 package 元数据已前移到 beta.10。
- 调研时远端 tag 与 GitHub Release 仍停在 beta.9。
- 因此 beta.10 只能描述为未打 tag 的源码状态，不能写成已发布稳定版本。

### 相对 beta.9 的范围

从产品功能口径看，固定比较区间唯一新增的实质能力是 `init/update --platform`；其余提交是网站或图片更新。
该能力自身同时涉及目标校验、命令装配、调用方、测试、文档和版本元数据，因此不能把“唯一功能”误写成
“只有一个文件变化”。

## beta.9 与研究点差异矩阵

| 维度 | beta.9 | `2945693` / 未发布 beta.10 | 对 Tenon 的含义 |
| --- | --- | --- | --- |
| init 目标来源 | 检测或交互选择 | 可显式指定一个平台；省略时保留旧路径 | P1 应保留现有 setup 行为，只新增独立计划入口 |
| update 目标来源 | 检测已安装目标 | 可显式指定一个平台 | 计划必须绑定恰好一个宿主和操作 |
| 已注册目标 | registry | 仍复用同一 registry | Tenon 复用 `TENON_HOSTS`，不建第二套目录 |
| 未注册目标 | 无显式入口 | project scope 可合成 custom target | Tenon P1 不采用，避免扩大信任边界 |
| global custom | 无 | 明确拒绝 | 支持 custom 不是显式目标的必要条件 |
| 发布状态 | beta.9 已发布 | package 为 beta.10，但未打 tag | PR 必须区分源码研究点与正式发布 |

## 选择理由

1. **采用显式目标思想**：宿主计划由一个已注册 host 与一个 operation 唯一决定，比自动猜测更容易验证。
2. **复用 Tenon registry**：`TENON_HOSTS` 已是 setup/update 白名单；复制另一个列表会产生漂移。
3. **拒绝 custom target**：Tenon 当前没有共享 custom registry、scope 或能力验证契约，P1 开放会把任意
   ID/路径带入本地 API。
4. **计划与执行分离**：Comet 的目标 resolver 仍进入各自执行流程；Tenon 本轮只生成
   `side_effects: "none"` 的 DTO，不把计划预览变成写入口。

## 风险与许可边界

- Comet 固定提交为 MIT，但本 Change 不需要复制其具体表达；研究文档只转述可核对事实并链接一手来源。
- 未打 tag 的 beta.10 可能继续变化，不能作为 Tenon 的兼容依赖。
- Comet 对 custom target 的默认能力是其产品选择，不等于宿主真实能力探测。
- Tenon 的实现、测试、DTO、错误文案与文件结构均从现有 Tenon 代码、批准规格和独立设计推导。

## 对 P1 的最终映射

- 只允许 12 个已注册 `TENON_HOSTS`。
- catalog 与单目标 plan 使用版本化 DTO。
- server 在 runner 前拒绝未知、重复、缺失或多余参数。
- Dashboard 只显示目标、能力、命令和步骤，并只提供复制操作。
- custom target、任意 `.foo`、路径输入和真实 setup/update 执行全部留在范围外。
