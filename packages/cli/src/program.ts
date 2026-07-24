/**
 * commander 装配：CONTRACT §3 全表命令 → 纯函数命令模块。
 * 命令函数返回 exit code；非 0 以 CliExit 抛出，由 main.ts 落到 process.exitCode
 * （commander 自身的 usage error 经 exitOverride 也抛出，main 统一映射 exit 1）。
 */
import { Command } from 'commander'
import type { CliDeps } from './deps.js'
import { cmdCheck } from './commands/check.js'
import { cmdDashboard, type DashboardOpts, type DashboardRuntime } from './commands/dashboard.js'
import { cmdDoctor } from './commands/doctor.js'
import { cmdCas, cmdGet, cmdSet, cmdSetMany } from './commands/fields.js'
import { cmdArtifactRegister } from './commands/artifact.js'
import {
  cmdDocumentInit,
  cmdDocumentMigrateDelta,
  cmdDocumentRead,
  cmdDocumentRecord,
  cmdDocumentStatus,
} from './commands/document.js'
import { cmdImport } from './commands/import.js'
import { cmdInbox } from './commands/inbox.js'
import { cmdAdvance } from './commands/advance.js'
import { cmdAfk } from './commands/afk.js'
import { cmdChannel } from './commands/channel.js'
import { cmdGenRouterSh } from './commands/gen-router.js'
import { cmdHandoff } from './commands/handoff.js'
import { cmdInit, type InitCmdOpts } from './commands/init.js'
import { cmdLoops } from './commands/loops.js'
import { cmdMem } from './commands/mem.js'
import { cmdScaffold } from './commands/scaffold.js'
import { cmdSession } from './commands/session.js'
import { cmdSetup, type SetupOpts } from './commands/setup.js'
import { cmdUpdate, type UpdateOpts } from './commands/update.js'
import { cmdRuntime, type RuntimeCommandOpts } from './commands/runtime.js'
import { cmdSpec } from './commands/spec.js'
import { cmdSync } from './commands/sync.js'
import { cmdTap } from './commands/tap.js'
import { cmdTask } from './commands/task.js'
import { cmdUninstall } from './commands/uninstall.js'
import { cmdList, cmdStatus } from './commands/status.js'
import { cmdTransition } from './commands/transition.js'
import { cmdReview } from './commands/review.js'
import { cmdInternalSkillGate } from './commands/internalSkillGate.js'
import { cmdInternalConstraintGate } from './commands/internalConstraintGate.js'
import { cmdInternalCodexJsonl } from './commands/internalCodexJsonl.js'
import { cmdInternalCodexSkillReceipt } from './codexSkillReceipt.js'
import { cmdMigrateWorkflow } from './commands/migrateWorkflow.js'
import { cmdStateProjection } from './commands/state-projection.js'
import { cmdTriage, type TriageCommandRuntime } from './commands/triage.js'
import {
  cmdTracksCreate,
  cmdTracksDelete,
  cmdTracksList,
  cmdTracksShow,
  cmdTracksUpdate,
  type TracksCreateOpts,
  type TracksUpdateOpts,
} from './commands/tracks.js'

export class CliExit extends Error {
  constructor(public readonly code: number) {
    super(`exit ${code}`)
  }
}

function bail(code: number): void {
  if (code !== 0) throw new CliExit(code)
}

const stripNl = (s: string): string => s.replace(/\n$/, '')

export interface ProgramRuntimes {
  readonly triage?: TriageCommandRuntime
  /** Injectable only for command tests; production resolves the installed plugin root. */
  readonly dashboard?: DashboardRuntime
}

