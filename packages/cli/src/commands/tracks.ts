/**
 * `pipeline tracks list/show/create/update/delete` —— 动态 Track Registry 的 CRUD 控制面
 * （GOAL.md 清单 T · T-R3，codex D5）。参数→kernel patch 转换、活跃 change 引用扫描、人读/JSON
 * 输出、错误→exit 1 统一映射、policy preset 展开都在本文件；纯配置变换/引用策略/锁在 kernel。
 *
 * 退出码（D5）：0 成功；1 一切错误（usage/校验/不存在/已存在/builtin 禁改/被引用/损坏/IO）。
 * 3 只留 CAS miss（本命令族不产生）。写命令成功 stdout 输出 `created/updated/deleted <id>`（或
 * --json 的 effective definition / `{deleted,revision}`）；JSON 模式 stdout 只放 JSON、错误走 stderr。
 */
import {
  assertTrackDeletable,
  assertUpdatePreservesReferences,
  builtinTrack,
  createTrack,
  deleteTrack,
  isBuiltinTrackId,
  updateTrack,
} from '@pipeline-lite/kernel'
import type {
  ActiveChangeRef,
  BuiltinTrackId,
  ChangeRefScan,
  CreateTrackSpec,
  TrackDefinition,
  TrackPolicyProfile,
  TrackRegistry,
  TrackWorkflowBinding,
  UpdateTrackPatch,
} from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, changesRoot } from '../paths.js'

type TrackSource = 'builtin' | 'builtin-override' | 'custom'

export interface TracksCommonOpts {
  json?: boolean
}
export interface TracksCreateOpts extends TracksCommonOpts {
  label?: string
  workflowDefault?: string
  workflowAllowed?: string[]
  workflowAny?: boolean
  policy?: string
}
export interface TracksUpdateOpts extends TracksCommonOpts {
  setLabel?: string
  setWorkflowDefault?: string
  setWorkflowAllowed?: string[]
  setWorkflowAny?: boolean
  setPolicy?: string
}

/** --policy <chat|pm|frontend|backend>：深拷贝对应 builtin 的 policy 作**初始化模板**（非引用；
 *  落盘完整结构）。未知 preset → undefined（调用方报 usage error）。 */
function expandPolicy(preset: string): TrackPolicyProfile | undefined {
  if (!isBuiltinTrackId(preset)) return undefined
  return structuredClone(builtinTrack(preset).policyProfile)
}

function allowedEq(a: '*' | readonly string[], b: '*' | readonly string[]): boolean {
  if (a === '*' || b === '*') return a === b
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** builtin 是否被覆盖：effective label/workflow 与代码默认不同即 override（归一化保证 no-op override
 *  不残留，故 effective==base ⇔ 无覆盖）。 */
function sourceOf(def: TrackDefinition): TrackSource {
  if (!def.builtin) return 'custom'
  const base = builtinTrack(def.id as BuiltinTrackId)
  const same =
    def.label === base.label &&
    def.workflow.default === base.workflow.default &&
    allowedEq(def.workflow.allowed, base.workflow.allowed)
  return same ? 'builtin' : 'builtin-override'
}

function allowedText(allowed: '*' | readonly string[]): string {
  return allowed === '*' ? '*' : allowed.join(', ')
}

/** JSON schema（含 id,label,builtin,source,workflow,policyProfile,revision）。 */
function trackJson(def: TrackDefinition, source: TrackSource, revision: string): Record<string, unknown> {
  return {
    id: def.id,
    label: def.label,
    builtin: def.builtin,
    source,
    workflow: { default: def.workflow.default, allowed: def.workflow.allowed },
    policyProfile: def.policyProfile,
    revision,
  }
}

// ── 活跃 change 引用扫描（fail-closed：读不了的进 unreadable）─────────────────────

/**
 * 严格枚举所有非 archive 候选目录（deps.listChangeDirs，**不做 .pipeline.yaml 过滤**）后逐个
 * store.read：成功→取 {track,workflow} 引用；失败（ENOENT 缺文件 / EACCES / EISDIR / 解析异常）
 * →进 unreadable。**刻意不复用 deps.listChanges**——后者会 access .pipeline.yaml 把缺失/不可读目录
 * 剔除，导致「目录在但 .pipeline.yaml 丢失」的 change 不进候选集、unreadable 恒空、fail-closed 被绕过
 * 误删（codex R3 阻断 D）。store.read 对缺文件/坏目录抛 → 归 unreadable；对存在但内容垃圾的文件宽容
 * 解析为 track=''（本仓 state 解析器只在文件缺失/IO 错时抛，内容永不抛），此时 track≠待删轨、判为
 * 「可证明不引用」不阻断。kernel（assertTrackDeletable/assertUpdatePreservesReferences）先判 unreadable
 * 再判引用，故候选集完整即 fail-closed 真实生效。
 */
async function scanActiveChanges(deps: CliDeps): Promise<ChangeRefScan> {
  const names = await deps.listChangeDirs(changesRoot(deps.cwd))
  const refs: ActiveChangeRef[] = []
  const unreadable: string[] = []
  for (const name of names) {
    try {
      const st = await deps.store.read(changeDir(deps.cwd, name))
      const track = st.fields.track
      const workflow = st.fields.workflow
      refs.push({
        name,
        track: Array.isArray(track) ? track.join(',') : (track ?? ''),
        workflow: Array.isArray(workflow) ? workflow.join(',') : (workflow ?? ''),
      })
    } catch {
      unreadable.push(name)
    }
  }
  return { refs, unreadable }
}

// ── 输出 ──────────────────────────────────────────────────────────────────────

function renderList(deps: CliDeps, registry: TrackRegistry): void {
  const header = ['ID', 'LABEL', 'BUILTIN', 'DEFAULT', 'ALLOWED', 'POLICY']
  const rows = registry.ordered.map((d) => [
    d.id,
    d.label,
    d.builtin ? 'yes' : 'no',
    d.workflow.default,
    allowedText(d.workflow.allowed),
    d.policyProfile.coverageProfile,
  ])
  // 列宽取 header 与各行的最大值——不截断、不省略（名称一律完整显示，排版规整）。
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]!.length)))
  const fmt = (cells: string[]) => cells.map((v, c) => v.padEnd(widths[c]!)).join('  ').trimEnd()
  deps.io.out(fmt(header))
  for (const r of rows) deps.io.out(fmt(r))
}

