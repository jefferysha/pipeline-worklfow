# 任务

## Open

- [x] 定义正式文档站、GitHub Pages、仓库 README 首页和插件中文治理文档的目标、范围、非目标、初始假设与验收信号。

## Explore

- [x] 调研 Trellis 文档站结构和成熟开源文档产品的通用模式。
- [x] 盘点 Pipeline Lite 现有内容、产品事实、构建边界、文档生成链和 GitHub Pages 限制。
- [x] 确定信息架构、视觉方向、框架、搜索、国际化、内容真相源、中文生成策略和部署方案。
- [x] 产出经评审的设计文档、方案比较和 ADR。

## Spec

- [x] 定义导航、搜索、国际化、内容深度、响应式、无障碍、README 集成、中文治理文档生成和 GitHub Pages 部署的需求与场景。
- [x] 产出文件级实施与验证计划。
- [x] 根据首轮 Verify 反馈将 locale 改为回滚兼容 sidecar，并补充原子脚手架、显式 capability、内容深度、安全扫描与 main-only 部署规范。
- [x] 根据第三轮 Verify 反馈明确 OpenSpec 机器标题例外、Verify/Ship/Archive 单一应用边界、init/overwrite 事务安全、精确 artifact 闭集、完整中文可访问层、Registry 单一投影和真实 N-1 回滚门禁。

## Build

