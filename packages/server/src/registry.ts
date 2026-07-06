/**
 * 机器级项目注册表读取 —— ~/.claude/pipeline-projects.json（JSON 字符串数组）。
 * 老仓 project_model._read_registry 逐条对位：缺失/损坏/非数组 → []（best-effort，绝不阻断 snapshot）。
 */
import { readFileSync } from 'node:fs'

export function readRegistry(registryPath: string): string[] {
  try {
    const data: unknown = JSON.parse(readFileSync(registryPath, 'utf8'))
    return Array.isArray(data) ? data.map((x) => String(x)) : []
  } catch {
    return []
  }
}
