# 任务

## 立项

- [x] 确认拆分策略、互动模式、AFK 兼容与授权边界。

## 调研

- [x] 调研 Workflow codec、冻结 plan、fingerprint 和 API 边界。 (explore)

## 规格

- [x] 冻结 decomposition/interaction schema、权限交集、缺省与兼容语义。 (spec)
- [x] 按 requirements-changed 纳入 Dashboard 配置闭环。 (spec)
- [x] 按 ownership change 将 stable receipt bridge 修复移交 PR2 基线并移除 PR3 重复范围。 (spec)
- [x] 按归档演练修正 delta operation 分类：新 `workflow-definition` capability 与新增 receipt requirement 使用 `ADDED`。 (spec)

## 实现

- [x] 以 tracer bullet 打通 Workflow codec、V3 frozen snapshot 与真实 API。 (build)
- [x] 实现完整 decomposition/interaction 校验和五层 action 权限求交。 (build)
- [x] 将 continuous/queue 早检与 AFK pre-claim authoritative admission 接线。 (build)
- [x] 通过安全 definition API 实现 Dashboard 策略编辑、状态展示、zh/en 与 loading/empty/error 闭环。 (build)
- [x] 按 Verify 返工结论将 missing-authorization 固化为不可被普通 review 绕过的 hard block。 (build)
- [x] 为公共 createAutomation 默认 admission 补齐显式 authority/binding 端口，保持缺省失败关闭与 bundle preparation 硬门。 (build)
- [x] 将 Workflow authority provider 异常升级为可观测的 state I/O 失败，并以零扣费终态关闭 reservation，避免普通拒绝路径伪报 round 成功。 (build)

## 验证

- [ ] 验证旧 Workflow/V1/V2、非法配置、V3 篡改与 frozen/live drift。 (verify)
- [ ] 验证权限降级、recommended-default、hard boundary 与 AFK 不扩权。 (verify)
- [ ] 用真实桌面浏览器验证 Dashboard 读写、非法输入、键盘路径、zh/en 与状态恢复。 (verify)
- [ ] 用 PR2 基线提供的正式 stable launcher/runtime 验证当前任务/turn/phase receipt，禁止以分支 CLI workaround 作为完成证据。 (verify)

## 交付

- [ ] 更新契约与生成默认定义，创建 base=PR2 branch 的独立 PR。 (ship)

## 归档

- [ ] 归档 Change 并记录策略兼容结论。 (archive)