function renderShow(deps: CliDeps, def: TrackDefinition, source: TrackSource, revision: string): void {
  const p = def.policyProfile
  deps.io.out(`id: ${def.id}`)
  deps.io.out(`label: ${def.label}`)
  deps.io.out(`builtin: ${def.builtin}`)
  deps.io.out(`source: ${source}`)
  deps.io.out(`workflow.default: ${def.workflow.default}`)
  deps.io.out(`workflow.allowed: ${allowedText(def.workflow.allowed)}`)
  deps.io.out(`policy.reviewSeed: ${p.reviewSeed}`)
  deps.io.out(`policy.automationEligible: ${p.automationEligible}`)
  deps.io.out(`policy.coverageProfile: ${p.coverageProfile}`)
  deps.io.out(
    p.routing.enabled
      ? `policy.routing: enabled=true pattern=${p.routing.pattern} priority=${p.routing.priority}`
      : 'policy.routing: enabled=false',
  )
  deps.io.out(`policy.skills: matrix=${p.skills.matrix} profile=${p.skills.profile}`)
  // builtin-override：把「与代码默认不同」的字段单列，避免用户误以为完整 builtin 已写进 YAML。
  if (source === 'builtin-override') {
    const base = builtinTrack(def.id as BuiltinTrackId)
    if (def.label !== base.label) deps.io.out(`override: label=${def.label}`)
    if (def.workflow.default !== base.workflow.default) deps.io.out(`override: workflow.default=${def.workflow.default}`)
    if (!allowedEq(def.workflow.allowed, base.workflow.allowed)) {
      deps.io.out(`override: workflow.allowed=${allowedText(def.workflow.allowed)}`)
    }
  }
  deps.io.out(`revision: ${revision}`)
}

/** 写命令成功回显：--json 返回 effective definition，否则 `<verb> <id>`。 */
function emitWrite(deps: CliDeps, verb: string, id: string, registry: TrackRegistry, json?: boolean): number {
  if (json) {
    const def = registry.byId.get(id)!
    deps.io.out(JSON.stringify(trackJson(def, sourceOf(def), registry.revision)))
  } else {
    deps.io.out(`${verb} ${id}`)
  }
  return 0
}

/** 领域错误/校验/IO 一律 exit 1，消息走 stderr（JSON 模式 stdout 仍纯净）。 */
function fail(deps: CliDeps, e: unknown): number {
  deps.io.err(`ERROR: ${errMsg(e)}`)
  return 1
}

// ── 子命令 ────────────────────────────────────────────────────────────────────

export async function cmdTracksList(deps: CliDeps, opts: TracksCommonOpts): Promise<number> {
  let registry: TrackRegistry
  try {
    registry = deps.loadRegistry()
  } catch (e) {
    return fail(deps, e)
  }
  if (opts.json) {
    deps.io.out(JSON.stringify(registry.ordered.map((d) => trackJson(d, sourceOf(d), registry.revision))))
    return 0
  }
  renderList(deps, registry)
  return 0
}

