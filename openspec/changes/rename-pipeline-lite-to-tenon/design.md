# 设计

## 初始假设

- 建立单一品牌源，所有生成物从同一组 Tenon 身份常量派生，避免再次出现多名称漂移。
- CLI 可执行名最终只保留 `tenon`；旧 `pipeline` 二进制只允许作为本次受控自举过程的执行工具，
  不进入最终安装包或兼容契约。
- 插件、npm 包、运行时目录、缓存目录、环境变量和 Skill 标识应按依赖顺序迁移，安装与自动更新必须
  在全新用户和已有用户两条路径上验证。
- Dashboard 继续使用现有统一服务端口策略；品牌迁移不引入第二套前端或第二个常驻端口。
- Dashboard 必须把 progress state 与 execution provenance 分开建模；终端心跳可以让任务显示
  `running`，但不能据此推断它属于自动运行队列。
- 已归档 OpenSpec、账本、Change 运行记录和 Git 历史属于审计事实，不做破坏性全文改写。
- 新用户应通过 Marketplace bootstrap 一步安装同一个完整插件，不要求 clone、安装仓库依赖或 build。
- npx 只能是同一安装事务的薄入口；npm 发布凭据不是 Marketplace 首装的前置条件。
- 可再生截图从当前树移除并精确忽略；仍被实现引用的文本 demo 和正式文档资产保留；重新生成的
  Tenon Dashboard 正式图只进入固定 allowlist，并做压缩、隐私和 production-base 验收。

## 风险

- 仓库使用自身 CLI 驱动当前 Change，过早删除旧入口可能让本次流程在 Verify/Archive 前失去执行器。
- Skill、hook、模板、安装器和测试夹具存在字符串契约，机械替换可能造成证据生产者或路径不一致。
- npm、GitHub Pages、仓库名与更新源属于外部分发边界，迁移顺序不当会让新安装或自动更新短暂失效。
- 把终端 heartbeat 与 automation 状态折叠成同一 `running` 后再推断来源，会让不同页面产生矛盾。
- 历史证据中的旧名称与现行产品残留容易混淆，需要建立可执行的扫描排除规则。
- 粗暴忽略所有图片会误删正式站资产；只删 `design-demos/shots/` 与未引用根截图，并用 allowlist 管理例外。
- npm scope 属于外部发布者身份，未经认证不能假定 `@tenon` 所有权或宣称已发布。

## 待验证问题

- 当前身份字符串分别由哪些源码、生成器和发布配置控制，哪些只是生成物或历史证据？
- CLI、插件、Skill、安装目录和自动更新的正确依赖顺序是什么？
- GitHub 仓库、Pages 地址与 npm 发布身份是否需要同步迁移，哪些外部动作可在本 Change 内安全完成？
- 如何在不保留兼容层的前提下完成已有安装的原子升级，并保证当前自托管流水线能完成归档？
- 自动运行页、进度页和后端 snapshot 应共享哪个 execution provenance 判定函数，如何锁定终端任务不入队？
- Marketplace bootstrap 和 npx 如何复用同一 payload、inventory 校验与更新状态？
- 哪些图片/设计稿是当前依赖，哪些只是可再生验收产物，如何避免后续重新提交？
- README 与中文文档站应选择哪些稳定 Dashboard 视图，如何在不重新引入截图仓库的前提下排版？
