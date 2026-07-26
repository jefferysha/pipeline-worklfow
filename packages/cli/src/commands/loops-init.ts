import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import {
  ABSENT_REGISTRY_EPOCH, addDraftMark, appendLoopToYamlText, createLoopsYamlText, draftMarksPath,
  loadRegistry as kernelLoadRegistry, loopsYamlPath, PHASES,
  readRegistrySnapshot as kernelReadRegistrySnapshot, writeRegistryWithGovernance, type LoopRisk,
} from '@tenon/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { createProductionSkillContentLocator } from '../skillBundleAssembly.js'
import { buildLoopStarterWiringReport, type LoopStarterWiringDeps, type LoopStarterWiringReport } from './loop-starter-wiring.js'
import {
  DEFAULT_HUMAN_GATES, DEFAULT_KILL_CRITERIA, RISK_CADENCE, assembleEntry, compileStarter, csv,
  derivePrefix, parseInitArgs, resolveDefaults, validateCadence, validateGoal, validateId, validateKind,
  validateRisk, validateRunner, type InitArgs, type RawInputs, type StarterCompilation,
} from './loops-init-input.js'

export { derivePrefix } from './loops-init-input.js'

// ── init 的 loops.yaml governance 读写 + 交互注入面（真实现见 REAL_INIT_ENV；测试注入 fake）───────

/** init 的 loops.yaml 快照（原文 + 字节 epoch）——写回 epoch-CAS 的初读。 */
export interface RegistrySnapshotLite {
  text: string
  epoch: string
}

/** 交互向导的一问一答面（真实现 = readline/promises；测试注入脚本化应答）。 */
export interface Prompter {
  ask(prompt: string): Promise<string>
  close(): void
}

/** init 命令的注入环境（loops.yaml governance 读写 + 草稿标记 + 交互探测/向导）。 */
export interface InitEnv {
  /** 读 loops.yaml 快照（原文 + 字节 epoch）；缺失 → epoch=ABSENT_REGISTRY_EPOCH、text=''。 */
  readSnapshot(repoRoot: string): Promise<RegistrySnapshotLite>
  /**
   * governance 锁 + 字节 epoch-CAS + atomic 写回（Stage B 返工 #3#4：init 写方与 admission 复验/level set/
   * server 写方**同 governance 锁串行**，绝不非治理旁路覆盖/留半文件）：首建用 expectedEpoch=
   * ABSENT_REGISTRY_EPOCH（并发首建 → 锁内 epoch 已非 ABSENT → CAS 拒，等价旧 wx 独占）；追加用初读 epoch。
   * produce 对**锁内当前文本**生成新文本（appendLoopToYamlText 的 dup/坏文本判定在锁内当前文本上做，返 error → 不落盘）。
   */
  writeGoverned(repoRoot: string, expectedEpoch: string, produce: (currentText: string) => { text: string | null; error: string | null }): Promise<{ ok: boolean; error: string | null }>
  /** best-effort 登记草稿标记（失败抛 → 调用方 WARN，不回滚、不改 exit）。 */
  addDraftMark(path: string, id: string): Promise<void>
  /** 是否交互终端（真实现 = process.stdin.isTTY && process.stdout.isTTY）。 */
  isInteractive(): boolean
  /** 造一个 Prompter（仅在决定走交互向导时调用）。 */
  makePrompter(): Prompter
}

export const REAL_INIT_ENV: InitEnv = {
  readSnapshot: async (repoRoot) => {
    const snap = await kernelReadRegistrySnapshot(repoRoot)
    return { text: snap.text, epoch: snap.epoch }
  },
  writeGoverned: async (repoRoot, expectedEpoch, produce) => {
    const r = await writeRegistryWithGovernance(repoRoot, expectedEpoch, (cur) => produce(cur))
    return { ok: r.ok, error: r.ok ? null : r.error }
  },
  addDraftMark: (path, id) => addDraftMark(path, id),
  isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
  makePrompter: () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return { ask: (prompt) => rl.question(prompt), close: () => rl.close() }
  },
}

// ── 交互向导（三组问答，每问展示推导默认值，回车即收；校验失败就地重问）────────────────

