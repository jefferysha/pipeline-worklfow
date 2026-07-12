/**
 * failureDiagnosis（full-install W3）—— AFK 失败成因分类 + 可执行修复命令。纯函数，供 TaskDetail
 * 失败态、ProgressView 失败行与 InboxView（W2）三处复用同一份判定（不在各视图散落第二套猜错逻辑）。
 *
 * 输入 = change.fields.automation_last_error 原文。它由 scheduler classifyFailure 落盘（sanitize 后
 * 的 message）/ lifecycle createAgentExitWatch 改写句 / runner·docker 抛错串组成。**注意 agent 非零退出
 * 不落裸标记**：lifecycle（lifecycle.ts:211 createAgentExitWatch）把沙箱 `[AGENT_EXIT] <runner> <exit>`
 * 行改写成含「凭证」的中文句再落盘，形如 `codex agent 非零退出（exit 96）：可能凭证失效或 codex 自身报错，
 * 详见 agent 日志`——该句含「凭证」→ 命中下方优先级1 missing-credential（凭证为主因、原文保留可续诊），
 * 生产主路径**不**走 agent-nonzero。典型形态：`codex agent 非零退出（exit 96）：…可能凭证失效…`、
 * `docker run sandcastle:local failed (exit 125): …`、`未检测到 codex 凭证：宿主机需设 OPENAI_API_KEY …`、
 * `verify: 2 failed · auth.test.ts`。
 *
 * 输出 = { cause, fixCommand }：
 *   · cause 是稳定枚举——人话经 i18n（failure.cause_* / failure.short_*），**不在本层硬编码中文**；
 *   · fixCommand 是可复制终端命令，或 null——无单一可复制命令的成因（docker 未起：平台各异；
 *     agent 非零：无配置类修复，需看日志）返回 null，由 cause 人话承载下一步，不编造假命令。
 *
 * 关键词按「最可执行、最不易误伤」优先级匹配，首命中即返回（Bug5 修复后的顺序 = 从最不易与他类
 * 混淆的基础设施信号往下收敛）：
 *   1 network —— ENOTFOUND / getaddrinfo / EAI_AGAIN / 网络不可达 等 DNS/连通失败。放最前：
 *     `ENOTFOUND registry-1.docker.io` 此前被泛 \bdocker\b 吞成 missing-docker，实为网络错。
 *   2 conflict —— git 自动合并/变基冲突（merge conflict / CONFLICT / fix conflicts / 冲突）。
 *     刻意不认裸 "merge"：`merge timed out` 归 timeout，不被抢。
 *   3 timeout —— timed out / timeout / 超时（瞬态，无配置修复命令）。
 *   4 missing-docker（daemon 特征串）—— "cannot connect to the docker daemon" 等。放在 image 前：
 *     daemon-down 抛的 `docker run <image> failed …` 串同时含镜像名，不能被 image 规则抢走。
 *   5 missing-image（含 registry 鉴权）—— 镜像 / unable to find image / no such image / manifest
 *     unauthorized / pull access denied / docker pull / sandcastle(收窄) → build.sh。置于 credential
 *     之前：`docker pull … unauthorized` 是 registry 鉴权（叫去 build/login），不是缺 runner 凭证。
 *   6 missing-credential —— OPENAI_API_KEY / CLAUDE_CODE_OAUTH / CODEX_HOME / 凭证 / authentication /
 *     unauthorized。**刻意不匹配裸 "auth"**：`verify: 2 failed · auth.test.ts` 是验证失败（测试文件名），
 *     裸 auth 会误判成凭证问题；亦**刻意不匹配裸 401**（栈行号 `:401:` / 第三方 HTTP 401 状态码不该判凭证，
 *     真凭证失败一般同时含 authentication/键名，仍命中）。亦是**真实 agent 非零退出的归宿**：lifecycle
 *     改写句含「凭证」→ 首命中于此（见上方输入说明）。
 *   7 missing-docker（泛 docker）—— 其余提及 docker 的失败（网络类已在 1 拦掉）。
 *   8 agent-nonzero —— 裸 `[AGENT_EXIT]` 标记 / "agent … exit"。**防御性兜底**：生产主路径不经此——
 *     真实 agent 非零退出已被 lifecycle 改写成含「凭证」句、于优先级6 归 missing-credential（见上）；本分支
 *     只兜住裸标记（万一改写逻辑变动或有其它裸标记来源），保留不删以防未来回归。
 *   9 unknown —— 其余（含空串）→ pipeline doctor 兜底（诚实：没识别出成因，先跑就绪诊断）。
 */
export type FailureCause =
  | 'missing-credential'
  | 'missing-image'
  | 'missing-docker'
  | 'conflict'
  | 'timeout'
  | 'network'
  | 'agent-nonzero'
  | 'unknown'

