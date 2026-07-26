# 任务

## 立项

- [x] 复现共享运行目录导致的跨测试状态污染。
- [x] 确认受影响的 Server、迁移与产品路径调用边界。

## 调研

- [x] 绘制产品路径解析、Server 装配和迁移服务的数据流与所有权。
- [x] 评估显式路径值对象、显式环境依赖与修改环境优先级三种方案。

## 规格

- [x] 定义运行时路径单一解析和应用层显式依赖的验收场景。
- [x] 形成实现计划与回归测试矩阵。
- [x] 补全两个 `MODIFIED Requirement` 的既有场景，确保官方归档不会丢失主规格行为。
- [x] 统一 `hostHome` 与产品 `ServerPaths` 的设计、ADR、计划和验收场景。
- [x] 将默认 mem session、doctor 单快照和当前 Tenon CLI 唯一入口纳入验收场景。
- [x] 将外部参考身份零残留、历史测试项目删除和 Git 历史保留纳入仓库架构契约。

## 实现

- [x] 为 Server 增加完整路径值对象注入并让生产入口复用同一解析结果。
- [x] 让迁移服务显式接收环境依赖并更新所有调用方。
- [x] 让 RuntimeInstaller 显式接收运行环境作用域，消除安装事务中的同类隐式状态根。
- [x] 将 ServerPaths 收紧为 Server 必填依赖，并把宿主发现目录改为独立的 hostHome。
- [x] 让 runtime rollback 在锁内复用单一路径快照，并把环境解析错误映射回 CLI 契约。
- [x] 新增共享运行目录与 XDG 环境下的隔离回归测试。
- [x] 补齐 Server 漏传路径、rollback 动态环境和 runtime scope 解析失败的回归测试。
- [x] 让真实 CLI 入口延迟解析 runtime paths，并覆盖损坏环境与无效子命令的进程级回归。
- [x] 重建 CLI、Server 与 Dashboard 发布资产。
- [x] 用不注入 `memFs` 的真实 HTTP 红灯测试修复默认宿主会话目录装配。
- [x] 用 provider 计数和动态环境红灯测试让 doctor 全部探针复用同一 runtime scope。
- [x] 修复 review hook 的旧 CLI 探测并让只安装 Tenon 的 hook suite 全绿。
- [x] 扩展集中式外部参考身份与历史测试资产门禁，覆盖路径、文本和脱敏输出。
- [x] 删除外部参考身份说明及历史测试项目的 demo、文档、OpenSpec 主规格与 archive。
- [x] 重建 CLI、Server、Dashboard、Marketplace 与 npx 发布资产。

## 验证

- [x] 运行受影响的定向测试、共享环境复现测试和全量测试。
- [x] 运行架构、身份、仓库卫生、构建与发布资产新鲜度门禁。
- [x] 确认 PR CI 全部通过。

## 交付

- [x] 应用主规格并将修复提交到现有发布 PR。

## 归档

- [x] 归档 Change 并恢复主发布 Change 的 Ship 流程。
