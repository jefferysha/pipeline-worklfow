/**
 * commander 装配：CONTRACT §3 全表命令 → 纯函数命令模块。
 * 命令函数返回 exit code；非 0 以 CliExit 抛出，由 main.ts 落到 process.exitCode
 * （commander 自身的 usage error 经 exitOverride 也抛出，main 统一映射 exit 1）。
 */
import { Command } from 'commander'
import type { CliDeps } from './deps.js'
import { cmdCheck } from './commands/check.js'
import { cmdDoctor } from './commands/doctor.js'
import { cmdCas, cmdGet, cmdSet, cmdSetMany } from './commands/fields.js'
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
import { cmdSetup } from './commands/setup.js'
import { cmdSpec } from './commands/spec.js'
import { cmdSync } from './commands/sync.js'
import { cmdTap } from './commands/tap.js'
import { cmdTask } from './commands/task.js'
import { cmdUninstall } from './commands/uninstall.js'
import { cmdList, cmdStatus } from './commands/status.js'
import { cmdTransition } from './commands/transition.js'
import { cmdInternalSkillGate } from './commands/internalSkillGate.js'
import { cmdMigrateWorkflow } from './commands/migrateWorkflow.js'

export class CliExit extends Error {
  constructor(public readonly code: number) {
    super(`exit ${code}`)
  }
}

function bail(code: number): void {
  if (code !== 0) throw new CliExit(code)
}

const stripNl = (s: string): string => s.replace(/\n$/, '')

export function buildProgram(deps: CliDeps): Command {
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
    .option('--track <track>', 'chat | pm | frontend | backend')
    .option('--preset <preset>', 'full | hotfix | tweak')
    .option('--user <user>', 'created_by')
    .option('--workflow <workflow>', '自定义 workflow 名（.pipeline/workflows/<name>.yaml），缺省 default')
    .action(async (name: string, opts: InitCmdOpts) => bail(await cmdInit(deps, name, opts)))

  program
    .command('setup [sub]')
    .description('安装后全功能就绪引导:软链 pipeline 到 PATH + 按 registry 选装技能 + docker/镜像/凭证就绪检查')
    .option('--dry-run', '不软链、不写任何文件（注意 runtime 段仍会做 docker/镜像/凭证的只读探测）')
    .option('-y, --yes', '跳过技能安装的 y/N 确认位;不给时读一次 stdin（管道输入同样有效），仅 y/yes 放行、读不到即不装')
    // 容忍未知 flag。注意 `setup [sub]` 是 positional 参数、不是真 Commander 子命令，故这里只是
    // 「不报错」而非「透传给子命令」。★已知风险：拼错的 flag（如 --dry-runn）会被静默丢弃，
    // 于是本该空跑的命令变成真实执行。收紧此项属行为变更，未在清账轮内做。
    .allowUnknownOption()
    .action(async (sub: string | undefined, opts: { dryRun?: boolean; yes?: boolean }) =>
      bail(await cmdSetup(deps, sub, { dryRun: opts.dryRun, yes: opts.yes })))

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

  program
    .command('transition <name> <event>')
    .description('状态机转换（stdout 无输出，[TRANSITION] 走 stderr；非法/未知事件 exit 1）')
    .action(async (name: string, event: string) => bail(await cmdTransition(deps, name, event)))

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
    .description('session：activate <name> · route-context <name> [--json]')
    .option('--json', 'JSON 输出（route-context）')
    .action(async (sub: string, args: string[], opts: { json?: boolean }) =>
      bail(await cmdSession(deps, sub, opts.json ? [...args, '--json'] : args)))

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
    .description('AFK 自动化：enqueue <name> 挂队 / scan 就绪队列 / status [name] 泳道 / run 真跑 docker 沙箱 / cancel <name> 取消运行中任务（落取消标记 + docker kill，对齐 server /api/afk/:name/cancel）')
    .option('--json', 'JSON 输出')
    .option('--level <level>', 'run：分级放权档位覆盖（L1|L2|L3，缺省 L1 report-only 安全默认）')
    .option('--image <image>', 'run：sandcastle 镜像名（缺省 sandcastle:local）')
    .action(async (sub: string, name: string | undefined, opts: { json?: boolean; level?: string; image?: string }) =>
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

loops init 非交互 flags（agent/CI；缺 TTY 或 --yes 走默认）:
  --id <id>       *必填  loop 标识（kebab-case）
  --goal <text>   *必填  这个 loop 要替你做什么
  --runner <claude-code|codex>   执行 agent（缺省 claude-code）
  --kind <orchestrator|executor> · --prefix <change 前缀> · --cadence <4h> · --risk <low|medium|high> · --yes

示例:
  pipeline loops init                                   # TTY 交互向导
  pipeline loops init --id nightly-fix --goal "夜间修 flaky 测试" --runner codex --yes`)
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
    .command('_gen-router-sh <manifest>')
    .description('[内部] 从 manifest 派生 router 缓存 bash（router.sh 调用）')
    .action(async (manifest: string) => bail(await cmdGenRouterSh(deps, manifest)))

  program
    .command('internal-skill-gate <name> <skillId>')
    .description('[内部] 非 default workflow 的 skill DAG 解锁判定（hooks/gate.sh 委托目标；0=放行 2=拦截）')
    .action(async (name: string, skillId: string) => bail(await cmdInternalSkillGate(deps, name, skillId)))

  program
    .command('migrate-workflow <name>')
    .description('[一次性] 老格式 change 补齐/确认 workflow 字段为 default（真实自定义 workflow 不覆盖）')
    .action(async (name: string) => bail(await cmdMigrateWorkflow(deps, name)))

  program.addHelpText(
    'after',
    '\n首次安装：pipeline setup（装技能 + 配就绪）——首次用本插件先跑 setup，再用 init 起 change。',
  )

  return program
}