export async function cmdTracksShow(deps: CliDeps, id: string, opts: TracksCommonOpts): Promise<number> {
  let registry: TrackRegistry
  try {
    registry = deps.loadRegistry()
  } catch (e) {
    return fail(deps, e)
  }
  const def = registry.byId.get(id)
  if (!def) {
    deps.io.err(`ERROR: 未注册的 track '${id}'（已注册：${registry.ordered.map((t) => t.id).join(', ')}）`)
    return 1
  }
  const source = sourceOf(def)
  if (opts.json) {
    deps.io.out(JSON.stringify(trackJson(def, source, registry.revision)))
    return 0
  }
  renderShow(deps, def, source, registry.revision)
  return 0
}

export async function cmdTracksCreate(deps: CliDeps, id: string, opts: TracksCreateOpts): Promise<number> {
  if (opts.workflowAny && opts.workflowAllowed && opts.workflowAllowed.length > 0) {
    deps.io.err('ERROR: --workflow-any 与 --workflow-allowed 互斥（全放行用 --workflow-any，否则列具体 workflow）')
    return 1
  }
  const missing: string[] = []
  if (!opts.label) missing.push('--label')
  if (!opts.workflowDefault) missing.push('--workflow-default')
  if (!opts.workflowAny && !(opts.workflowAllowed && opts.workflowAllowed.length > 0)) {
    missing.push('--workflow-allowed 或 --workflow-any')
  }
  if (!opts.policy) missing.push('--policy')
  if (missing.length > 0) {
    deps.io.err(`ERROR: create 缺少必填项：${missing.join('、')}（四组信息全部必填，无隐式默认）`)
    return 1
  }
  const policyProfile = expandPolicy(opts.policy!)
  if (!policyProfile) {
    deps.io.err(`ERROR: 未知 --policy '${opts.policy}'（只支持 chat|pm|frontend|backend 作模板）`)
    return 1
  }
  const workflow: TrackWorkflowBinding = {
    default: opts.workflowDefault!,
    allowed: opts.workflowAny ? '*' : opts.workflowAllowed!,
  }
  const spec: CreateTrackSpec = { id, label: opts.label!, workflow, policyProfile }
  try {
    const { registry } = await deps.mutateRegistry(async ({ config }) => ({
      next: createTrack(config, spec),
      result: undefined,
    }))
    return emitWrite(deps, 'created', id, registry, opts.json)
  } catch (e) {
    return fail(deps, e)
  }
}

export async function cmdTracksUpdate(deps: CliDeps, id: string, opts: TracksUpdateOpts): Promise<number> {
  if (opts.setWorkflowAny && opts.setWorkflowAllowed && opts.setWorkflowAllowed.length > 0) {
    deps.io.err('ERROR: --set-workflow-any 与 --set-workflow-allowed 互斥')
    return 1
  }
  const patch: {
    label?: string
    workflowDefault?: string
    workflowAllowed?: '*' | readonly string[]
    policyProfile?: TrackPolicyProfile
  } = {}
  if (opts.setLabel !== undefined) patch.label = opts.setLabel
  if (opts.setWorkflowDefault !== undefined) patch.workflowDefault = opts.setWorkflowDefault
  if (opts.setWorkflowAny) patch.workflowAllowed = '*'
  else if (opts.setWorkflowAllowed && opts.setWorkflowAllowed.length > 0) patch.workflowAllowed = opts.setWorkflowAllowed
  if (opts.setPolicy !== undefined) {
    const p = expandPolicy(opts.setPolicy)
    if (!p) {
      deps.io.err(`ERROR: 未知 --set-policy '${opts.setPolicy}'（只支持 chat|pm|frontend|backend）`)
      return 1
    }
    patch.policyProfile = p
  }
  if (Object.keys(patch).length === 0) {
    deps.io.err('ERROR: update 至少需要一个 --set-*（--set-label/--set-workflow-default/--set-workflow-allowed|--set-workflow-any/--set-policy）')
    return 1
  }
  try {
    const { registry } = await deps.mutateRegistry(async ({ config }) => {
      const next = updateTrack(config, id, patch as UpdateTrackPatch)
      // 缩 allowed/改 default/改配置后：验证每个引用该轨的活跃 change 组合在 next 下仍合法（fail-closed）
      await assertUpdatePreservesReferences(next, id, () => scanActiveChanges(deps))
      return { next, result: undefined }
    })
    return emitWrite(deps, 'updated', id, registry, opts.json)
  } catch (e) {
    return fail(deps, e)
  }
}

export async function cmdTracksDelete(deps: CliDeps, id: string, opts: TracksCommonOpts): Promise<number> {
  try {
    const { registry } = await deps.mutateRegistry(async ({ config }) => {
      const next = deleteTrack(config, id)
      // 扫全部活跃 change：有引用拒删+列名；读不了的 change 也拒（fail-closed）
      await assertTrackDeletable(id, () => scanActiveChanges(deps))
      return { next, result: undefined }
    })
    if (opts.json) deps.io.out(JSON.stringify({ deleted: id, revision: registry.revision }))
    else deps.io.out(`deleted ${id}`)
    return 0
  } catch (e) {
    return fail(deps, e)
  }
}