/** 问一个带校验的必填/可选项：空输入收默认；校验不过就地重问（交互态语义）。 */
async function askValidated(
  p: Prompter, deps: CliDeps, label: string,
  dflt: string | undefined, validate: (s: string) => string | null, required: boolean,
): Promise<string> {
  for (;;) {
    const hasDflt = dflt !== undefined && dflt !== ''
    const ans = (await p.ask(hasDflt ? `${label} [${dflt}]: ` : `${label}${required ? '（必填）' : ''}: `)).trim()
    const val = ans === '' ? (dflt ?? '') : ans
    if (val === '' && required) { deps.io.err('该项必填，请输入一个值。'); continue }
    const err = validate(val)
    if (err !== null) { deps.io.err(err); continue }
    return val
  }
}

/** 问一个无校验项：空输入收默认。 */
async function askPlain(p: Prompter, label: string, dflt: string): Promise<string> {
  const ans = (await p.ask(`${label} [${dflt}]: `)).trim()
  return ans === '' ? dflt : ans
}

/** 问一个 CSV 项：空输入收默认数组。 */
async function askCsv(p: Prompter, label: string, dflt: readonly string[]): Promise<string[]> {
  const ans = (await p.ask(`${label} [${dflt.join(',')}]: `)).trim()
  return ans === '' ? [...dflt] : csv(ans)
}

/** 交互向导：三组问答收齐 RawInputs（问题顺序固定——目标/边界/节奏；默认值 flag 优先，否则推导）。 */
async function runWizard(deps: CliDeps, flags: InitArgs, env: InitEnv): Promise<RawInputs> {
  const p = env.makePrompter()
  try {
    deps.io.out('[loops init] 交互向导 —— 每问展示推导默认值，直接回车即收默认。')
    // 目标组
    const id = await askValidated(p, deps, '目标 loop id', flags.id, validateId, true)
    const goal = await askValidated(p, deps, '一句话目标（≥10 字符）', flags.goal, validateGoal, true)
    const designDoc = await askPlain(p, '设计文档路径', flags.doc ?? `docs/loops/${id}.md`)
    // 边界组
    const prefixRaw = await askPlain(p, 'change 前缀（none = 不设前缀）', flags.prefix ?? derivePrefix(id))
    const prefix = prefixRaw === 'none' ? null : prefixRaw
    const kind = await askValidated(p, deps, '类型（orchestrator|executor）', flags.kind ?? 'orchestrator', validateKind, false)
    const runner = await askValidated(p, deps, '执行 agent（runner）', flags.runner ?? 'codex', validateRunner, false)
    const gates = await askCsv(p, '复核门阶段（CSV）', flags.gates ?? DEFAULT_HUMAN_GATES)
    const kill = await askCsv(p, '终止判据（CSV）', flags.kill ?? DEFAULT_KILL_CRITERIA)
    // 节奏组
    const risk = await askValidated(p, deps, '风险档（low|medium|high）', flags.risk ?? 'low', validateRisk, false)
    const cadence = await askValidated(p, deps, '节奏 cadence', flags.cadence ?? RISK_CADENCE[risk as LoopRisk], validateCadence, false)
    const phases = await askCsv(p, '阶段（CSV）', flags.phases ?? PHASES)
    return {
      id,
      name: flags.name ?? id,
      goal,
      workflowId: flags.workflow,
      skillBundleId: flags.skillBundle,
      designDoc,
      prefix,
      kind,
      runner,
      gates,
      kill,
      risk,
      cadence,
      phases,
    }
  } finally {
    p.close()
  }
}

/** 错误信封：--json 走 stdout `{ok:false,error}`，否则 stderr `ERROR:`；恒 exit 1。 */
function initFail(deps: CliDeps, json: boolean, msg: string): number {
  if (json) deps.io.out(JSON.stringify({ ok: false, error: msg }))
  else deps.io.err(`ERROR: ${msg}`)
  return 1
}

