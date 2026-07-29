# Host Plan 桌面基线审计

## 范围与环境

- 基线：`origin/main@62edd62051b93647013b70c1a021c4b6aeabbacf`
- 目标：生产构建的 Tenon Dashboard，`http://127.0.0.1:18845/?view=hostPlan`
- 浏览器：Codex 内置 Chromium
- 视口：1024×768、1200×870、1440×900、1920×1080
- 约束：只评估电脑端；不做手机端设计、截图或验收。

## 可确认事实

| 视口 | 目录可视高度 | 目录内容高度 | 首卡高度 | 同屏可见宿主 | 横向溢出 |
| --- | ---: | ---: | ---: | ---: | --- |
| 1024×768 | 640px | 2235px | 202px | 4 / 12 | 无 |
| 1200×870 | 742px | 2235px | 202px | 4 / 12 | 无 |
| 1440×900 | 772px | 2235px | 202px | 4 / 12 | 无 |
| 1920×1080 | 952px | 2235px | 202px | 5 / 12 | 无 |

- master-detail 布局稳定，1024px 时目录约 347px、详情约 521px；1440px 时目录约 440px、详情约 660px。
- 每个未选宿主重复展示 kind、scope、3–4 个 capability 和整行选择按钮；扫描 12 个宿主需要在独立滚动区中多次滚动。
- 选择宿主后，详情区能正确显示 Setup/Update，焦点仍留在已选按钮；未选操作时详情区只占约 152px，桌面宽度没有转化为更多目录可见性。
- 生成 Codex Setup 计划后，详情高度约 1120px、预览约 984px，包含 7 个步骤；命令、步骤和只读提示层级清楚，无横向页面溢出。
- loading、error、empty、计划错误、复制成功/失败均已有组件测试与本地化错误映射；当前问题主要是成功态的目录扫描密度和“选择上下文 → 操作 → 计划”层级。

## 非重复与冲突审计

- PR #14：App、全局 token、Nav、Onboarding、Projects、Solution 与共享 primitives。
- PR #13：Trace/Advanced/Machine 及其 API。
- PR #12：Memory、TaskDetail、Loop 与 Workbench。
- PR #11：Loop scope preview 与 Workbench。
- PR #9：Prompt routing/governance timeline。
- 以上开放 PR 均未修改 `packages/dashboard-app/src/hostPlan/*`。本批次不修改全局 token、App、Nav、Solution、Loop、Memory 或 Trace 文件。

## 结论

保留现有 API、master-detail 布局与所有状态语义，压缩目录为高密度选择行；未选项只呈现识别所需的名称、CLI flag、kind 和 scope，把 capability 集合移动到已选宿主的详情头部。这样不删除信息、不新增过滤状态或依赖，并把重复信息从 12 份降为当前选择的一份。
