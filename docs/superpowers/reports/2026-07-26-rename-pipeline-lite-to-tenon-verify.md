# Tenon 全局迁移验证报告

> Change：`rename-pipeline-lite-to-tenon`
> 冻结构建：`31edd518710d9d405c8280de0b7cffc984a2adef`
> 本轮结论：失败，退回 Build 修复

## 已执行验证

- `GET http://127.0.0.1:18765/api/health`：通过；返回 `version=1.0.0`，且 18765 只有一个当前 Tenon listener。
- 真实浏览器打开 `http://127.0.0.1:18765/`：Tenon 品牌、七阶段工作台和中文界面可加载。
- `GET http://127.0.0.1:18765/api/snapshot`：失败；当前项目被标记为 `ok=false`。

## 阻断问题

当前 Tenon runtime 读取品牌迁移前创建的活跃 Change 时返回：

```text
rename-pipeline-lite-to-tenon: 状态损坏或不可读
[.../.pipeline-run/current.json]
（workflow plan snapshot 内容与 fingerprint 不一致）
```

结果是 Progress 页面错误显示“没有在制的任务”，无法继续验收 terminal provenance 与 Auto Run
隔离。根因初步定位为 workflow v1 快照只冻结 Workflow IR 和最终 fingerprint，却在读取时使用
当前 runtime 的 document governance policy 重算 fingerprint；产品身份迁移改变了 phase driver
producer id，导致旧快照不再自包含。

## 处理决定

- 不把该错误降级为警告，也不手改 Change canonical state、快照或 fingerprint。
- 走 `verify-fail` 返回 Build。
- 修复目标是让新 workflow 快照冻结完整语义，同时为旧 v1 快照提供受限、可验证的内部协议读取，
  不恢复旧公开 CLI、插件或 Skill 入口。
- 修复后重新运行代码、安装、OpenSpec 隔离演练、真实 Dashboard、文档站与移动端验收。

