/**
 * 机器级项目注册表读取 —— ~/.claude/pipeline-projects.json（JSON 字符串数组）。
 * v5 T2（决策 D）：写下沉 kernel 后，读实现改为复用 kernel readProjectRegistry——
 * 容错语义零变化（缺失/损坏/非数组 → []，best-effort，绝不阻断 snapshot）。
 * 保留本模块与 readRegistry 导出名，全仓既有 import 不动。
 */
export { readProjectRegistry as readRegistry } from '@tenon/kernel'
