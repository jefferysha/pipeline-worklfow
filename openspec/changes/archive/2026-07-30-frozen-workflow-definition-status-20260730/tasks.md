# 任务

## 立项

- [x] 初始化独立 Change、固定目标与非目标。
- [x] 建立 proposal、design、tasks 的真实 Open 文档证据。

## 调研

- [x] 审计当前 frozen plan、snapshot、todo、document、review/session 与 Dashboard 调用链。
- [x] 固定 Trellis、Comet、Chorus、Maestro Flow、claude-tap 一手证据。
- [x] 完成 Chorus graph/编排实体、边、生命周期、API、Dashboard 交互和 Tenon 分阶段映射。

## 规格

- [x] 定义 graph v1 节点/边/覆盖契约、严格错误语义和只读安全边界。
- [x] 定义 Dashboard 图、过滤/搜索/选择/详情、语义替代列表、双语与键盘行为。
- [x] 更新 proposal/design/spec/ADR/实施计划与验证矩阵并重新登记。

## 实现

- [x] 用 TDD 实现 Server 图投影、workflow definition 节点诊断和独立 GET 路由。
- [x] 用 TDD 实现 Dashboard strict client、确定性图、过滤/搜索/选择/详情与可访问列表。
- [x] 补齐中英文 loading/error/retry/真实空/过滤空/旧 Server/部分覆盖状态。

## 验证

- [x] 运行受影响 server/web 定向测试、typecheck:web、test:web、build:web/build、npm test。
- [x] 在真实 production Dashboard 完成 1024/1440/1920 成功/失败/空态、中英文和键盘验收。
- [x] 完成 Verify 多轨审查、修复发现并冻结通过基线。

## 第一轮 Verify 返工

- [x] 将全新 `frozen-workflow-definition-status` delta 修正为 `ADDED Requirements`，同步 proposal/design/ADR/plan。
- [x] 用 RED 测试约束目标 Change 零写入直读、稳定 error code、唯一 transition edge 与空 label fallback。
- [x] 用 RED 测试约束有向/相邻边详情、闭集双语以及可辨 focus/selection/filter 状态。
- [x] 拒绝 Change/canonical/legacy state symlink 逃逸，并闭合 coverage/metadata/status 与有界错误。
- [x] 重跑全量生成物、静态、测试、OpenSpec 隔离应用与真实 production Dashboard 验收。

## 交付

- [x] 应用 spec、提交、push，并创建包含固定来源、验证、风险与回滚的非草稿 PR。
- [x] 检查远端 PR URL、merge state 和 CI；修复可复现失败。

## 归档

- [x] 通过 Tenon CLI 完成 applied spec、Ship 与 Archive，并确认 archived canonical state。
