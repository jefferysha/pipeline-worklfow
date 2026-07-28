# 设计

## Explore 结论

- CLI 是 `TENON_HOSTS`、native/adapter 与 setup/update plan 的现有 owner；新增纯只读 `tenon host-target-plan --json` 是最窄稳定边界。
- server 复用现有 `PipelineCliRunner` argv adapter，只接受显式白名单宿主与 `setup|update`，严格验证 `host-target-plan/v1`，不调用任何写路径。
- Dashboard 通过独立 API client/decoder 消费 catalog 与单计划；hostPlan 功能域拥有目标卡和请求状态，外壳只装配 view。
- Comet `2945693e...` 的显式目标思想可借鉴，但 P1 不采用 project custom target。
- Trellis v0.6.9 的角色化最小上下文可映射为 catalog→单计划；未发布 `5f543960` 的实现受 AGPL-3.0 约束，只作 clean-room 研究。

## 风险

- 计划预览与真实 setup/update 参数漂移，导致展示误导。
- 查询参数校验不严，扩大本地 HTTP 输入面。
- UI 把“预览”误呈现为已执行，造成用户心智混淆。
- 三层 DTO decoder 漂移，导致旧消费者静默误读。
- 未发布或强 copyleft 上游实现污染本仓实现。

## 已决问题

- Catalog 与单计划共享 `host-target-plan/v1`，但使用不同顶层 DTO。
- API 不接收 root/target；adapter 命令用 `<project>` 占位。
- 只展示 CLI 可证明的 native/adapter、scope 与有限能力，不复制完整 adapter tier。
- Adapter setup 计划包含部署后的 `bundled-skills`/`runtime-readiness`，update 计划在 `adapter-deploy` 后结束；该差异由真实命令集成测试锁定，三端 fixture 不得把错误语义互相复制成“契约”。
- Native setup 在 host plan 后包含 managed runtime/skills/readiness；native update 只追加 managed runtime，不声明真实 `cmdUpdate` 不会调用的 setup-only skills/readiness。
- Host Plan API 只接受 trim 后恰好一个完整 JSON 文档；不得复用从混合 stdout 末行挑选 JSON 的宽松 parser。
- UI 只提供复制命令，没有执行按钮。
- 详细契约、状态机、错误、安全与验证矩阵见 `docs/superpowers/specs/host-target-plan-dashboard-design.md`；架构取舍见 `docs/adr/host-target-plan-dashboard.md`。
