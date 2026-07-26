# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`a3ea539201a613c3e8af411f136f693a0b98991f`
> 当前结论：通过，准入 Ship

## 验证范围与新鲜证据

- `npm run build`：通过；CLI、server、Dashboard 与文档构建产物和冻结提交逐字节一致。
- 本机完整核心套件：308/308 个测试文件、5256/5256 通过、5 个诚实跳过；独立隔离环境：
  308/308 个测试文件、5243/5243 通过、18 个无 Docker/凭据的诚实跳过。
- 独立发行定向套件：12 个文件、257/257 个测试通过，覆盖 setup、update、release store、
  stable hook、项目 registry、Marketplace、automation provenance 与 snapshot provenance。
- Dashboard：50/50 个文件、939/939 个测试通过。
- hooks：457/457；adapters：267/267；N−1 bundle：23/23。
- `check:architecture`、`check:identity`、`check:comments`、`check:repository-hygiene`、
  docs、npx package、legacy bridge 与 Skill 分发门禁均通过。
- OpenSpec Change strict validate 与隔离副本 archive/apply 演练通过；本 Change 应用后的 5 份
  capability 主规格逐份 strict validate 通过。
- `origin/main...8f6e35b` 的 1179 条实现 diff 记录均已映射并回读 capability spec；266 条已删除的
  受禁参考路径使用不可逆摘要登记，未在当前树重新引入名称。详见
  `docs/superpowers/reports/2026-07-26-rename-pipeline-lite-to-tenon-file-spec-map.md`。
- 受 Git 管理的当前树与路径中，外部参考项目身份扫描均为 0；repository hygiene 对路径和文本
  注入均 fail-closed。旧产品身份在现行产品面为 0，只有不可变历史和有期限迁移通道按规格分类。

## 浏览器与运行时验收

- 已识别 `19766` 为旧冻结实例，未将其误用为新证据；从冻结提交在隔离端口 `19767` 启动，
  Git blob、工作区 bundle 与运行实例摘要一致，验收后已关闭。
- Progress 在桌面与 375px 显示 1 个项目、目标 Change 为“终端运行中 / 05 验证”；Auto Run
  不包含该任务并显示“当前没有自动运行任务”。
- 中文 Dashboard 与 `/tenon/` 文档站在桌面和 375px 均无根页面横向溢出；四张正式图片均真实
  加载为 1440×900，移动渲染为 327×205；页面 console error/warn 为 0，14 个显式网络请求均为
  HTTP 200。
- 正式 `18765` 仍运行前一受管 release，不属于本冻结构建；Ship 激活新 release 后必须对正式实例
  重跑所有权、release、state scope 与浏览器 smoke。

## 三轨复核

- 独立代码审查：通过，无 P0/P1/P2。100 轮同进程 6000 次混合 writer、双真实 Node 进程以及
  migration+Dashboard 跨进程 probe 均零丢失；三组非法 receipt 全部 fail-closed。
- 独立 E2E：本地发行候选通过；隔离安装、升级、rollback、Marketplace 与真实 npx tarball 均通过。
  公网 GitHub 仓库、Release 与 Pages 在 Verify 时尚未创建而返回 404，这是 Ship 待执行外部动作，
  不把本地候选描述为已公开发布。
- 独立真实浏览器：通过；冻结 bundle、桌面/移动、终端/自动运行来源、Pages base 与正式图片均通过。
- 两路重压并行首轮各出现一次无关测试时序超时；相关文件隔离全绿，随后无并行争用的完整核心与
  Web 复跑全绿，分类为资源竞争 flake，不是冻结提交的稳定回归。

## 已关闭的阻断

1. Pages build job 已在上传和 deploy 前执行 repository hygiene；deploy 只依赖该已受门禁的 build。
2. legacy registry 已在首次写入前原子发布 pending snapshot，部分失败后从 snapshot 幂等恢复且不重读
   host；completed receipt 仍保证用户后续删除不复活。
3. 无 Docker 集成测试已按生产 fail-loud 契约断言 exit 1；隔离无 Docker 环境通过。
4. `imported` 已只累计本次真实写入，receipt 用独立 `ensured` 记录最终保证存在数。
5. kernel 已提供项目注册、注销的唯一锁内事务 API；CLI 迁移与 Dashboard add/remove 全部复用同一个
   config-dir lock，server 不再自行 read-modify-write。
6. receipt codec 强制 `imported <= ensured <= discovered`；读取无 `ensured` 的旧 v1 receipt 时按
   `ensured=discovered` 解释，并同样校验关系。

## 发布边界

- npm 薄包和真实 tgz 已验证为可发布，但当前环境没有 npm publisher 凭据；不得声称 npm registry 的
  `npx` 入口已经公开可用。首发以 GitHub Marketplace bootstrap 为真实一步安装入口。
- `npm audit` 报告的 7 项来自构建/开发工具链，`node_modules` 不进入发布 payload；其中 Vite 5 的
  修复受当前 VitePress 1.6 依赖线约束，作为后续工具链升级风险记录，不伪装为零风险。
- Ship 必须创建目标 GitHub 仓库、推送并合并主分支、部署 Pages、创建 `v1.0.0` Release，随后更新
  正式 `18765` 并重跑公网安装与运行时验收；上述外部事实未发生前不得宣称公开发布完成。
