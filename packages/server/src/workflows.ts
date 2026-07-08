/**
 * workflow 编辑器数据端（GOAL E8）——真读/写 `.pipeline/workflows/*.yaml`。
 * `default` 不在此列（运行时不读这个文件，见 CONTRACT/design doc 决策 2）。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadWorkflow } from '@pipeline-lite/kernel'
import type { WorkflowDef } from '@pipeline-lite/kernel'

export const WORKFLOWS_DIR = '.pipeline/workflows'

function workflowsDir(root: string): string {
  return join(root, '.pipeline', 'workflows')
}

/** 扫 `<root>/.pipeline/workflows/*.yaml`，去扩展名，排除 default。目录不存在 → 空数组。 */
export function listWorkflowNames(root: string): string[] {
  const dir = workflowsDir(root)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.slice(0, -'.yaml'.length))
    .filter((name) => name !== 'default')
}

/** 真读 + 解析（含 loadWorkflow 已接的 validateWorkflow 校验）；找不到/非法 → 抛错，路由层负责映射状态码。 */
export function readWorkflowForApi(root: string, name: string): WorkflowDef {
  const wf = loadWorkflow(root, name)
  if (!wf) throw new Error(`workflow '${name}' 未找到`)
  return wf
}
