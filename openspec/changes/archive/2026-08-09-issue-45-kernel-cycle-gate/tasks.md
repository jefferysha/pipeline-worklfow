# 任务

## 立项

- [x] 核验 issue #45、父路线图 #41、验收口径、Wave 0 与无 blocker 状态。
- [x] 核验当前 worktree、分支、冻结 SHA、最新 `origin/main` 与唯一 Change/session 绑定。
- [x] 记录 refactor / architecture debt 的目标、范围、非目标、初始风险与待验证问题。

## 调研

- [x] 建立当前 kernel 生产 value/type-only import 图与 SCC 基线，定位全部 value cycle 边。
- [x] 检查相关实现、调用方、测试、架构 checker、根脚本与 CI 接入，完成影响面/所有权/兼容和并发风险拆解。
- [x] 比较最小拆环方案并以 ADR 或等价持久文档确定依赖方向。

## 规格

- [x] 定义 runtime/type-only import 语义、确定性解析规则、seeded-cycle 失败契约与零 SCC 验收。
- [x] 将批准设计拆成 worker 可执行的 Build 任务与风险匹配的验证计划。

## 实现

- [x] Tracer bullet：用 TypeScript AST graph helper、fixture node tests 与根 `check:architecture` 建立 canonical cycle gate。
- [x] 把 document producer anchor/parser 下沉为纯叶子，并以 recording application service 保持公共 `recordDocument`。
- [x] 把 TaskPlan 原子 state publish 与 native Skill lifecycle 分离，并保持公共 `publishTaskPlanRevision` 及时序。
- [x] 提取 workflow document contract 叶子，保留 validator/public facade 并使真实 kernel runtime SCC=0。
- [x] 运行 Build 定向测试/type build，重建受控 CLI/server bundle，并登记真实结果与残余风险。

## 验证

- [x] 对冻结 build SHA 执行最多两轮 code review 预算内的完整 review 与 issue 验收。
- [x] 运行定向测试、架构 gate、构建、集成测试、生成物/发行 freshness 与必要的最终门。

## 交付

- [x] 同步受控文档/spec/生成物，提交并推送唯一分支，创建含 `Closes #45` 的非草稿 PR。

## 归档

- [x] 完成 applied spec、Change 归档与最终证据审计，推送归档状态并等待 exact-head CI；不合并 PR、不发布版本。
