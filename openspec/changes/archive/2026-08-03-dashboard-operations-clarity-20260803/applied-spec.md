# 已应用规格

## 变更摘要

2026-08-03 将本 Change 已验证的四份 delta spec 幂等应用到对应主规格。结果为 8 个 requirement
新增、3 个 requirement 修改、0 个 requirement 删除；未覆盖任何无关主规格内容，无冲突需要裁决。

## 已应用需求

- `openspec/changes/dashboard-operations-clarity-20260803/specs/dashboard-project-selection/spec.md`
  → `openspec/specs/dashboard-project-selection/spec.md`
  - before: `230bb6d0464cec7cc61fcf46b6875eb7f631e64a1ae7f8f18d41a0a2815cff63`
  - after: `efe9fe2e95f748c3f8ef9ad6c9e1285482f6724741465cf75eeb739b0a838974`
  - result: `changed`
  - effect: 增加稳定 Git 仓库身份分组、组级状态统计、可达 workspace 选择与不可达 root 批量注销契约。
- `openspec/changes/dashboard-operations-clarity-20260803/specs/dashboard-ui-ux-system/spec.md`
  → `openspec/specs/dashboard-ui-ux-system/spec.md`
  - before: `17b9dc305a1af1c1baa5a01e0d8c40beefbf379b8b477e3bb06ce83b19ab1fc4`
  - after: `db01e8b00eb934757656fa8a28afa649010495b49fcf19476db2b4c3b5aaf427`
  - result: `changed`
  - effect: 增加 Workbench 单一控制面、40px 控件、核心/AFK 状态分层和桌面视觉验收契约。
- `openspec/changes/dashboard-operations-clarity-20260803/specs/host-target-plan/spec.md`
  → `openspec/specs/host-target-plan/spec.md`
  - before: `3e472811f4d09565b693e5231a9e97c52ac24931ec28810b139bc4f012bcb833`
  - after: `b8e44455a180d4a5353c04abfa2265449c2cc766fcb8f2b61e97e9f3663ca2c1`
  - result: `changed`
  - effect: 增加原生宿主自动检测、setup/update 推荐、只读计划自动加载与竞态关闭契约。
- `openspec/changes/dashboard-operations-clarity-20260803/specs/orchestration-graph/spec.md`
  → `openspec/specs/orchestration-graph/spec.md`
  - before: `02c85d0651875be8169d3f53832ea320044f40d7de2b5acca776bb8c4345226b`
  - after: `6f2519aff0f47344f9ad1496e385b2b3ffdde66011ae5e3ff08e492c53113f76`
  - result: `changed`
  - effect: 增加七阶段主干、次级关系/资源区和受限阶段键盘导航契约。

## 交付证据

- Verify 冻结 SHA：`74fc731237761a69ac0d1b6995a04337d9bfed39`。
- 隔离归档演练：8 added、3 modified、0 removed；归档后主规格 32/32、全量 36/36 严格检查通过。
- 真实应用后重新运行 OpenSpec strict validation；重复应用时以上 after digest 保持不变即为 `no-op`。
