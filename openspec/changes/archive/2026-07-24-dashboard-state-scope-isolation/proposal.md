# Dashboard State Scope Isolation

## Intent

首次安装、更新或显式启动 Dashboard 时，受管启动器必须连接到与本次
`PIPELINE_DASHBOARD_HOME` 相同的机器状态域，不能仅因端口上的旧服务具有相同
`releaseId` 就复用它。当前缺陷会让 UI 读取另一个状态域的项目注册表，进而把 Workflow、
Track、Change 和任务状态显示到错误项目。

## Intended outcome

- Dashboard 的单例身份由不可变发布身份与不透明状态域身份共同决定。
- 同发布、同状态域可以安全复用；状态域不同必须接管并通过新身份健康检查。
- 健康响应只暴露不可逆指纹，不泄露用户 Home 或状态目录路径。
- 现有 `/api/health` 调用方继续兼容，新字段为可选的加法扩展。

## Scope

- Dashboard server 的状态域指纹、健康响应和抢占决策。
- CLI 受管启动后的精确健康验证。
- server/CLI 单元测试与真实双状态域启动回归。

## Non-goals

- 不改变 Dashboard 的固定默认端口 18765。
- 不允许同一端口同时运行多个状态域；显式启动者安全接管该端口。
- 不改变项目级 canonical pipeline 状态或 Track/Workflow 文件格式。

## Acceptance signal

在同一个 18765 端口先后使用两个不同的 `PIPELINE_DASHBOARD_HOME` 启动同一发布包时，
第二次启动必须替换旧实例；`/api/health` 必须返回第二个状态域的指纹，Dashboard snapshot
只能读取第二个状态域注册的项目。相同状态域再次启动仍应复用。

## Classification

Bug fix / architecture hardening。详细指纹归一化、兼容与抢占优先级待 explore 验证。