- [x] 用失败测试和原型纵向打通 Registry 中文 proposal、default init 与 VitePress `/pipeline-worklfow/` 双语最小站点。
- [x] 完成 Registry schema、`zh-CN`/`en` catalog、纯 renderer、Change locale 固定和 default/simple/custom/history 兼容。
- [x] 统一 `pipeline init`、`pipeline scaffold`、`pipeline document scaffold` 和所有 phase Skills 的文档呈现入口。
- [x] 将新建 Loop 受管镜像和 phase handoff 人读摘要纳入中文默认与显式英文兼容策略。
- [x] 建立中文规范内容、英文完整镜像、公开 manifest、确定性同步器、local search、`llms.txt` 与 Pipeline Lite 主题。
- [x] 将根 README 改为中文并提供英文镜像，说明 Dashboard locale 边界。
- [x] 增加 GitHub Pages workflow、文档/模板/语言/base/artifact 检查，并确保发行包携带全部模板。
- [x] 完成 clean install、setup/update、不改历史和子路径站点的 Build 集成候选。
- [x] 修复 locale 在 transition 中丢失、旧 canonical schema 回滚不兼容、英文模板混入中文占位符和旧 Change 语言误判。
- [x] 修复 document scaffold 父路径 symlink 逃逸、非原子发布、delta capability 猜测和裸 locale 参数静默降级。
- [x] 扩充全部中文规范页，补内容类型/锚点/中英文事实检查、敏感信息扫描、移动表格、深色对比度和 VitePress 中文 UI。
- [x] 限制 Pages 仅从 main 部署，并让 Registry YAML 通过确定性生成器成为运行时呈现真相源。
- [x] 让 Registry/schema/catalog/codegen/renderer 真正同源，并补 custom label 与显式英文回归。
- [x] 统一 document scaffold、locale pin 与 `scaffold spec --spec-dir` 的可信根、symlink、containment 和原子写安全。
- [x] 将 Pages artifact audit 改为严格闭集 allowlist，并增加重复同步 digest 与 workflow 结构门禁。
- [x] 实现 breadcrumb、首页 main landmark、中文 VitePress 可访问标签和跨语言 fragment 安全映射。
- [x] 保持历史 Loop 受管段字节，增强历史 locale 推断并修正 phase Skill 的显式英文契约。
- [x] 对第二轮阻断项执行 TDD 定向测试、全量构建、分发检查和 OpenSpec strict/apply 演练。
- [x] 让 `pipeline init` 在 Change 根预置 symlink 时零外部写入，并以竞争/替换测试覆盖可信项目根原语。
- [x] 修复 proposal Registry/模板/Skill 的 OpenSpec 机器标题兼容，统一 Verify 隔离演练、Ship 幂等应用和 Archive `--skip-specs` 生命周期。
- [x] 将 Pages artifact 从扩展名目录放行改为当前构建精确清单，并增加合法扩展未知资产注入反例。
- [x] 补齐中文导航、侧栏、分页、搜索控件与键盘提示的可访问名称，增加分组 breadcrumb，并修正首页 main landmark 范围。
- [x] 将 `scaffold spec --strategy overwrite` 改为完整暂存、验证和可恢复提交，覆盖故障与 TOCTOU 后的全有或全无语义。
- [x] 删除 phase Skills 的无条件中文覆盖和 CLI 呈现硬编码投影，并用真实 N-1 bundle 验证新 Change 回滚可读。
- [x] 修复同仓多会话下 repo 级 `.pipeline-active` 覆盖精确 host-session 绑定导致“继续执行”串到旧 Change 的路由缺陷。
- [x] 对第三轮阻断项执行 TDD 定向测试、官方 OpenSpec show/strict/隔离 archive、全量构建、发行包检查和真实浏览器预验收。
- [x] 关闭 default OpenSpec fallback 在 Change 根被并发替换为 symlink 时的仓库外写入窗口，并增加可重复的竞争回归测试。
- [x] 将 overwrite scaffold 升级为带持久事务描述与崩溃恢复的目录发布协议，覆盖孤儿 lock/stage/backup 的恢复和并发拒绝。
- [x] 让 Registry 生成默认 workflow 阶段标签投影并由 renderer 唯一消费，删除运行时硬编码副本。
- [x] 统一 Ship 的 `applied-spec.md` 收据路径、幂等主规格应用与 Archive `--skip-specs` 读取链。
- [x] 将 N-1 严格读取器纳入可离线重复执行的发行门禁，并保留真实上一发行版可用时的交叉验证。
- [x] 对第四轮阻断项完成红绿重构、全量门禁和冻结基线。
- [x] 隔离未绑定 host session 的通用“继续执行”，禁止回落到仓库级旧 Change。
- [x] 将 default OpenSpec 文档、ledger、locale、governance 与 canonical state 纳入单一 Change 初始化发布边界。
- [x] 将 overwrite scaffold 提升为顶层项目 envelope 事务，并在回滚冲突时保留确定性恢复证据。
- [x] 提供中英文运行时 404、语义化 main 与真实浏览器回归。
- [x] 对第五轮阻断项完成红绿重构、契约更新、全量门禁和重新冻结。
- [x] 在顶层 overwrite envelope 中检测复制后的并发漂移并无损回滚，禁止覆盖 sibling Change 更新。
- [x] 将 CI 的真实 N-1 门禁固定为带完整模板与运行时资产的上一发行版 payload。
- [x] 让初始化发布遇到检查后出现的 symlink 时 fail-loud，不主动删除竞争方路径。
- [x] 为早期主规格应用生成独立机器迁移审计证据，并完成第六轮阻断项全量回归。
- [x] 修复长会话 transcript 与多工具 ABI 下真实 Skill 读取无法结算、导致 phase 自锁的问题。
- [x] 将 overwrite 发布边界收窄到目标规格目录，避免移动 sibling 命名空间并覆盖 open-FD 并发更新。
- [x] 将主规格迁移接入可执行 Ship 门，并以原子 CAS 协议拒绝检查后的并发漂移。
- [x] 支持当前 Codex `Script completed` / `Script failed` 内容块 ABI，并用真实 transcript fixture 防回归。
- [x] 让 Dashboard 阶段画布初次呈现时自动把当前 phase 定位到可视区。
- [x] 将主规格迁移限制在可信仓库普通路径内，以无覆盖发布、所有者锁和可恢复原始 inode 消除 TOCTOU 与误删新锁。
- [x] 让迁移 receipt 与当前 Change、delta、主规格及机器结果强绑定，并把 Ship 迁移升级为状态机运行时硬 guard。
- [x] 让 Codex transcript 在任一失败信号、非零退出码或冲突退出码出现时失败关闭。
- [x] 将 Dashboard 当前阶段定位改为每个 workflow 独立响应，禁止一个 workflow 的 phase 变化抢走其他画布的用户滚动。
- [x] 保留 overwrite 目标目录内未受管 sibling 的并发更新，并用 target-internal open-FD 回归测试固定语义。
- [x] 为每个新 WorkflowRun 原子冻结不可变执行快照，并提供严格指纹匹配的旧 Change 恢复入口，避免插件升级后在途流程自锁。
- [x] 让 CLI、transition 与 Dashboard 统一消费冻结执行快照，并以 mkdir + hard-link no-replace 发布 Change，消除升级漂移与空目录替换竞态。
- [x] 修复第十轮 Verify 阻断：迁移 CAS 复验父目录身份、公开冻结 Workflow 计划读取入口，并补齐 Dashboard 375px 页签布局与英文可见文案。
- [x] 修复第十一轮 Verify 阻断：以目录 FD 锚定的原生无覆盖事务关闭迁移 check-to-syscall symlink 竞态，并同步冻结 Workflow 契约说明。
- [x] 修复第十二轮 Verify 阻断：独立快照并在 rename 后复核内容、按 inode 释放 owner lock、剥离用户运行时的一次性迁移依赖并删除结果 pathname writer。

## Verify

- [x] 运行首轮定向与全量测试、类型检查、构建、内容链接校验和独立审查；发现阻断问题并按 `verify-fail` 返回 Build。
- [x] 完成首轮真实浏览器桌面端、移动端、键盘、主题、语言、搜索、导航和子路径部署验收；记录 stale preview、中文搜索与深色对比度失败。
- [x] 验证新建测试 Change 时生成的治理文档默认中文，并识别显式英文模板、locale 持久化和历史兼容缺陷。
- [x] 修复后重新运行全量测试、独立审查与真实浏览器验收并取得通过结论。

## Ship

- [x] 应用已批准的 delta spec，并在不虚构未部署 Pages URL 的前提下准备真实交付。

## Archive

- [ ] 重读完整证据链并归档已完成的 Change。