export function defaultStarterWiringDeps(deps: CliDeps): LoopStarterWiringDeps {
  const skillBundleWiringForRunner = (runner: string) => ({
    isSkillProfileKnown: deps.isSkillProfileKnown,
    resolver: deps.resolver,
    locator: createProductionSkillContentLocator({
      pluginRoot: deps.doctor?.pluginRoot, home: homedir(), runner,
    }),
  })
  return {
    repoRoot: deps.cwd,
    skillBundleWiring: skillBundleWiringForRunner('codex'),
    skillBundleWiringForLoop: (loop) => skillBundleWiringForRunner(loop.runner),
  }
}

function printStarterInitReport(
  deps: CliDeps,
  starter: StarterCompilation,
  report: LoopStarterWiringReport,
): void {
  if (starter.policy === null) {
    deps.io.out(
      `[loops init starter] template=${starter.templateId}@${starter.templateVersion} ` +
      `compile=invalid reason=${starter.compileError ?? 'unknown template compile error'} ` +
      `workflow=${starter.workflowId} skill-bundle=${starter.skillBundleId ?? '(unwired)'}`,
    )
  } else {
    deps.io.out(
      `[loops init starter] template=${starter.templateId}@${starter.templateVersion} ` +
      `goal=${starter.policy.goal} trigger=${starter.policy.trigger.map((item) => item.kind).join(',')} ` +
      `risk=${starter.policy.risk} workflow=${starter.workflowId} ` +
      `recommended-skills=${starter.policy.recommendedSkills.join(',')} ` +
      `skill-bundle=${starter.skillBundleId ?? '(unwired)'}`,
    )
  }
  deps.io.out(
    `  binding=${report.binding.status} wiring=${report.wiring.status} runnable=${String(report.runnable)}` +
    (report.wiring.reason === null ? '' : ` reason=${report.wiring.reason}`),
  )
}

/**
 * `tenon loops init`：起草一个 status:paused 的草稿 loop（向导 or 非交互结构化通道）。
 * 写盘一律走 governance 锁 + 字节 epoch-CAS + atomic writer（env.writeGoverned）：缺文件 →
 * createLoopsYamlText（epoch=ABSENT 防并发首建）；已存在 → appendLoopToYamlText（初读 epoch CAS）。
 * 成功后 best-effort 登记草稿标记；输出登记结果 + 「去 dashboard 审阅批准」指引（--json 走信封）。
 */