export interface FailureDiagnosis {
  cause: FailureCause
  /** 可复制终端修复命令；无单一命令的成因（docker 未起 / agent 非零 / 冲突 / 超时 / 网络）为 null。 */
  fixCommand: string | null
}

// ── Bug5 修复：补 conflict/timeout/network 三类 + 收窄 IMAGE/401 + 调整规则优先级。──
// DNS/网络解析类（放最前）：ENOTFOUND registry-1.docker.io 等此前被泛 \bdocker\b 吞成 missing-docker，
// 实为网络错。刻意只认 DNS 解析/网络不可达特征串，不含「cannot connect」——那是 docker daemon socket
// 错误的措辞，留给 DOCKER_DAEMON_RE。
const NETWORK_RE =
  /ENOTFOUND|EAI_AGAIN|ENETUNREACH|getaddrinfo|could ?n[o']t resolve host|temporary failure in name resolution|network is unreachable|网络不可达|无法解析(?:主机|域名)/i
// 冲突类：git 自动合并/变基冲突。刻意不认裸 "merge"：`merge timed out` 归 timeout，不被这里抢走。
const CONFLICT_RE =
  /merge conflict|\bCONFLICT\b|automatic merge failed|fix conflicts|needs? merge|合并冲突|存在冲突|冲突未解决/i
// 超时类：瞬态，无配置修复命令。
const TIMEOUT_RE = /timed out|time ?out|操作超时|请求超时|\b超时\b/i
const DOCKER_DAEMON_RE =
  /cannot connect to the docker daemon|docker daemon|is the docker daemon running|docker(?:\s*(?:daemon))?\s*(?:未运行|没(?:有)?(?:启动|运行)|not running|isn't running)/i
// 镜像类（含 registry 鉴权）：置于 CREDENTIAL 之前——`docker pull … unauthorized`/`pull access denied`
// 是 registry 鉴权（叫去 build/login），此前被 CREDENTIAL 的 unauthorized 最前截胡误判成缺凭证。
// sandcastle 收窄：`(?!\.)` 排除 `sandcastle.test.ts`/`sandcastle.spec.ts` 等测试文件名（真镜像引用
// 恒为 `sandcastle:tag` 冒号形，或后接空格/句末，不受影响）。
const IMAGE_RE =
  /镜像|unable to find image|no such image|manifest unknown|manifest unauthorized|image inspect|pull access denied|docker\s+pull|denied: requested access|\bsandcastle(?!\.)/i
// 凭证类：收窄——删裸 `\b401\b`（栈行号 `:401:` / 第三方 HTTP 401 状态码不再误判；真凭证失败一般同时
// 含 authentication/unauthorized/凭证/键名，仍命中）；unauthorized 保留但已被上面 IMAGE_RE 的 registry
// 上下文先行拦截。
const CREDENTIAL_RE =
  /OPENAI_API_KEY|CLAUDE_CODE_OAUTH|CODEX_HOME|凭证|credential|authentication|unauthorized/i
const DOCKER_RE = /\bdocker\b/i
const AGENT_EXIT_RE = /\[AGENT_EXIT\]|\bagent\b[\s\S]{0,24}(?:exit|退出|非零|non-?zero)/i

/**
 * 把 automation_last_error 原文映射成成因 + 修复命令（纯函数，无副作用，可在任意视图层复用）。
 * 优先级（首命中即返回）：network → conflict → timeout → docker-daemon → image(含 registry 鉴权)
 * → credential → 泛 docker → agent-nonzero → unknown。顺序即误判防护：见上方各 RE 注释。
 */
export function diagnoseFailure(lastError: string): FailureDiagnosis {
  const s = lastError ?? ''
  if (NETWORK_RE.test(s)) return { cause: 'network', fixCommand: null }
  if (CONFLICT_RE.test(s)) return { cause: 'conflict', fixCommand: null }
  if (TIMEOUT_RE.test(s)) return { cause: 'timeout', fixCommand: null }
  if (DOCKER_DAEMON_RE.test(s)) return { cause: 'missing-docker', fixCommand: null }
  if (IMAGE_RE.test(s)) return { cause: 'missing-image', fixCommand: 'bash tools/sandcastle/build.sh' }
  if (CREDENTIAL_RE.test(s)) return { cause: 'missing-credential', fixCommand: 'pipeline setup' }
  if (DOCKER_RE.test(s)) return { cause: 'missing-docker', fixCommand: null }
  if (AGENT_EXIT_RE.test(s)) return { cause: 'agent-nonzero', fixCommand: null }
  return { cause: 'unknown', fixCommand: 'pipeline doctor' }
}
