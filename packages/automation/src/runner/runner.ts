/**
 * 沙箱内 pipeline 驱动 + 结构化握手解析（BACKLOG #29）。
 *
 * 老仓真相源：scheduler/runChange.ts:447-545（parseSandboxReport / findLastOutputTag /
 * unwrapFences）+ sdk/output/extractStructuredOutput.ts（取最后 tag + fence 剥离）+
 * runner/docker/pipeline-afk-run.sh（沙箱内 /pipeline-build → /pipeline-verify → ship）。
 *
 * exec 是注入面：production 绑真 docker exec（IT），单测绑 fake。缺 docker → honest skip（见
 * docker.integration.test.ts）；任何路径不为绿伪造 pass——非零退出真抛错。
 */
import { type PhaseEvent } from '../types.js'

/** 沙箱最后一行打印的结构化握手（老仓 SandboxReport）。 */
export interface SandboxReport {
  readonly verify_result: 'pass' | 'fail'
  readonly build_sha?: string
  readonly branch?: string
  /** 该 run 推进过的相位（build/verify/ship）。 */
  readonly phase_event: PhaseEvent
}

/** 沙箱内命令 exec 面（onLine 供 race.ts 逐行流式；lite 只用 buffered 形态）。 */
export type SandboxExec = (
  cmd: string,
  options?: { onLine?: (line: string) => void },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>

/**
 * 握手缺失 / 畸形 / schema 非法时抛（老仓 StructuredOutputError）。carries rawMatched（最后一个
 * <output> tag 内原文，或 "") 供重试反馈引用。
 */
export class StructuredOutputError extends Error {
  override readonly name = 'StructuredOutputError'
  readonly _tag = 'StructuredOutputError'
  readonly rawMatched: string
  constructor(message: string, rawMatched: string) {
    super(message)
    this.rawMatched = rawMatched
  }
}

/** 取最后一个 <output>...</output> 块（verbose agent 会 emit 多次）。 */
const findLastOutputTag = (stdout: string): string | undefined => {
  const re = /<output>\s*([\s\S]*?)\s*<\/output>/g
  let last: string | undefined
  for (let m = re.exec(stdout); m !== null; m = re.exec(stdout)) last = m[1]
  return last
}

/** 剥 agent 可能包的 ```json / ``` fence。 */
const unwrapFences = (s: string): string => {
  const t = s.trim()
  const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return fence?.[1] !== undefined ? fence[1].trim() : t
}

/**
 * 解析 <output>{...}</output> 握手 —— last-wins、fence-tolerant、schema-validated。
 * 抛 StructuredOutputError（非裸 Error）以便重试 wrapper 区分"可恢复的 output-shape 失败"与真崩。
 */
export const parseSandboxReport = (stdout: string): SandboxReport => {
  const raw = findLastOutputTag(stdout)
  if (raw === undefined) {
    throw new StructuredOutputError('sandbox produced no <output>{...}</output> report', '')
  }
  let parsed: Partial<SandboxReport>
  try {
    parsed = JSON.parse(unwrapFences(raw)) as Partial<SandboxReport>
  } catch (err) {
    throw new StructuredOutputError(`sandbox <output> is not valid JSON: ${String(err)}`, raw)
  }
  if (parsed.verify_result !== 'pass' && parsed.verify_result !== 'fail') {
    throw new StructuredOutputError('sandbox report missing/invalid verify_result (want "pass"|"fail")', raw)
  }
  return {
    verify_result: parsed.verify_result,
    build_sha: parsed.build_sha,
    branch: parsed.branch,
    phase_event: parsed.phase_event ?? 'verify-pass',
  }
}

/** 沙箱内 afk-run 命令（老仓 runner/docker/pipeline-afk-run.sh，全链 #29c）。 */
export const buildAfkRunCommand = (name: string): string => `PIPELINE_AFK=1 pipeline-afk-run ${name}`

/**
 * 跑一个 change 的 build→verify→ship 并回读握手（注入 exec 面）。非零退出 = build/verify 真失败
 * → 抛错（**绝不伪造 pass**）。真 docker 走 IT，缺 docker honest skip。
 */
export const runPipeline = async (exec: SandboxExec, name: string, _signal: AbortSignal): Promise<SandboxReport> => {
  const { stdout, stderr, exitCode } = await exec(buildAfkRunCommand(name))
  if (exitCode !== 0) {
    throw new Error(`pipeline afk-run failed (exit ${exitCode}): ${stderr.slice(0, 200)}`)
  }
  return parseSandboxReport(stdout)
}
