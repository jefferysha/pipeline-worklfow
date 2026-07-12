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

/**
 * 仓库 tools/sandcastle/pipeline-afk-run.sh 现内容的 sha256 —— 镜像 ↔ 仓库脚本的版本对账锚点
 * （真机验收 P1，2026-07-11：现役 sandcastle:local 镜像内置的旧版脚本无 codex/PIPELINE_RUNNER
 * 分支，runner: codex 被静默降级走确定性路径并「成功」结算 paused，exit 96 诚实报错路径不可达，
 * 而镜像与仓库脚本此前没有任何对账机制，漂移完全不可见）。
 *
 * 同步纪律（两道闸，缺一不可）：
 *   ① runner.test.ts 的 sha 同步测试把本常量与仓库脚本现内容钉死——改脚本不 bump 常量 → 单测红；
 *   ② buildAfkRunCommand 把本常量嵌进 run 前置守卫——镜像内脚本 sha 不符 → exit 95 + 重建指引，
 *      经 ports.ts runWork 非零退出 throw 流进 automation_last_error，绝不带陈旧脚本静默跑。
 * bump 方式：shasum -a 256 tools/sandcastle/pipeline-afk-run.sh。bump 后旧镜像自动 fail-loud，
 * 重建入口 tools/sandcastle/build.sh（构建完自验镜像内 sha，见该脚本）。
 */
export const AFK_RUN_SCRIPT_SHA256 = 'bfff5965e29f826a1489147d923dbc64075cf49025e916fdea0afda64a166706'

/** 对账失败的沙箱退出码（与脚本内 96=codex CLI 缺失、97=tap proxy 未起同段的硬错误码位）。 */
export const AFK_RUN_DRIFT_EXIT_CODE = 95

/**
 * run 前置对账守卫（沙箱内执行，busybox sha256sum/grep 皆为 alpine 自带 applet）：镜像内
 * /usr/local/bin/pipeline-afk-run 的 sha256 必须等于 AFK_RUN_SCRIPT_SHA256，否则打清晰 stderr
 * 并 exit 95——绝不让陈旧脚本静默跑（sha256sum 输出格式 "<hash>  <path>"，锚 "^<hash> " 两端皆容）。
 */
const AFK_RUN_DRIFT_GUARD =
  `sha256sum /usr/local/bin/pipeline-afk-run 2>/dev/null | grep -q "^${AFK_RUN_SCRIPT_SHA256} "` +
  ` || { echo "sandcastle 镜像内 pipeline-afk-run 与仓库 tools/sandcastle/pipeline-afk-run.sh 不一致（镜像陈旧或脚本已更新未重建）——请重建镜像：tools/sandcastle/build.sh" >&2; exit ${AFK_RUN_DRIFT_EXIT_CODE}; }`

/**
 * 沙箱内 afk-run 命令（老仓 runner/docker/pipeline-afk-run.sh，全链 #29c）。整条经
 * container.ts::buildExecArgs 的 `sh -c` 单参执行，故守卫与真命令可用 `;` 串接，守卫恒在前。
 *
 * v5 T20 runner 分派：runner === 'codex' → 注入 PIPELINE_RUNNER=codex，沙箱脚本据此改起
 * codex exec 无头会话（codex CLI 惯例；脚本内 CLI 缺失时打清晰错误并非零退出——错误经
 * ports.ts runWork 的 throw 流进 scheduler 写 automation_last_error，绝不静默）。其余值
 * （缺省 / claude-code / 历史自由值 cron 等）一律走既有 Claude 缺省路径，命令零变化。
 */
export const buildAfkRunCommand = (name: string, runner?: string): string =>
  runner === 'codex'
    ? `${AFK_RUN_DRIFT_GUARD}; PIPELINE_AFK=1 PIPELINE_RUNNER=codex pipeline-afk-run ${name}`
    : `${AFK_RUN_DRIFT_GUARD}; PIPELINE_AFK=1 pipeline-afk-run ${name}`

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
