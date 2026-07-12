/**
 * failureDiagnosis（full-install W3）—— AFK 失败成因分类 + 可执行修复命令。纯函数，供 TaskDetail
 * 失败态、ProgressView 失败行与 InboxView（W2）三处复用同一份判定（不在各视图散落第二套猜错逻辑）。
 *
 * 输入 = change.fields.automation_last_error 原文。它由 scheduler classifyFailure 落盘（sanitize 后
 * 的 message）/ lifecycle 同步的 `[AGENT_EXIT] <runner> <exit>` 标记 / runner·docker 抛错串组成，
 * 典型形态：`[AGENT_EXIT] claude 96`、`docker run sandcastle:local failed (exit 125): …`、
 * `未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY …`、`verify: 2 failed · auth.test.ts`。
 *
 * 输出 = { cause, fixCommand }：
 *   · cause 是稳定枚举——人话经 i18n（failure.cause_* / failure.short_*），**不在本层硬编码中文**；
 *   · fixCommand 是可复制终端命令，或 null——无单一可复制命令的成因（docker 未起：平台各异；
 *     agent 非零：无配置类修复，需看日志）返回 null，由 cause 人话承载下一步，不编造假命令。
 *
 * 关键词按「最可执行、最不易误伤」优先级匹配，首命中即返回：
 *   1 missing-credential —— OPENAI_API_KEY / CLAUDE_CODE_OAUTH / CODEX_HOME / 凭证 / authentication…
 *     **刻意不匹配裸 "auth"**：真实 last_error `verify: 2 failed · auth.test.ts` 是验证失败（auth.test.ts
 *     是失败测试文件名），裸 auth 会把它误判成凭证问题。故只认 authentication/unauthorized/401 等明确串。
 *   2 missing-docker（daemon 特征串）—— "cannot connect to the docker daemon" 等。放在 image 前：
 *     daemon-down 抛的 `docker run <image> failed …` 串同时含镜像名，不能被 image 规则抢走。
 *   3 missing-image —— 镜像 / unable to find image / no such image / sandcastle → build.sh。
 *   4 missing-docker（泛 docker）—— 其余提及 docker 的失败。
 *   5 agent-nonzero —— `[AGENT_EXIT]` 标记 / "agent … exit"：agent 真跑过且非零退出。
 *   6 unknown —— 其余（含空串）→ pipeline doctor 兜底（诚实：没识别出成因，先跑就绪诊断）。
 */
export type FailureCause =
  | 'missing-credential'
  | 'missing-image'
  | 'missing-docker'
  | 'agent-nonzero'
  | 'unknown'

export interface FailureDiagnosis {
  cause: FailureCause
  /** 可复制终端修复命令；无单一命令的成因（docker 未起 / agent 非零）为 null。 */
  fixCommand: string | null
}

const CREDENTIAL_RE =
  /OPENAI_API_KEY|CLAUDE_CODE_OAUTH|CODEX_HOME|凭证|credential|authentication|unauthorized|\b401\b/i
const DOCKER_DAEMON_RE =
  /cannot connect to the docker daemon|docker daemon|is the docker daemon running|docker(?:\s*(?:daemon))?\s*(?:未运行|没(?:有)?(?:启动|运行)|not running|isn't running)/i
const IMAGE_RE = /镜像|unable to find image|no such image|manifest unknown|image inspect|sandcastle/i
const DOCKER_RE = /\bdocker\b/i
const AGENT_EXIT_RE = /\[AGENT_EXIT\]|\bagent\b[\s\S]{0,24}(?:exit|退出|非零|non-?zero)/i

/** 把 automation_last_error 原文映射成成因 + 修复命令（纯函数，无副作用，可在任意视图层复用）。 */
export function diagnoseFailure(lastError: string): FailureDiagnosis {
  const s = lastError ?? ''
  if (CREDENTIAL_RE.test(s)) return { cause: 'missing-credential', fixCommand: 'pipeline setup' }
  if (DOCKER_DAEMON_RE.test(s)) return { cause: 'missing-docker', fixCommand: null }
  if (IMAGE_RE.test(s)) return { cause: 'missing-image', fixCommand: 'bash tools/sandcastle/build.sh' }
  if (DOCKER_RE.test(s)) return { cause: 'missing-docker', fixCommand: null }
  if (AGENT_EXIT_RE.test(s)) return { cause: 'agent-nonzero', fixCommand: null }
  return { cause: 'unknown', fixCommand: 'pipeline doctor' }
}
