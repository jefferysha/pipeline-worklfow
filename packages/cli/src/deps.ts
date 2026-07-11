/**
 * cli 依赖注入面 —— 命令逻辑全部是接受 CliDeps 的纯函数（CONTRACT §4 agent:cli）。
 * store/flow 按 types.ts 契约注入；测试全 mock，绝不 import kernel 实现。
 */
import type { FlowEngine, GuardContext, HistoryWriter, StateStore } from '@pipeline-lite/kernel'

export interface GateMarkerInfo {
  kind: 'confirm' | 'review' | 'interaction'
  /** marker 年龄毫秒（now - mtime） */
  ageMs: number
  /** marker 原文（transition 落的三行格式：相位\n指引\nchange 名，老内核同款） */
  raw: string
}

/**
 * doctor 命令的环境/fs 探针面（BACKLOG #26b，全部由 main.ts 落地、测试全 mock）。
 * 探针只回答事实（存在/可执行/版本），绿黄红裁决是 cmdDoctor 的职责。
 */
export interface DoctorProbes {
  /** process.version 形如 'v22.1.0' */
  nodeVersion: () => string
  /** `git --version` 能跑通（gitHeadSha / build_sha 记录的前提） */
  gitAvailable: () => Promise<boolean>
  /** 插件仓根（hooks/、templates/、tools/ 的定位锚） */
  pluginRoot: string
  /** templates/manifest.yaml 定位+解析试跑：成功 → null，失败 → 错误消息 */
  manifestError: () => string | null
  fileExists: (absPath: string) => boolean
  fileExecutable: (absPath: string) => boolean
  dirExists: (absPath: string) => boolean
  /** 环境变量读取（PIPELINE_AFK 旁路检测用） */
  env: (name: string) => string | undefined
  /** 用户 settings 是否已把 statusline.sh 接入 statusLine */
  statuslineConfigured: () => boolean
  /** 子进程跑 tools/verify-skills.sh；spawn 失败也折算为非 0 code */
  runVerifySkills: () => Promise<{ code: number; output: string }>
  /** tap 流量代理状态（BACKLOG #34e：敏感能力 doctor 明示）。main.ts 注入 @pipeline-lite/tap tapStatus */
  tapStatus?: () => { intercepting: boolean; captureEnabled: boolean; message: string }
}

export interface CliIO {
  /** 写一行到 stdout（实现负责补 '\n'） */
  out(line: string): void
  /** 写一行到 stderr（实现负责补 '\n'） */
  err(line: string): void
}

export interface CliDeps {
  store: StateStore
  flow: FlowEngine
  /** 项目根：change 定位在 <cwd>/openspec/changes/<name>/ */
  cwd: string
  io: CliIO
  /** ISO8601 UTC 注入时钟（CONTRACT §5.6：业务码禁止散落 new Date()） */
  clock: () => string
  /** 枚举 changesRoot 下的活跃 change 目录名（不含 archive 目录）；main.ts 用 fs 实现 */
  listChanges: (changesRoot: string) => Promise<string[]>
  /**
   * transition 成功后写 openspec/changes/<name>/.breadcrumb（CONTRACT §5.4，
   * hook shim 只 cat 该缓存）。best-effort：失败仅 WARN，不影响已完成的转换。
   */
  writeBreadcrumb?: (changeDir: string, content: string) => Promise<void>
  /** lite 历史 .pipeline-history.jsonl appender（CONTRACT §1）。best-effort。 */
  history?: HistoryWriter
  /**
   * init 成功后把 repoRoot 登记进机器级项目注册表 ~/.claude/pipeline-projects.json
   * （v5 T2 决策 D：dashboard 项目自动发现）。best-effort：任何注册表故障（损坏/不可写）
   * 只 WARN，绝不影响 init exit 0。main.ts 用 kernel registerProjectRoot 落地。
   */
  registerProject?: (repoRoot: string) => Promise<void>
  /** 读 .pipeline-history.jsonl 原文（缺失 → 空串）。import 幂等哨兵检查用 */
  readHistoryRaw?: (changeDir: string) => Promise<string>
  /** 插件版本（= .claude-plugin/plugin.json 版本；sync 的 cliVersion 真相源）。main.ts 注入 */
  pluginVersion?: string
  /** 读 installed_plugins.json 文本（缺失 → undefined）。sync upgrade-channel 用；kernel 不碰真文件 */
  readInstalledPlugins?: () => Promise<string | undefined>
  /**
   * 读项目根的三门 marker（缺失 → 不出现在数组里）。main.ts 用 fs 实现；
   * 新鲜判定（GATE_FRESH_MS）是 inbox 命令的职责，这里只报原始年龄。
   */
  readGateMarkers?: () => Promise<GateMarkerInfo[]>
  /**
   * v6 T2：机器级 secrets 存储（~/.claude/pipeline-secrets.json）读成 env 形状，喂 afk run 的
   * hostEnv 合并（宿主 env 显式非空 > 文件值，沿用 sdk「显式>文件」装配惯例；空串 env 视同缺席，
   * 不吃掉文件值）。best-effort：未注入/读失败 → {}，行为与接线前完全一致（fail-open，不阻断 run）。
   * main.ts 用 kernel secretsPath(homedir())+readSecrets 落地；值不进日志（同 dockerRunChange 纪律）。
   */
  readSecretsEnv?: () => Promise<Record<string, string>>
  /**
   * `git rev-parse HEAD` 的 stdout（trim 后；非 git 仓 → 空串）。
   * 对齐老内核 build-complete 的 `$(git rev-parse HEAD 2>/dev/null || echo "")` 口径：
   * 失败也取 stdout——unborn 仓会捕获到字面 "HEAD"（T6 实测怪癖，oracle parity 需要）。
   */
  gitHeadSha?: () => Promise<string>
  /**
   * 进入 review 相位（manifest.reviewPhases）时写 <cwd>/.pipeline-pending-review 门 marker
   * （老内核 state-transition.sh 语义：三行 = 相位\n指引\nchange 名）。best-effort。
   */
  writeReviewMarker?: (content: string) => Promise<void>
  /**
   * check 命令的 guard 文件面注入（BACKLOG #12 guard 全量校验面）：按 change 名构造
   * GuardContext——fileExists/fileNonempty/readFile/dirExists/changeArchived 相对 cwd 解析，
   * changeDirRel=openspec/changes/<name>，automationRunner 读 PIPELINE_AUTOMATION_RUNNER。
   * 缺省 undefined = guardCheck 纯字段 lite 面（文件类检查静默跳过，见 kernel GUARD-RULES.md §7.2）。
   */
  guardCtx?: (name: string) => GuardContext
  /**
   * `pipeline doctor` 健康面探针（BACKLOG #26b）。缺省 undefined = 未装配，
   * doctor 命令直接报错 exit 1（doctor 本身不允许静默降级——它就是降级的观测者）。
   */
  doctor?: DoctorProbes
  /**
   * `-- <command...>` 透传参数（BACKLOG #34-wire，`pipeline tap start`用）。main.ts 在调用
   * commander 之前从原始 process.argv 里手工切出，绕开 commander 自身的一个真实 bug：
   * variadic `[args...]` 捕获里的裸 `--`，若前一个 token 是普通位置参数（不以 - 开头），会被
   * commander 静默吞掉；若前一个 token 是形如 `--foo` 的选项样 token 则保留——这是 commander
   * 内部状态机的真实缺陷（已用受控 argv 数组穷举验证），不是本项目误用。缺省 undefined = 无
   * `--` 透传段。
   */
  passthroughArgv?: string[]
}

/** 统一错误消息提取（避免各命令散落 String(e) 口径） */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
