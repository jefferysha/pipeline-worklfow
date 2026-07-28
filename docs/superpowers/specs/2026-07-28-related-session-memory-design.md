# Related Session Memory 技术设计

## 目标

让用户在任意 Change 的 Dashboard 任务详情中，按关键词找回同一已注册项目内的
Claude、Codex、OpenCode 与 Pi 历史会话。该能力只提供受限的历史讨论线索，不改变 Change、
OpenSpec、review、当前 session binding 或宿主会话文件。

## 固定来源与差异映射

读取日期：2026-07-28。

| 来源 | 固定版本 | 与本设计的关系 |
| --- | --- | --- |
| [mindfold-ai/Trellis](https://github.com/mindfold-ai/Trellis/tree/12e279a8af00456b1d0d4e3d0f7f59e7b702202e) | `main` 与语义 tag `v0.6.9` 均为 `12e279a8af00456b1d0d4e3d0f7f59e7b702202e`；latest Release API 返回 404，因此回退 tag | `trellis mem` 证明“显式、只读、cwd 受限、上下文有预算”的原始会话检索与可提交 journal 是两层能力；Tenon 不写回搜索结果。 |
| [rpamis/comet](https://github.com/rpamis/comet/tree/2945693e4061c369be0d400ed2999a66fa87c680) | `master` `2945693e4061c369be0d400ed2999a66fa87c680`；latest Release `0.4.0-beta.9` 为 `84038b0d6b7c185b233f0f36b294ae74dd9121d0` | release 后的 `--platform` 证明宿主目标应显式且非目标宿主零副作用；Comet 的 `run_id`、`sessionHash` 和 current selection 不是宿主会话索引，不能借用。 |
| Tenon `origin/main` | `2d103e330f847e003ff5909097d892f5722cca04` | 已有四宿主 mem 内核与“一条最近会话” session-link；缺少 HTTP 资源预算和多结果 Dashboard 入口。 |

完整一手证据见：

- `docs/superpowers/specs/2026-07-28-related-session-memory-trellis-research.md`
- `docs/superpowers/specs/2026-07-28-related-session-memory-comet-research.md`
- `docs/superpowers/specs/2026-07-28-related-session-memory-tenon-audit.md`

## 关键业务规则

1. 查询必须由用户显式提交；打开详情、切换 Change 或切换平台不得自动扫描。
2. 搜索范围固定为机器注册表中的当前项目 root；V1 不提供 global 或任意 cwd/file path。
3. 平台只能是 `all|claude|codex|opencode|pi`；未知值失败关闭，不按目录名猜宿主。
4. 命中只是历史讨论线索，不是 canonical state、已批准需求、review receipt 或当前执行会话。
5. V1 只返回命中的 user excerpt；assistant 原文、thinking、工具调用和完整对话不进入 DTO。
6. 响应不包含宿主文件路径或 cwd；不写索引、不缓存到 Change、不写浏览器持久存储。
7. 达到候选、单文件或总读取预算时返回 `partial=true` 与稳定 warning；不得把截断结果描述成完整。
8. 同一 server 同时只执行一个 related-memory scan；第二个请求得到稳定 busy 错误，避免同步读取叠加。

## 方案比较

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 扩展现有 GET session-link 为多结果 | 改动少 | 查询词进入 URL；混淆“最近可恢复会话”和“关键词相关历史”；无扫描预算 | 拒绝 |
| 受保护 POST + 有界 kernel 用例 + 独立区块 | query 不进 URL；复用 Host/token/content-type/body guard；边界可测试；保留旧契约 | 需新增 bounded read 原语与 DTO | 采用 |
| 后台索引/缓存全部会话 | 查询快 | 新增持久化、失效、隐私和迁移边界，超出最小切片 | 拒绝 |

## 共享与后端契约

### Kernel 有界读取

在 `MemFs` 增加可选的 bounded text read 能力，生产 `nodeMemFs` 使用真实字节上限读取。
新增 related search 用例，用预算包装现有四宿主 adapter，并复用项目过滤、多 token AND 与相关度排序。

首版默认预算：

| 维度 | 上限 |
| --- | --- |
| 查询 | 2–128 字符，最多 8 个 token |
| 最近候选 | 100 个 session |
| 结果 | 8 个 session |
| 单文件读取 | 2 MiB |
| 单请求总读取 | 16 MiB |
| 每结果摘要 | 1 条 user excerpt，最多 320 字符 |

旧 `tenon mem search` 保持现有语义；新预算只用于 Dashboard related-search 用例。

### HTTP

`POST /api/mem/related-sessions/search`

请求：

```json
{
  "root": "/registered/project",
  "name": "change-name",
  "query": "related session memory",
  "platform": "all"
}
```

响应：

```json
{
  "protocol": "tenon-related-session-memory/v1",
  "query": "related session memory",
  "platform": "all",
  "partial": false,
  "warnings": [],
  "matches": [
    {
      "platform": "codex",
      "session_id": "opaque-session-id",
      "title": "optional bounded title",
      "updated_at": "2026-07-28T00:00:00Z",
      "score": 1.5,
      "hit_count": 2,
      "excerpt": "bounded user excerpt",
      "descendants_merged": 0
    }
  ]
}
```

端点沿用 POST 的 loopback Host、token、`application/json` 和 64 KiB body guard，并额外验证：

- `root` 是已注册且物理锚仍有效；
- `name` 是安全 id 且 canonical/legacy Change 存在；
- `query` 与 `platform` 满足闭集；
- I/O 错误不回显 host home、file path 或原始异常。

稳定错误：`400 invalid-request`、`404 project-or-change-not-found`、`429 memory-search-busy`、
`500 memory-search-unavailable`。预算截断不是错误，返回 200 partial。

## Dashboard 交互

新增独立 `RelatedSessionsSection`，在 TaskDetail 对所有 Change 挂载，不修改只为
running/failed automation 展示的 `TaskConnectionCard`。

状态机：

```text
idle --submit--> loading --success/nonempty--> results
  ^                 |  \--success/empty-----> empty
  |                 \-----typed/network-----> error
  +------------------------new submit/retry---+
```

- 输入默认建议为 Change 名的可读形式，但不会自动发送。
- 原生 `<form>` 保证 Enter 提交；提交时禁用重复请求，并忽略被后续查询取代的旧响应。
- 平台过滤器保留 `all` 与四个受支持宿主。
- loading 用 `role=status`；错误用 `role=alert`；empty 与 partial warning 有独立文案。
- 结果显示宿主、标题或短 session id、时间、相关性和 user excerpt；不展示 source path。
- 切换 Change/root 时回到 idle 并清除旧结果。

## 状态机与失败语义

- related search 是只读应用状态，不进入 Tenon workflow transition。
- 前端只维护本组件的 `idle|loading|results|empty|error`；不写 localStorage。
- adapter 不可用或预算达到上限进入 200 partial/warnings，仍展示可证明结果。
- root/change 漂移、非法输入和并发占用是 typed error，不回退到 session-link，不自动改平台。
- 网络失败可重试；重试仍需用户提交。

## 安全、性能与依赖

- 不新增第三方依赖；Node 22、React 18、现有 npm workspace 不变。
- 有界读取必须发生在文件读取层；`Promise.race` 不能中断同步整文件读取，不算预算实现。
- response title/excerpt 二次截断并移除空白噪声；内部 `filePath` 永不序列化。
- POST 虽逻辑只读，仍需要 token，因为 query 与结果属于本机私密会话内容且扫描成本不应被任意网页触发。
- 现有 `/api/mem/session-link(s)` 契约保持不变。

## 术语

- **related session**：同一注册项目中，用户提交关键词命中的宿主持久会话。
- **current session binding**：`tenon session activate` 绑定的当前执行会话；与 related session 不同。
- **partial result**：资源预算内可证明的命中集合，不代表扫描了全部历史。
- **platform**：真实 adapter 支持的宿主枚举，不是安装目录或 workflow run 类型。

## Decision Log

1. 采用受保护 POST，而非携带 query 的 GET。
2. V1 只显示 user excerpt，assistant 原文留待未来独立隐私决策。
3. V1 返回多结果但不生成恢复命令；现有 session-link 继续独占已验证的 resume 命令语义。
4. OpenCode parent/child 默认合并，并显示 `descendants_merged`。
5. worktree 只按实际查询 root 及其后代匹配，不隐式扫描 sibling worktree。
6. 与 PR #5 的重叠仅限 TaskDetail 单行挂载与 i18n；本功能使用独立组件和既有 semantic token。

```coverage
touches:
L1_api:      filled -> #共享与后端契约
L2_data:     filled -> #共享与后端契约
L3_rules:    filled -> #关键业务规则
L4_state:    filled -> #状态机与失败语义
L5_errors:   filled -> #状态机与失败语义
L6_security: filled -> #安全、性能与依赖
L7_perf:     filled -> #安全、性能与依赖
L8_deps:     filled -> #安全、性能与依赖
L10_terms:   filled -> #术语
```
