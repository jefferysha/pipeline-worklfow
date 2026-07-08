/**
 * workflow 编辑器数据端（GOAL E8）——真读/写 `.pipeline/workflows/*.yaml`。
 * `default` 不在此列（运行时不读这个文件，见 CONTRACT/design doc 决策 2）。
 */
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadWorkflow, serializeWorkflow, validateWorkflow } from '@pipeline-lite/kernel'
import type { WorkflowDef } from '@pipeline-lite/kernel'

export const WORKFLOWS_DIR = '.pipeline/workflows'

function workflowsDir(root: string): string {
  return join(root, '.pipeline', 'workflows')
}

/**
 * 结构化"未找到"信号（round 2 review fix）——路由层必须能区分"文件真不存在"（404）与
 * "文件存在但校验/解析失败"（500），且不能靠对错误信息做子串匹配来分辨：`loadWorkflow`
 * 内部的 validateWorkflow/parseWorkflow 错误信息会原样拼进用户自己起的 step id / event
 * 名 / transition 目标等任意文本，若用户恰好把某个 id 起成含"未找到"字样，子串匹配会把一次
 * 真实的校验失败误判成 404。改用专用错误类型，路由层用 `instanceof` 判断，不再摸文本。
 */
export class WorkflowNotFoundError extends Error {}

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
  if (!wf) throw new WorkflowNotFoundError(`workflow '${name}' 未找到`)
  return wf
}

export type WriteWorkflowResult = { ok: true } | { ok: false; errors: string[] }

/** 校验通过才落盘（同目录 tmp+rename 原子写，对齐 kernel state/store.ts 的既有写法）；不存在则建、存在则覆盖。 */
export function writeWorkflowForApi(root: string, name: string, wf: WorkflowDef): WriteWorkflowResult {
  const errors = validateWorkflow(wf)
  if (errors.length > 0) return { ok: false, errors }
  const dir = workflowsDir(root)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}.yaml`)
  const tmp = `${file}.tmp.${process.pid}`
  writeFileSync(tmp, serializeWorkflow(wf), 'utf8')
  renameSync(tmp, file)
  return { ok: true }
}

/** 真删；文件不存在返回 false（不抛错——DELETE 端点据此映射 404）。 */
export function deleteWorkflowForApi(root: string, name: string): boolean {
  const file = join(workflowsDir(root), `${name}.yaml`)
  if (!existsSync(file)) return false
  unlinkSync(file)
  return true
}