export async function cmdInit(
  deps: CliDeps,
  args: string[],
  env: InitEnv = REAL_INIT_ENV,
  starterWiringDeps: LoopStarterWiringDeps = defaultStarterWiringDeps(deps),
): Promise<number> {
  const flags = parseInitArgs(args)
  if (flags.error !== undefined) return initFail(deps, flags.json, flags.error)
  const starter = compileStarter(flags)
  const resolvedFlags: InitArgs = starter === null
    ? flags
    : starter.policy === null
      ? {
          ...flags,
          goal: flags.goal ?? `Resolve unknown starter template "${starter.templateId}" before activation`,
          risk: flags.risk ?? 'low',
        }
      : { ...flags, goal: starter.policy.goal, risk: starter.policy.risk }
  const interactive = !flags.yes && env.isInteractive()

  let raw: RawInputs
  if (interactive) {
    raw = await runWizard(deps, resolvedFlags, env)
  } else {
    const { raw: resolved, missing } = resolveDefaults(resolvedFlags)
    if (resolved === null) {
      return initFail(deps, flags.json,
        `非交互模式缺少必填项：${missing.join(' ')}（agent/CI 需显式提供；或在 TTY 下去掉 --yes 走交互向导）`)
    }
    raw = resolved
  }

  const { entry, error: assembleErr } = assembleEntry(raw, starter)
  if (assembleErr !== null || entry === null) {
    return initFail(deps, flags.json, assembleErr ?? '组装 loop 条目失败')
  }

  // Stage B 返工 #3#4：写盘一律走 governance 锁 + 字节 epoch-CAS + atomic writer（缺文件首建 epoch=ABSENT
  // 防并发首建；已存在追加用初读 epoch），与 admission 复验/level set/server 写方同锁串行，不非治理旁路覆盖。
  const loopsPath = loopsYamlPath(deps.cwd)
  const snap = await env.readSnapshot(deps.cwd)
  if (starter !== null && snap.epoch !== ABSENT_REGISTRY_EPOCH) {
    const current = kernelLoadRegistry('', { readText: () => snap.text })
    const alreadyBound = current.data?.loops.find((loop) => loop.template_id === starter.templateId)
    if (alreadyBound !== undefined) {
      return initFail(
        deps,
        flags.json,
        `starter template "${starter.templateId}" 已绑定 loop "${alreadyBound.id}"；拒绝创建歧义绑定`,
      )
    }
  }
  let writtenText: string | null = null
  const capture = (produced: { text: string | null; error: string | null }): typeof produced => {
    if (produced.text !== null && produced.error === null) writtenText = produced.text
    return produced
  }
  if (snap.epoch === ABSENT_REGISTRY_EPOCH) {
    // 缺文件：整份新建（并发首建 → 锁内 epoch 已非 ABSENT → CAS 拒，等价旧 wx 独占；请重跑走追加路径）
    const res = await env.writeGoverned(
      deps.cwd,
      ABSENT_REGISTRY_EPOCH,
      () => capture(createLoopsYamlText(entry)),
    )
    if (!res.ok) {
      return initFail(deps, flags.json, `写 loops.yaml 失败或被并发首建（${loopsPath}）${res.error ? `：${res.error}` : ''}`)
    }
  } else {
    // 已存在：追加（初读 epoch CAS + atomic；dup id / 坏文本由 appendLoopToYamlText 在锁内当前文本判 → 不落盘）
    const res = await env.writeGoverned(
      deps.cwd,
      snap.epoch,
      (cur) => capture(appendLoopToYamlText(cur, entry)),
    )
    if (!res.ok) {
      return initFail(deps, flags.json, `追加 loops.yaml 失败或 CAS 拒（loops.yaml 在登记期间被并发修改，未落盘，${loopsPath}）${res.error ? `：${res.error}` : ''}`)
    }
  }

  // 草稿标记 best-effort：失败只 WARN，不回滚、不改 exit 0（对齐 init.ts「注册表任何故障只 WARN」铁律）
  try {
    await env.addDraftMark(draftMarksPath(deps.cwd), entry.id)
  } catch (e) {
    deps.io.err(`WARN: 草稿标记登记失败（loop 已落盘，不影响 dashboard 审阅，仅少一枚待审徽章）：${errMsg(e)}`)
  }

  let starterReport: LoopStarterWiringReport | null = null
  if (starter !== null) {
    const loaded = writtenText === null
      ? kernelLoadRegistry(deps.cwd)
      : kernelLoadRegistry('', { readText: () => writtenText })
    if (loaded.data === null || loaded.errors.length > 0) {
      return initFail(
        deps,
        flags.json,
        `starter 已以 paused 落盘，但无法重读 binding：${loaded.errors.join('；') || 'registry 缺失'}`,
      )
    }
    starterReport = await buildLoopStarterWiringReport(starter.templateId, loaded.data.loops, starterWiringDeps)
  }

  if (flags.json) {
    if (starter === null) {
      deps.io.out(JSON.stringify({ ok: true, id: entry.id, path: loopsPath, draft: true }))
    } else if (starterReport === null) {
      return initFail(deps, true, 'starter 已落盘但 wiring report 缺失')
    } else {
      deps.io.out(JSON.stringify({
        ok: true,
        id: entry.id,
        path: loopsPath,
        draft: true,
        status: entry.status,
        template: starter.policy,
        template_error: starter.compileError,
        binding: starterReport.binding,
        wiring: starterReport.wiring,
        runnable: starterReport.runnable,
      }))
    }
  } else {
    deps.io.out(`[loops init] 已登记草稿 loop「${entry.id}」→ ${loopsPath}`)
    if (starter !== null) {
      if (starterReport === null) return initFail(deps, false, 'starter 已落盘但 wiring report 缺失')
      printStarterInitReport(deps, starter, starterReport)
    }
    deps.io.out('已作为草稿（已暂停）登记；打开 dashboard 工作台审阅，批准后启用；预算与自主级别在审阅面调整（升档走毕业制）。')
  }
  return 0
}
