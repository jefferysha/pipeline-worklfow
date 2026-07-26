# 任务

## 立项

- [x] 明确 Tenon 全局迁移目标、破坏性兼容策略与审计历史边界。
- [x] 将 Dashboard 终端/自动运行来源混淆纳入同一变更范围。
- [x] 建立中文 proposal、design 与七阶段任务骨架。

## 调研

- [x] 枚举源码、生成物、分发配置、运行时目录、Dashboard、文档和外部发布面的全部现行身份引用。 (explore)
- [x] 对照现有能力规格、调用方与测试，形成旧身份到 Tenon 的完整契约映射。 (explore)
- [x] 追踪 progress state 与 execution provenance 数据流，形成终端任务误入自动运行页的最小复现。 (explore)
- [x] 分类仓库图片、文本 demo、正式文档资产与发布内容，确定无历史重写的卫生策略。 (explore)
- [x] 对比 Marketplace 与 npx，确定无需 clone 的一步安装和同一发行 payload 契约。 (explore)
- [x] 产出中文 Superpowers 设计文档与 ADR，确定无兼容层的自举、升级和发布顺序。 (explore)

## 规格

- [x] 编写 `tenon-product-identity` OpenSpec delta spec，覆盖新装、升级、运行、展示与残留扫描。 (spec)
- [x] 规定 Dashboard 统一执行来源模型与跨页面一致性场景。 (spec)
- [x] 规定 Marketplace/npx 共用安装事务、唯一整包 update、所有权边界、仓库卫生与发布包 allowlist 场景。 (spec)
- [x] 编写中文 Superpowers 实施计划并把可验证工作拆入本任务清单。 (spec)

## 实现

- [x] 建立产品身份真相源、确定性投影、v1→v2 Workflow 快照迁移读取与 freshness 检查，并完成 CLI→manifest→Dashboard→README tracer bullet。 (build)
- [x] 把 workspace、CLI/bundle、插件/Marketplace、Skill、command、hook 和环境前缀迁移为 Tenon。 (build)
- [x] 迁移 managed runtime 路径、稳定 launcher、readiness 精确补偿与绑定 host/release 的旧通道迁移桥。 (build)
- [x] 实现 Marketplace bootstrap 与可发布 npx 薄包，确保新用户无需 clone。 (build)
- [x] 建立 neutral execution provenance，让自动运行列表与计数同源过滤，并补模型/组件/live 回归测试。 (build)
- [x] 迁移 Dashboard 品牌、README、中文文档站、CI、测试和 Pages 配置。 (build)
- [x] 生成并压缩正式 Tenon Dashboard 图，为 README 与中文文档站完成响应式图文排版。 (build)
- [x] 删除可再生截图，补 `.gitignore`、发布内容清单和 repository hygiene 门禁。 (build)
- [x] 分类清理现行旧身份残留，修复 N-1 固定夹具与 release tag checkout，并重建所有受控生成物。 (build)
- [x] 修复既有仓库架构主规格的 OpenSpec 1.6 Purpose 结构，使隔离应用演练可严格重建。 (build)
- [x] 重构唯一整包 update 事务：移除第二套 self-update，补 launcher/Dashboard 精确补偿、
  项目只读同步报告、Tenon 产品状态单一所有权/路径契约与 fixture 驱动的 N-1 CI 接线。 (build)
- [x] 删除当前树中的外部参考项目调研、演示和归档产物，清理剩余路径/文本身份，并增加零例外
  仓库门禁。 (build)
- [x] 为宿主项目注册表迁移增加可恢复快照与一次性持久 receipt，区分本次真实新增数与最终保证存在数，
  让 CLI 迁移与 Dashboard 增删共用 kernel 的唯一锁内事务，强校验计数不变量；保证并发零丢失、
  部分失败可重试且用户清理后的项目不会在后续 setup 中复活；同时修复 server 参数输出和 AFK
  空队列契约。 (build)

## 验证

- [ ] 运行契约、单元、集成、安装升级、hook、适配器、文档与残留扫描测试。 (verify)
- [ ] 在真实浏览器验收 Tenon Dashboard、中文文档页面以及终端/自动运行来源一致性。 (verify)
- [ ] 在 GitHub Markdown 与 Pages production base 下验收正式 Dashboard 图片的桌面/移动版式。 (verify)
- [ ] 核验最终分发物不存在旧命令、旧包、旧插件或旧现行品牌入口。 (verify)
- [ ] 在隔离 HOME 验证 Marketplace 一步首装、npx tarball 首装及发布包内容。 (verify)
- [ ] 验证当前树无受禁图片、无悬空图片链接且 Git 历史未被改写。 (verify)
- [ ] 验证旧安装迁移、失败注入、previous rollback、单 Skill root 与唯一 18765 listener。 (verify)
- [ ] 验证受 Git 管理的路径和文本不存在外部参考项目身份，且门禁对路径/内容注入均 fail-closed。 (verify)

## 交付

- [ ] 完成交付审查、版本与发布说明，提交并推送 Tenon 变更。 (ship)
- [ ] 在授权范围内完成 GitHub/Pages 等发布面迁移并验证公开入口。 (ship)

## 归档

- [ ] 归档 Change，并确认主规格、证据链和最终仓库状态一致。 (archive)
