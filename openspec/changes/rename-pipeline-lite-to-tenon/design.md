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
- Git 提交对象仍是恢复和审计边界，不执行历史重写；但当前检出树中的外部参考项目调研、演示、
  OpenSpec 归档和 ledger 不享有名称豁免，必须删除相关产物或改写为 Tenon 自有中性表述。
- 新用户应通过 Marketplace bootstrap 一步安装同一个完整插件，不要求 clone、安装仓库依赖或 build。
- npx 只能是同一安装事务的薄入口；npm 发布凭据不是 Marketplace 首装的前置条件。
- 整个产品是一个宿主插件，更新只允许 `tenon update --<native-host>` 一个整包事务；不再拆出
  `--self-update` 或第二套 CLI/runtime 更新状态。
- Tenon 自有机器状态由 kernel 单一解析器映射到平台标准目录；安装器解析一次后通过版本化 root
  contract 传递给 launcher、bootstrap、CLI 和 Dashboard，任何上层模块不得复制路径算法或借用宿主目录。
- 可再生截图从当前树移除并精确忽略；仍被实现引用的文本 demo 和正式文档资产保留；重新生成的
  Tenon Dashboard 正式图只进入固定 allowlist，并做压缩、隐私和 production-base 验收。

## 风险

- 仓库使用自身 CLI 驱动当前 Change，过早删除旧入口可能让本次流程在 Verify/Archive 前失去执行器。
- Skill、hook、模板、安装器和测试夹具存在字符串契约，机械替换可能造成证据生产者或路径不一致。
- npm、GitHub Pages、仓库名与更新源属于外部分发边界，迁移顺序不当会让新安装或自动更新短暂失效。
- 把终端 heartbeat 与 automation 状态折叠成同一 `running` 后再推断来源，会让不同页面产生矛盾。
- 参考身份若依靠人工分类或扫描排除，很容易重新进入代码、文档和归档，需要零例外的仓库门禁。
- 粗暴忽略所有图片会误删正式站资产；只删 `design-demos/shots/` 与未引用根截图，并用 allowlist 管理例外。
- npm scope 属于外部发布者身份，未经认证不能假定 `@tenon` 所有权或宣称已发布。
- 宿主 cache 是 Codex/Claude 的私有状态，Tenon 若自行复制或回写会形成脆弱的跨产品事务；
  更新必须把宿主提交和 Tenon 自有 managed runtime 提交分层，而不是伪造全局回滚。

## 更新事务架构修订

更新由一个 coordinator 按固定状态机执行：

1. 宿主 Marketplace/plugin manager 完成自身原子更新并返回 authoritative inventory；
2. Tenon 从 inventory 解析候选，复制到隔离 staging，验证完整 payload 和 digest；
3. 在写 selection 前捕获两个 stable launcher 的存在性、普通文件内容与 mode；
4. 发布 content-addressed release，原子切换 bootstrap/selection 并写 launcher；
5. 切换 release-bound Dashboard；失败时终止候选 child，恢复 selection/bootstrap/launcher，
   并重新启动 previous release；
6. 只读扫描项目注册表并报告需要显式 `tenon sync` 的项目。

宿主 cache 与项目工作区均不由该 coordinator 私自复制/恢复：前者只由宿主 manager 写，后者只在用户
显式运行 `tenon sync` 时写。自动更新复用同一 coordinator，仅关闭浏览器打开和交互提示，不改变事务。

## 产品机器状态架构修订

kernel 的 `resolveProductPaths` 是产品路径的唯一解释者，负责 platform data/state/config roots
以及其下 release、selection、audit、registry、secrets、Dashboard token/pid 的确定性位置。
`.claude`、`.codex` 和 `.agents` 只属于宿主发现与插件安装协议，不承载 Tenon 产品状态。

安装器把一次解析结果序列化为版本化 `TENON_RUNTIME_ROOTS`；stable launcher、bootstrap、CLI、
server 和 Dashboard 沿同一契约工作。当前 runtime 不读取单 root 环境变量，也不支持 Dashboard
专属 Home；单 root 变量只由 root contract 派生，服务冻结 N−1 bootstrap 和 shell hook ABI。
`TENON_RUNTIME_HOME` 是唯一显式隔离覆盖，缺省时严格使用平台标准位置，不从旧品牌目录隐式回退。

## 待验证问题

- 当前身份字符串分别由哪些源码、生成器和发布配置控制，哪些只是生成物或历史证据？
- CLI、插件、Skill、安装目录和自动更新的正确依赖顺序是什么？
- GitHub 仓库、Pages 地址与 npm 发布身份是否需要同步迁移，哪些外部动作可在本 Change 内安全完成？
- 如何在不保留兼容层的前提下完成已有安装的原子升级，并保证当前自托管流水线能完成归档？
- 自动运行页、进度页和后端 snapshot 应共享哪个 execution provenance 判定函数，如何锁定终端任务不入队？
- Marketplace bootstrap 和 npx 如何复用同一 payload、inventory 校验与更新状态？
- 如何证明所有进程消费同一平台路径元组，且 N−1 兼容投影不会重新变成第二输入源？
- 哪些图片/设计稿是当前依赖，哪些只是可再生验收产物，如何避免后续重新提交？
- README 与中文文档站应选择哪些稳定 Dashboard 视图，如何在不重新引入截图仓库的前提下排版？
- 如何在不改写 Git 历史的前提下，让当前受管理树的路径与文本都不出现外部参考项目身份？
