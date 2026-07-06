# pipeline-worklfow

7-phase 开发流水线状态机的**轻量 TypeScript 重建**——[workflow-plugin] 的单语言前锋版。

> 状态机 + 三门 + guard 的硬保障，去掉一切正交子系统。数据格式与老内核字节级兼容。
> 运行时依赖：node ≥22 + 几百行 bash hook shim，仅此而已。

- 目标与收敛判据：[GOAL.md](GOAL.md)
- 迭代协议（loop-lite）：[LOOP.md](LOOP.md) · 队列：[BACKLOG.md](BACKLOG.md)
- 数据/CLI/并行开发契约：[docs/CONTRACT.md](docs/CONTRACT.md)
- 当前实施计划：[docs/plans/2026-07-06-lite-v01-kernel-port.md](docs/plans/2026-07-06-lite-v01-kernel-port.md)

## 布局

```
packages/kernel   状态机内核（零运行时依赖）：state 读写/锁/CAS · flow 转换/guard/manifest
packages/cli      pipeline 命令行（commander）
hooks/            纯 bash 薄 shim（PreToolUse 三门拦截等，热路径不 spawn node）
tools/oracle/     golden-oracle 双跑校验（老内核 vs 本仓，逐字 diff）
templates/        manifest.yaml（相位/转换/review_phases 单一真相源）
```

## 上手（5 分钟）

```bash
npm i && npm run build          # 产出单文件 packages/cli/dist/pipeline.mjs（零 node_modules 运行时）
npx pipeline init demo --track backend --preset full
npx pipeline get demo phase     # open
npx pipeline transition demo open-complete
npx pipeline status
```

## 开发

```bash
npm test                        # vitest 全量
bash tools/test-hooks.sh        # hook shim 断言
bash tools/verify-skills.sh     # 插件资产零悬空引用（CONTRACT §5.7）
bash tools/test-bundle.sh       # 单文件分发冒烟
npm run oracle                  # golden-oracle 双跑（vs 老内核）
```

MIT
