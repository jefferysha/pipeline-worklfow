# 文档、Skill 与证据链

Pipeline Lite 不把“生成了 Markdown”当成流程完成。可信链条必须同时证明谁生成、生成了哪一版、后续谁读取以及哪个 review 授权了出边。

## Default 文档链

| 阶段 | 新产出 |
| --- | --- |
| Open | proposal、openspec-design、tasks |
| Explore | superpower-design、ADR |
| Spec | delta-spec、superpower-plan、plan |
| Verify | verification-report |
| Ship | applied-spec |

tasks 是持续演进的 Todo 真相源；后续阶段只勾选自己的任务。

## Producer 证据

每个 kind 只允许特定 Skill 登记。例如 delta spec 由 `openspec-propose`，计划由 `writing-plans`，验证报告由验证 Skill。模板 renderer 不能伪造 producer。

## Digest 与读取收据

`pipeline document record` 记录路径和 SHA-256。文件变化后旧读取收据失效；后续 phase 必须重新执行：

```bash
pipeline document read <change> all
pipeline document status <change>
```

摘要绑定精确字节，不受中文或英文语义解释影响。

## 中文呈现边界

新 Change 默认固定 `documentLocale=zh-CN`。可以翻译可见标题、说明和任务文案；以下保持英文：

- phase/event id；
- DocumentKind、producer；
- proposal.md、spec.md 等路径；
- JSON/YAML/frontmatter/coverage key；
- `ADDED Requirements` 等 OpenSpec 操作词。

## 历史兼容

setup、repair、update 和切换全局 locale 不改写已有 Change/Archive。用户显式翻译活跃文档时会得到新 digest，后续 reads 和 review 必须重新建立。

## 检查

```bash
pipeline document status <change>
pipeline check <change>
```

两者分别解释证据状态和阶段出口 guard；一个通过不等于另一个自动推进。

## 中文 locale 的兼容设计

新 Change 默认在 `.pipeline-document-locale.json` 固定 `zh-CN`。该不可变 sidecar 与严格 canonical schema 分离：新 release 能固定文档呈现，旧 release 回滚时可以安全忽略，不会因未知字段拒绝整个 Change。

没有 sidecar 的旧 Change 会从 proposal、design、tasks 的明确 H1 推断一次语言并固定。如果已有文件中英文混杂，CLI 会 fail-loud，要求先人工消除歧义。

模板结构来自 `templates/documents/registry.v1.yaml`，中英文呈现来自 `templates/documents/locales/*.yaml`。运行时代码由生成器产生，freshness 检查防止分发资产与实现漂移。

## 幂等脚手架

```bash
pipeline document scaffold <change> <kind>
pipeline document scaffold <change> delta-spec --capability <capability>
```

脚手架只创建缺失结构，不覆盖已有普通文件，不登记 producer，也不自动勾选任务。`delta-spec` 必须显式传入真实 capability，不能用 Change 名或默认 scope 猜测。

新文件使用原子 no-replace 发布，并在真实父目录上检查项目边界。symlink、目录目标、越界路径和并发替换都必须拒绝。

## 文档所有权

Document contract 声明 workflow 需要哪些 kind、各自路径、创建阶段、消费阶段和 producer。Custom workflow 只生成自己声明的文档；短流程不会无条件补齐 default 七阶段文档。

| Kind | 典型 producer | 后续用途 |
| --- | --- | --- |
| proposal | `openspec-propose` | 固定问题与范围 |
| superpower-design | `brainstorming` | 保存取舍与体验设计 |
| adr | Explore 研究 Skill | 固定架构决策 |
| delta-spec | `openspec-propose` | 定义可测试需求 |
| superpower-plan | `writing-plans` | 拆解实现与验证 |
| verification-report | 验证 Skill | 记录独立结果 |
| applied-spec | `openspec-apply-change` | 更新主规格 |

## 证据失败如何处理

- 文件缺失：运行 scaffold，再由真实 Skill 填写；
- producer 不匹配：回到拥有该 kind 的 phase；
- digest 失效：重新 record，并让消费者重新 read；
- read receipt 缺失：在当前 phase 执行 `document read`；
- review event 不符：重新 request 精确事件；
- requirements 变化：Build 走 `requirements-changed` 返回 Spec。

还可以用：

```bash
pipeline document list <change> --json
pipeline history <change> --json
```

最终交付应能从任务、文档、Skill、读取、review 和基线一路追溯到实际验证。