export function buildProgram(deps: CliDeps, runtimes: ProgramRuntimes = {}): Command {
  const program = new Command('pipeline')
  program
    .description('pipeline-lite 状态机 CLI（CONTRACT §3）')
    .exitOverride()
    .configureOutput({
      writeOut: (s) => deps.io.out(stripNl(s)),
      writeErr: (s) => deps.io.err(stripNl(s)),
    })

  program
    .command('init <name>')
    .description('初始化 change（stdout 无输出，路径信息走 stderr）')
    // track/preset 非 requiredOption：缺省时 TTY 下走交互向导补齐、非交互 fail-loud（见 cmdInit）；
    // 若用 requiredOption，commander 会抢在 action 前就报错，向导没机会跑。
    .option('--track <track>', 'chat | simple | pm | frontend | backend | free | custom')
    .option('--preset <preset>', 'full | hotfix | tweak')
    .option('--user <user>', 'created_by')
    .option('--workflow <workflow>', '自定义 workflow 名（.pipeline/workflows/<name>.yaml），缺省 default')
    .action(async (name: string, opts: InitCmdOpts) => bail(await cmdInit(deps, name, opts)))

  program
    .command('setup [sub]')
    .description('安装完整 pipeline：必须选择一个宿主（如 --codex）；不会同时修改 Codex 与 Claude')
    .option('--codex', '安装/验证 Codex 原生插件')
    .option('--claude', '安装/验证 Claude 原生插件')
    .option('--cursor', '部署 Cursor adapter')
    .option('--gemini', '部署 Gemini adapter')
    .option('--copilot', '部署 Copilot adapter')
    .option('--pi', '部署 Pi adapter')
    .option('--devin', '部署 Devin adapter')
    .option('--zed', '部署 Zed adapter')
    .option('--aider', '部署 Aider adapter')
    .option('--continue', '部署 Continue adapter')
    .option('--cline', '部署 Cline adapter')
    .option('--amp', '部署 Amp adapter')
    .option('--target <dir>', '非原生 adapter 的项目目标目录（缺省当前目录）')
    .option('--auto-update', '为所选原生宿主启用每日一次的自动升级检查')
    .option('--dry-run', '仅打印所选宿主安装计划，不写文件、不执行 adapter 或 marketplace 操作')
    .option('-y, --yes', '跳过兼容 skills/setup 的 y/N 确认位')
    .action(async (sub: string | undefined, opts: SetupOpts) => bail(await cmdSetup(deps, sub, opts)))

  program
    .command('update')
    .description('刷新一个已安装的原生 pipeline 插件；升级后请新开会话加载 skills 和 hooks')
    .option('--codex', '更新 Codex marketplace 中的 pipeline-lite')
    .option('--claude', '更新 Claude marketplace 中的 pipeline-lite')
    .option('--cursor', '从当前已更新的包重新部署 Cursor adapter')
    .option('--gemini', '从当前已更新的包重新部署 Gemini adapter')
    .option('--copilot', '从当前已更新的包重新部署 Copilot adapter')
    .option('--pi', '从当前已更新的包重新部署 Pi adapter')
    .option('--devin', '从当前已更新的包重新部署 Devin adapter')
    .option('--zed', '从当前已更新的包重新部署 Zed adapter')
    .option('--aider', '从当前已更新的包重新部署 Aider adapter')
    .option('--continue', '从当前已更新的包重新部署 Continue adapter')
    .option('--cline', '从当前已更新的包重新部署 Cline adapter')
    .option('--amp', '从当前已更新的包重新部署 Amp adapter')
    .option('--target <dir>', '非原生 adapter 的项目目标目录（缺省当前目录）')
    .option('--dry-run', '仅打印升级计划，不执行 marketplace 或 adapter 操作')
    .option('-y, --yes', '供自动更新调用的非交互确认')
    .option('--auto', '由已明确启用的自动更新任务调用（不改变用户的 opt-in 状态）')
    .action(async (opts: UpdateOpts) => bail(await cmdUpdate(deps, opts)))

  program
    .command('runtime <sub>')
    .description('查看 managed runtime，或仅回滚到上一份完整校验通过的 release')
    .option('--rollback', '仅 runtime repair 使用：切换到上一份已验证 release')
    .option('--json', '机器可读输出')
    .action(async (sub: string, opts: RuntimeCommandOpts) => bail(await cmdRuntime(deps, sub, opts)))

  program
    .command('dashboard')
    .description('启动插件内置的单一 dashboard SPA/API 入口（默认 127.0.0.1:18765）')
    .option('--port <port>', '覆盖监听端口（例如旧端口 8765）')
    .option('--background', '以受管后台服务启动，并等待本机健康检查')
    .option('--open', '健康检查通过后自动打开本机 dashboard（隐含 --background）')
    .option('--dry-run', '验证已发布 dashboard 资产并打印启动计划，不启动 server')
    .action(async (opts: DashboardOpts) => bail(await cmdDashboard(deps, opts, runtimes.dashboard)))

  program
    .command('get <name> <field>')
    .description('读字段（stdout: 裸值；字段缺失/未知 → 空行 + exit 0）')
    .action(async (name: string, fieldName: string) => bail(await cmdGet(deps, name, fieldName)))

  program
    .command('set <name> <field> <value>')
    .description('写字段（无输出；四闸拒写 exit 1）')
    .action(async (name: string, fieldName: string, value: string) =>
      bail(await cmdSet(deps, name, fieldName, value)))

  program
    .command('set-many <name> <kv...>')
    .description('多字段原子写 key=value ...（无输出）')
    .action(async (name: string, kv: string[]) => bail(await cmdSetMany(deps, name, kv)))

  program
    .command('cas <name> <field> <expect> <next>')
    .description('compare-and-set（无输出；不匹配 exit 3）')
    .action(async (name: string, fieldName: string, expect: string, next: string) =>
      bail(await cmdCas(deps, name, fieldName, expect, next)))

  // ── artifact：受 artifact 契约约束的单字段写（G2 P5）——Commander 真子命令树（同 tracks 装配惯例，
  // exitOverride/configureOutput 由父命令继承；--producer 缺失 = usage error → main 映射 exit 1）。
  const artifact = program
    .command('artifact')
    .description('artifact 登记：register <change> <field> <path> --producer <skill-id>（受 declaration+producer 校验约束的单字段写）')
    .action(() => {
      deps.io.err('用法：pipeline artifact register <change> <field> <path> --producer <skill-id>')
      bail(1)
    })
  artifact
    .command('register <change> <field> <path>')
    .description('登记一条 artifact：校验当前 step/track 的 declaration + producer 具体 skill，锁内原子写字段（成功静默 exit 0；任一校验不过 exit 1、state 不变）')
    .requiredOption('--producer <skill-id>', '产出该 artifact 的具体 skill id（须命中当前 step/track 有效 skill 集的某个具体 alternative；整个 a|b token 非法）')
    .action(async (change: string, field: string, path: string, opts: { producer: string }) =>
      bail(await cmdArtifactRegister(deps, change, field, path, opts.producer)))

  const document = program
    .command('document')
    .description('OpenSpec 文档证据：init / record / migrate-delta / read / status')
    .action(() => {
      deps.io.err('用法：pipeline document init|record|migrate-delta|read|status <change> ...')
      bail(1)
    })
  document
    .command('init <change>')
    .description('为既有受治理 Change 创建 .pipeline-documents.json（新建 Change 已自动创建）')
    .action(async (change: string) => bail(await cmdDocumentInit(deps, change)))
  document
    .command('record <change> <kind> <path>')
    .description('登记当前 phase 产出或允许更新的文档和实际 Skill 调用证据；旧 Change 可显式 --backfill 首次补登记前序文档')
    .requiredOption('--producer <skill-id>', '实际生成该文档的具体 skill id')
    .option('--backfill', '仅升级旧 Change 时首次补登记此前 phase 的未登记文档；不得覆盖已有 record，仍须有真实 skill 证据')
    .action(async (change: string, kind: string, path: string, opts: { producer: string; backfill?: boolean }) =>
      bail(await cmdDocumentRecord(deps, change, kind, path, opts.producer, opts.backfill === true)))
  document
    .command('migrate-delta <change> <legacy-path> <canonical-path>')
    .description('显式迁移一个旧 delta record；仅当 canonical 文件与旧 digest 完全一致时原子替换，可幂等重试')
    .action(async (change: string, legacyPath: string, canonicalPath: string) =>
      bail(await cmdDocumentMigrateDelta(deps, change, legacyPath, canonicalPath)))
  document
    .command('read <change> <kind>')
    .description("登记当前 phase 已读取文档（kind 可为 'all'）")
    .action(async (change: string, kind: string) => bail(await cmdDocumentRead(deps, change, kind)))
  document
    .command('status <change>')
    .description('显示文档产物、内容摘要和当前 phase 的读取收据（不完整 exit 2）')
    .option('--json', 'JSON 输出')
    .action(async (change: string, opts: { json?: boolean }) =>
      bail(await cmdDocumentStatus(deps, change, opts.json === true)))

  program
    .command('transition <name> <event>')
    .description('状态机转换（stdout 无输出，[TRANSITION] 走 stderr；非法/未知事件 exit 1）')
    .action(async (name: string, event: string) => bail(await cmdTransition(deps, name, event)))

  program
    .command('review <sub> [name]')
    .description('review 出口确认：request <change> --event <event>（请求 review）/ acknowledge <change> [--delegated]（写精确 receipt）')
    .option('--event <event>', 'request 时绑定的确切 transition event；多出口 review step 必填')
    .option('--delegated', '仅用户已明确委托当前 Change 连续执行时，按该委托写审计化 review receipt')
    .action(async (sub: string, name: string | undefined, opts: { event?: string; delegated?: boolean }) =>
      bail(await cmdReview(deps, sub, name, opts)))

  program
    .command('check <name>')
    .description('guard 前置校验（人读报告；不过 exit 2）')
    .action(async (name: string) => bail(await cmdCheck(deps, name)))

  program
    .command('advance <name>')
    .description('auto-transition 中间档：guard 全绿自动推进，撞三门/终态/guard 不过即停（HITL，D12>Comet）')
    .option('--max-steps <n>', '防失控保险丝（默认 12）', (v: string) => parseInt(v, 10))
    .option('--dry-run', '只报计划不推进')
    .option('--through-gates', '放行复核相位（confirm/interaction 硬门仍不跨越）')
    .action(async (name: string, opts: { maxSteps?: number; dryRun?: boolean; throughGates?: boolean }) =>
      bail(await cmdAdvance(deps, name, opts)))

  program
    .command('handoff <name>')
    .description('相位 handoff 上下文压缩（对标 Comet CONTEXT-COMPRESSION，D11）')
    .option('--phase <p>', '覆写相位（默认当前相位）')
    .option('--json', 'JSON 输出（含压缩率）')
    .action(async (name: string, opts: { phase?: string; json?: boolean }) =>
      bail(await cmdHandoff(deps, name, opts)))

  program
    .command('import <name>')
    .description('老仓 change 历史区 → .pipeline-history.jsonl（--strip 同时清理 YAML 历史节）')
    .option('--strip', '导入后从 .pipeline.yaml 移除历史节（其余尾内容保留）')
    .action(async (name: string, opts: { strip?: boolean }) => bail(await cmdImport(deps, name, opts)))

  program
    .command('doctor')
    .description('统一健康面：哪些保障此刻真的在生效/已静默降级（exit 1=有红灯）')
    .option('--json', 'JSON 输出（schema 稳定）')
    .action(async (opts: { json?: boolean }) => bail(await cmdDoctor(deps, opts)))

  program
    .command('task <sub> [args...]')
    .description('task lifecycle：add-dep / remove-dep <name> <dep> · children / cascade / canonical <name>')
    .option('--json', 'JSON 输出（children / canonical）')
    .action(async (sub: string, args: string[], opts: { json?: boolean }) =>
      bail(await cmdTask(deps, sub, opts.json ? [...args, '--json'] : args)))

  program
    .command('scaffold <sub> [args...]')
    .description('Trellis parity：scaffold 按类型铺分层空文档集 · resolve-workflow 多 id 解析（D2/B16）')
    .allowUnknownOption()
    .action(async (sub: string, args: string[]) => bail(await cmdScaffold(deps, sub, args)))

  program
    .command('spec <sub> [args...]')
    .description('living-spec：specs · set-spec-scope <cap> [scope] · inject-jsonl <cap> [agent]')
    .option('--json', 'JSON 输出（specs）')
    .action(async (sub: string, args: string[], opts: { json?: boolean }) =>
      bail(await cmdSpec(deps, sub, opts.json ? [...args, '--json'] : args)))

  program
    .command('session <sub> [args...]')
    .description('session：activate <name> [--continuous] [--host-session <id>] · route-context <name> [--json]')
    .option('--json', 'JSON 输出（route-context）')
    .option('--continuous', '仅 activate：绑定当前 Change 的持续交互授权')
    .option('--host-session <id>', '仅 activate：绑定原生 host session，供 dashboard 判断普通会话是否仍在执行')
    .action(async (sub: string, args: string[], opts: { json?: boolean; continuous?: boolean; hostSession?: string }) => {
      const forwarded = [...args]
      if (opts.json) forwarded.push('--json')
      if (opts.continuous) forwarded.push('--continuous')
      if (opts.hostSession !== undefined) forwarded.push('--host-session', opts.hostSession)
      bail(await cmdSession(deps, sub, forwarded))
    })

  program
    .command('inbox')
    .description('收件箱：等待人工决策的 change（三门 marker + 复核相位）')
    .option('--json', 'JSON 输出（schema 稳定）')
    .option('--html', '自足静态单页（重定向到文件用浏览器打开）')
    .action(async (opts: { json?: boolean; html?: boolean }) => bail(await cmdInbox(deps, opts)))

  program
    .command('status [name]')
    .description('change 摘要（无 name 列全部活跃）')
    .option('--json', 'JSON 输出（schema 稳定）')
    .action(async (name: string | undefined, opts: { json?: boolean }) =>
      bail(await cmdStatus(deps, name, opts)))

  program
    .command('list')
    .description('活跃 change 表')
    .option('--json', 'JSON 输出（schema 稳定）')
    .action(async (opts: { json?: boolean }) => bail(await cmdList(deps, opts)))

  program
    .command('triage <source>')
    .description('H12 生产 triage：git-commits | loop-run-terminals；成功页提交 durable checkpoint，可原命令幂等续跑')
    .option('--provider <provider>', '分类 provider（默认 codex；生产仅支持 codex）', 'codex')
    .option('--model <model>', 'Codex triage model（缺省使用 host 固定默认）')
    .option('--page-size <n>', '每页 observation 上限（默认 20）', '20')
    .option('--max-pages <n>', '本次最多提交页数（默认 4；到限可原命令续跑）', '4')
    .option('--max-high-candidates <n>', '每页最多创建的 high WorkflowRun（默认 10）', '10')
    .option('--json', '单行稳定 JSON 输出')
    .addHelpText('after', '\nsource: git-commits（当前仓 HEAD）| loop-run-terminals（当前仓 durable loop ledger）')
    .action(async (source: string, opts: import('./commands/triage.js').TriageCmdOpts) =>
      bail(await cmdTriage(deps, source, opts, runtimes.triage)))

  program
    .command('sync [sub]')
    .description('项目内资产同步（downgrade-guard / prune / config 门 / --migrate 硬闸）')
    .option('--migrate', '放行迁移硬闸（缺省只报告不改盘；注意缺省未注入迁移执行器时本闸恒空转）')
    .option('--allow-downgrade', '放行降级同步')
    .action(async (sub: string | undefined, opts: { migrate?: boolean; allowDowngrade?: boolean }) => {
      const installedJson = await deps.readInstalledPlugins?.()
      bail(await cmdSync(deps, {
        sub: sub as 'sync' | 'banner' | 'upgrade-channel' | undefined,
        cliVersion: deps.pluginVersion ?? 'unknown',
        migrate: opts.migrate,
        allowDowngrade: opts.allowDowngrade,
        installedJson,
      }))
    })

  program
    .command('uninstall')
    .description('卸载 + 所有权 scrubber（只删自己装的、用户改过的保留）')
    .option('-y, --yes', '非交互确认')
    .option('--dry-run', '只打印计划不落盘')
    .action(async (opts: { yes?: boolean; dryRun?: boolean }) =>
      bail(await cmdUninstall(deps, { yes: opts.yes, dryRun: opts.dryRun })))

  program
    .command('afk <sub> [name]')
    .description('AFK 自动化：enqueue <name> [--loop <id>] 挂队(+显式绑定 loop) / scan 就绪队列 / status [name] 泳道 / run 真跑 docker 沙箱 / cancel <name> 取消运行中任务（落取消标记 + docker kill，对齐 server /api/afk/:name/cancel）')
    .option('--json', 'JSON 输出')
    .option('--level <level>', 'run：分级放权档位覆盖（L1|L2|L3，缺省 L1 report-only 安全默认）')
    .option('--image <image>', 'run：sandcastle 镜像名（缺省 sandcastle:local）')
    .option('--loop <loop-id>', 'enqueue：显式绑定该 change 到 loop（落 explicit change-loop-binding，admission 归属不再前缀猜）')
    .action(async (sub: string, name: string | undefined, opts: { json?: boolean; level?: string; image?: string; loop?: string }) =>
      bail(await cmdAfk(deps, sub, name, opts)))

  program
    .command('loops <sub> [args...]')
    .alias('loop')
    .description('loop 治理：init 起草草稿（向导/非交互）· list 登记表 · enforce R1-R11 裁决 · status（B18/D16，L1→L3 分级放权）')
    .allowUnknownOption()
    // 子命令是手解析的（loops <sub> [args...] 单命令），commander 的 --help 只显父用法看不到 init 的
    // --id/--goal 等（小白无法从 --help 发现）。补一段 after-help 列出子命令 + init 关键 flags + 示例。
    .addHelpText('after', `
子命令:
  init [flags]              起草一个 paused 草稿 loop（TTY 下无 flags → 交互向导；非交互见下）
  list [--json]             登记表
  status [--json]           各 loop 分级放权状态（L1 报告 / L2 辅助 / L3 无人值守）
  enforce [--loop <id>]     跑 R1-R11 裁决出 verdict
  budget|cost [loop]        token 预算 / 成本估算
  graduate [loop]          升降档裁决（毕业制）
  level <loop> [set <L1|L2|L3>] [--confirm]   查看/改档（升档须准入 + --confirm）
  run <loop-id|pattern> [--dry-run] [--level L1|L2|L3] [--commit] [--json]   定向真跑；--dry-run 为零写/零 Docker 预览
  sync <loop-id> <--dry-run|--apply> [--expected-registry-sha <sha>] [--expected-workflow-sha <sha>] [--json]
                            对账 registry/LOOP.md；必须显式二选一：--dry-run 零写入，--apply 执行双 CAS 计划

loops init 非交互 flags（agent/CI；缺 TTY 或 --yes 走默认）:
  --id <id>       *必填  loop 标识（kebab-case）
  --goal <text>   手工 init 必填；starter 模式下可省略或覆写模板 goal
  --template <id> 选用 H3 v1 starter：pr-babysitter | daily-triage | ci-sweeper | post-merge-cleanup |
                  dependency-sweeper | changelog-drafter | issue-triage
  --workflow <id> 显式 workflow binding（starter 缺省取 recommended workflow）
  --skill-bundle <profile>   显式 H10 skill profile binding（缺省 null/unwired，不把具体推荐 skill 冒充 profile）
  --runner <claude-code|codex>   执行 agent（缺省 codex）
  --kind <orchestrator|executor> · --prefix <change 前缀> · --cadence <4h> · --risk <low|medium|high> · --yes

示例:
  pipeline loops init                                   # TTY 交互向导
  pipeline loops init --id nightly-fix --goal "夜间修 flaky 测试" --runner codex --yes
  pipeline loops init --id ci-loop --template ci-sweeper --skill-bundle backend --yes`)
    .action(async (sub: string, args: string[]) => bail(await cmdLoops(deps, sub, args)))

  program
    .command('channel <sub> [args...]')
    .description('正交 worker 层（event-sourced）：create/send/wait/messages/thread/forum/registry …')
    .allowUnknownOption() // flag 由 cmdChannel 自解析
    .action(async (sub: string, args: string[]) => bail(await cmdChannel(deps, sub, args)))

  program
    .command('mem <sub> [args...]')
    .description('跨 runtime 会话检索：list · search <kw> · context <id> · extract <id> · projects')
    .allowUnknownOption() // --json/--limit/--phase 等 flag 由 cmdMem 自解析
    .action(async (sub: string, args: string[]) => bail(await cmdMem(deps, sub, args)))

  program
    .command('tap <sub> [args...]')
    .description('tap 流量代理：start <client...> [--ca [dir]] [--json] [-- <command> ...]（daemon 启动器，#34-wire）')
    .allowUnknownOption() // --ca/--json/-- <command> 由 cmdTap 自解析（-- 之后原样透传，不可用 commander 解析）
    .action(async (sub: string, args: string[]) => bail(await cmdTap(deps, sub, args)))

  program
    .command('_gen-router-sh <manifest> <repo-root>')
    .description('[内部] 从 manifest + effective track registry 派生项目 router data cache（router.sh 调用）')
    .action(async (manifest: string, repoRoot: string) =>
      bail(await cmdGenRouterSh(deps, manifest, repoRoot)))

  program
    .command('internal-skill-gate <name> <skillId>')
    .description('[内部] 非 default workflow 的 skill DAG 解锁判定（hooks/gate.sh 委托目标；0=放行 2=拦截）')
    .action(async (name: string, skillId: string) => bail(await cmdInternalSkillGate(deps, name, skillId)))

  program
    .command('internal-constraint-gate <operation> <nulPathsFile>')
    .description('[内部] AutomationPolicy 路径授权（0=放行 2=拒绝 1=输入损坏）')
    .action(async (operation: string, nulPathsFile: string) =>
      bail(await cmdInternalConstraintGate(deps, operation, nulPathsFile)))

  program
    .command('internal-codex-jsonl <mode> <jsonlPath>')
    .description('[内部] 解析 host-owned codex exec --json 事件（usage|transitions）')
    .action(async (mode: string, jsonlPath: string) =>
      bail(await cmdInternalCodexJsonl(deps, mode, jsonlPath)))

  program
    .command('internal-codex-skill-receipt <changeName> <skillId> <skillPath> <transcriptPath> <sessionId> <turnId> <toolUseId>')
    .description('[内部] 仅登记 Codex PreToolUse 的待核验 skill receipt；不会直接写完成证据')
    .action(async (
      changeName: string, skillId: string, skillPath: string, transcriptPath: string, sessionId: string, turnId: string, toolUseId: string,
    ) => bail(await cmdInternalCodexSkillReceipt(
      deps, changeName, skillId, skillPath, transcriptPath, sessionId, turnId, toolUseId,
    )))

  program
    .command('migrate-workflow <name>')
    .description('[一次性] 老格式 change 补齐/确认 workflow 字段为 default（真实自定义 workflow 不覆盖）')
    .action(async (name: string) => bail(await cmdMigrateWorkflow(deps, name)))

  program
    .command('state <sub> <name>')
    .description('canonical state 运维：status | repair-projection | import-legacy')
    .option('--json', '稳定 JSON 输出')
    .option('--force-canonical', 'repair-projection：明确用 canonical 覆盖未知 YAML drift')
    .action(async (
      sub: string,
      name: string,
      opts: { json?: boolean; forceCanonical?: boolean },
    ) => bail(await cmdStateProjection(deps, sub, name, opts)))

  // ── tracks：动态 Track Registry CRUD（T-R3）——Commander 真子命令树（不手解析 [args...]）。
  // 装配在 Stage B 的 loops 命令之上追加，不改其行。exitOverride/configureOutput 由父命令继承。
  const tracks = program
    .command('tracks')
    .description('动态 Track Registry：list / show <id> / create <id> / update <id> / delete <id>（--json 稳定输出）')
    .action(() => {
      deps.io.err('用法：pipeline tracks <list|show|create|update|delete> …（详见 pipeline tracks --help）')
      bail(1)
    })
  tracks
    .command('list')
    .description('列出全部 track（内建 Track 在前，固定列 ID LABEL BUILTIN DEFAULT ALLOWED POLICY）')
    .option('--json', 'JSON array 输出')
    .action(async (opts: { json?: boolean }) => bail(await cmdTracksList(deps, opts)))
  tracks
    .command('show <id>')
    .description('显示某 track 详情（标 source: builtin | builtin-override | custom）')
    .option('--json', 'JSON object 输出')
    .action(async (id: string, opts: { json?: boolean }) => bail(await cmdTracksShow(deps, id, opts)))
  tracks
    .command('create <id>')
    .description('新建额外 track（四组必填：--label /--workflow-default /(--workflow-allowed|--workflow-any) /--policy）')
    .option('--label <text>', 'track 展示名')
    .option('--workflow-default <id>', '缺省 workflow')
    .option('--workflow-allowed <ids...>', '允许的 workflow 白名单（可多值）')
    .option('--workflow-any', "允许任意 workflow（'*'，不必输裸 *）")
    .option('--policy <preset>', 'policy 模板 chat|simple|pm|frontend|backend|free（深拷贝该内建 policy 落完整结构）')
    .option('--json', 'JSON 返回更新后的 effective definition')
    .action(async (id: string, opts: TracksCreateOpts) => bail(await cmdTracksCreate(deps, id, opts)))
  tracks
    .command('update <id>')
    .description('改 track（≥1 个 --set-*；内建仅 label/workflow 可改，policy/id 锁死不可删）')
    .option('--set-label <text>', '改展示名')
    .option('--set-workflow-default <id>', '改缺省 workflow')
    .option('--set-workflow-allowed <ids...>', '改 workflow 白名单（可多值）')
    .option('--set-workflow-any', "改为允许任意 workflow（'*'）")
    .option('--set-policy <preset>', '改 policy 模板（仅额外 track；内建传它拒）')
    .option('--json', 'JSON 返回更新后的 effective definition')
    .action(async (id: string, opts: TracksUpdateOpts) => bail(await cmdTracksUpdate(deps, id, opts)))
  tracks
    .command('delete <id>')
    .description('删额外 track（内建拒；被活跃 change 引用拒+列名，fail-closed）')
    .option('--json', 'JSON 返回 {deleted,revision}')
    .action(async (id: string, opts: { json?: boolean }) => bail(await cmdTracksDelete(deps, id, opts)))

  program.addHelpText(
    'after',
    '\n首次安装：pipeline setup --codex（或 --claude；安装完整打包插件并配就绪）——随后再用 init 起 change。',
  )

  return program
}
