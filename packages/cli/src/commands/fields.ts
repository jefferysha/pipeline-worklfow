/**
 * get / set / set-many / cas —— 字段读写命令（CONTRACT §3，2026-07-06 oracle 实测回写）。
 * stdout/exit 契约（get/set 以老内核双跑逐字一致为准）：
 *   get      裸值一行（去引号后由 store 保证），0；字段缺失/未知 → 空行 + 0（老内核 yaml_get 语义）；
 *            change 缺失/名非法=1
 *   set      无输出，0；四闸/枚举/未知字段拒写=1（枚举表对齐老内核 state-fields.sh cmd_set）
 *   set-many 无输出，同 set
 *   cas      无输出，0；不匹配=3；错误=1
 */
import { FIELD_ORDER, LIST_FIELDS, TRACKS } from '@pipeline-lite/kernel'
import type { FieldName, HistoryEntry } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

/** history 记账 best-effort（CONTRACT §1：失败仅 WARN，绝不影响主写已成功的 exit） */
export async function recordHistory(deps: CliDeps, dir: string, entry: HistoryEntry): Promise<void> {
  if (!deps.history) return
  try {
    await deps.history.append(dir, entry)
  } catch (e) {
    deps.io.err(`WARN: history 写入失败: ${errMsg(e)}`)
  }
}

/**
 * 枚举字段校验表 —— 逐字对齐老内核 state-fields.sh cmd_set 的 case 块
 * （track 例外：lite 的 TRACKS 含 chat 扩展，见 types.ts；phase 走 manifest 单一真相源）。
 */
const REVIEWISH = ['pending', 'pass', 'fail', 'handled', 'skipped'] as const
const STATIC_ENUMS: Partial<Record<FieldName, readonly string[]>> = {
  track: TRACKS,
  preset: ['full', 'hotfix', 'tweak'],
  phase_status: ['pending', 'in_progress', 'done', 'failed'],
  build_mode: ['direct', 'subagent-driven-development', 'parallel-team', 'prototype'],
  isolation: ['branch', 'worktree'],
  agent_review_result: REVIEWISH,
  codex_review_result: REVIEWISH,
  verify_result: REVIEWISH,
  branch_status: REVIEWISH,
  direct_override: ['true', 'false'],
  archived: ['true', 'false'],
  automation: ['off', 'queued', 'scheduled', 'running', 'merged', 'failed', 'conflict', 'paused'],
}

/** 枚举校验：不通过 → stderr 报错（老内核 validate_enum 口径）+ 返回 false */
function enumOk(deps: CliDeps, field: FieldName, value: string | string[]): boolean {
  if (Array.isArray(value)) return true // 列表字段无枚举
  const allowed = field === 'phase' ? deps.flow.manifest.phases : STATIC_ENUMS[field]
  if (!allowed || allowed.includes(value as never)) return true
  deps.io.err(`ERROR: 非法值 '${value}'，允许: ${allowed.join(' ')}`)
  return false
}

function asField(deps: CliDeps, field: string): FieldName | undefined {
  if ((FIELD_ORDER as readonly string[]).includes(field)) return field as FieldName
  deps.io.err(`ERROR: 未知字段: ${field}`)
  return undefined
}

function checkName(deps: CliDeps, name: string): boolean {
  if (isValidChangeName(name)) return true
  deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
  return false
}

function isListField(field: FieldName): boolean {
  return (LIST_FIELDS as readonly string[]).includes(field)
}

/** 列表字段的 CLI 值口径：逗号分隔、去首尾空白、剔空项；空串=清空 */
function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function coerceValue(field: FieldName, raw: string): string | string[] {
  return isListField(field) ? splitList(raw) : raw
}

export async function cmdGet(deps: CliDeps, name: string, field: string): Promise<number> {
  if (!checkName(deps, name)) return 1
  try {
    // 状态文件缺失仍 fail-loud（老内核 ensure_state_exists）；字段缺失/未知则对齐
    // 老内核 yaml_get grep 语义：空行 + exit 0（2026-07-06 oracle 实测回写）。
    const state = await deps.store.read(changeDir(deps.cwd, name))
    const known = (FIELD_ORDER as readonly string[]).includes(field)
    const v = known ? state.fields[field as FieldName] : undefined
    deps.io.out(v === undefined ? '' : Array.isArray(v) ? v.join(',') : v)
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}

export async function cmdSet(deps: CliDeps, name: string, field: string, value: string): Promise<number> {
  if (!checkName(deps, name)) return 1
  const f = asField(deps, field)
  if (!f) return 1
  const v = coerceValue(f, value)
  if (!enumOk(deps, f, v)) return 1
  const dir = changeDir(deps.cwd, name)
  try {
    await deps.store.set(dir, f, v)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  await recordHistory(deps, dir, {
    ts: deps.clock(),
    kind: 'set',
    field: f,
    to: Array.isArray(v) ? v.join(',') : v,
  })
  return 0
}

export async function cmdSetMany(deps: CliDeps, name: string, pairs: string[]): Promise<number> {
  if (!checkName(deps, name)) return 1
  const kv: Partial<Record<FieldName, string | string[]>> = {}
  for (const pair of pairs) {
    const i = pair.indexOf('=')
    if (i <= 0) {
      deps.io.err(`ERROR: kv 格式错误(缺 '=' 或键为空): ${pair}`)
      return 1
    }
    const f = asField(deps, pair.slice(0, i))
    if (!f) return 1
    const v = coerceValue(f, pair.slice(i + 1))
    if (!enumOk(deps, f, v)) return 1
    kv[f] = v
  }
  if (Object.keys(kv).length === 0) {
    deps.io.err('ERROR: set-many 至少需要 1 个 key=value')
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  try {
    await deps.store.setMany(dir, kv)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  for (const [f, v] of Object.entries(kv) as Array<[FieldName, string | string[]]>) {
    await recordHistory(deps, dir, {
      ts: deps.clock(),
      kind: 'set',
      field: f,
      to: Array.isArray(v) ? v.join(',') : v,
    })
  }
  return 0
}

export async function cmdCas(
  deps: CliDeps,
  name: string,
  field: string,
  expect: string,
  next: string,
): Promise<number> {
  if (!checkName(deps, name)) return 1
  const f = asField(deps, field)
  if (!f) return 1
  // 老内核 cmd_cas 仅对 automation 复用枚举校验（state-fields.sh）
  if (f === 'automation' && !enumOk(deps, f, next)) return 1
  const dir = changeDir(deps.cwd, name)
  let ok: boolean
  try {
    ok = await deps.store.cas(dir, f, expect, next)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  if (!ok) return 3
  await recordHistory(deps, dir, { ts: deps.clock(), kind: 'set', field: f, from: expect, to: next })
  return 0
}
