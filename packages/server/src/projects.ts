/**
 * 机器级项目注册表写模块（G18，spec §3.1）—— ~/.claude/pipeline-projects.json 的
 * add/remove。读沿用 registry.ts::readRegistry（容错语义不变），写为整文件替换
 * （JSON 数组 + 2 空格缩进，保持人工可编辑——该文件的既有用法就是手改）。
 *
 * 鉴权语境：POST /api/projects 是全仓唯一**豁免第四层信任锚**的写端点——它的职责
 * 就是把 root 放进注册表，"root 必须已注册"在这里逻辑不成立；作为补偿，本模块
 * 强制 root 真实存在且为目录（404），并做两侧规范化判重（409）。
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { readRegistry } from './registry.js'
import { dedupeRoots } from './snapshot.js'

export type ProjectWriteResult =
  | { ok: true; root: string }
  | { ok: false; code: 400 | 404 | 409; error: string }

export function addProjectToRegistry(registryPath: string, rawRoot: unknown): ProjectWriteResult {
  if (typeof rawRoot !== 'string' || !rawRoot) {
    return { ok: false, code: 400, error: 'root 须为非空字符串' }
  }
  let isDir: boolean
  try {
    isDir = statSync(rawRoot).isDirectory()
  } catch {
    return { ok: false, code: 404, error: `路径不存在：${rawRoot}` }
  }
  if (!isDir) {
    return { ok: false, code: 404, error: `路径不是目录：${rawRoot}` }
  }
  const normalized = resolvePath(rawRoot)
  const existing = readRegistry(registryPath)
  if (dedupeRoots(existing).includes(normalized)) {
    return { ok: false, code: 409, error: `项目已注册：${normalized}` }
  }
  const next = [...existing, normalized]
  mkdirSync(dirname(registryPath), { recursive: true })
  writeFileSync(registryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true, root: normalized }
}

export type ProjectRemoveResult =
  | { ok: true }
  | { ok: false; code: 400 | 404; error: string }

export function removeProjectFromRegistry(registryPath: string, rawRoot: unknown): ProjectRemoveResult {
  if (typeof rawRoot !== 'string' || !rawRoot) {
    return { ok: false, code: 400, error: '缺 root 查询参数' }
  }
  const normalized = resolvePath(rawRoot)
  const existing = readRegistry(registryPath)
  const next = existing.filter((e) => !e || resolvePath(e) !== normalized)
  if (next.length === existing.length) {
    return { ok: false, code: 404, error: `项目未注册：${normalized}` }
  }
  writeFileSync(registryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true }
}
