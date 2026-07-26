# Tenon 旧通道迁移桥

此目录不是 Tenon 的兼容命令层，而是发布到旧仓库 `jefferysha/pipeline-worklfow` 的一次性迁移包。
旧用户仍以 `pipeline-lite@pipeline-lite` 接收最后一个 bridge release；bridge 只做以下事务：

1. 从独立的新仓库安装 `tenon@tenon`；
2. 由 Tenon 自己校验并原子激活 managed runtime；
3. 等待新的宿主 SessionStart 写入 Tenon 会话证明；
4. 复验宿主 inventory、runtime、launcher 和旧 launcher 的捕获摘要；
5. 删除旧插件、旧 marketplace 和仍与摘要一致的旧 launcher。

任一步失败都会保留旧登记或将清理停在可重试状态。外部符号链接、摘要变化的文件、Claude managed
scope 和无法证明 Tenon 已在新会话加载的状态一律拒绝自动删除。

`tools/build-legacy-bridge.mjs` 会把此模板与当前已验证的 `install.sh` 组装成独立、最小的冻结仓库；
Tenon 的主插件 payload 和 CLI 不包含旧命令 alias。
