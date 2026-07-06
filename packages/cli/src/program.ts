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
import { cmdGenRouterSh } from './commands/gen-router.js'
import { cmdInit, type InitCmdOpts } from './commands/init.js'
import { cmdMem } from './commands/mem.js'
import { cmdSession } from './commands/session.js'
import { cmdSpec } from './commands/spec.js'
import { cmdSync } from './commands/sync.js'
import { cmdTask } from './commands/task.js'
import { cmdUninstall } from './commands/uninstall.js'
import { cmdList, cmdStatus } from './commands/status.js'
import { cmdTransition } from './commands/transition.js'

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
    .requiredOption('--track <track>', 'chat | pm | frontend | backend')
    .requiredOption('--preset <preset>', 'full | hotfix | tweak')
    .option('--user <user>', 'created_by')
    .action(async (name: string, opts: InitCmdOpts) => bail(await cmdInit(deps, name, opts)))

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
    .option('--migrate', '执行迁移（缺省只报告不改盘）')
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
    .command('mem <sub> [args...]')
    .description('跨 runtime 会话检索：list · search <kw> · context <id> · extract <id> · projects')
    .allowUnknownOption() // --json/--limit/--phase 等 flag 由 cmdMem 自解析
    .action(async (sub: string, args: string[]) => bail(await cmdMem(deps, sub, args)))

  program
    .command('_gen-router-sh <manifest>')
    .description('[内部] 从 manifest 派生 router 缓存 bash（router.sh 调用）')
    .action(async (manifest: string) => bail(await cmdGenRouterSh(deps, manifest)))

  return program
}
