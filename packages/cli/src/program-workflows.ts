import type { Command } from 'commander'
import type { CliDeps } from './deps.js'
import { cmdWorkflowPlan } from './commands/workflow-plan.js'
import { bail } from './program-exit.js'

export function registerWorkflowCommands(program: Command, deps: CliDeps): void {
  const workflow = program
    .command('workflow')
    .description('Workflow 运行计划：从 Change 的冻结快照读取步骤、Skill、门禁和转换')
    .action(() => {
      deps.io.err('用法：pipeline workflow plan <change> [--json]')
      bail(1)
    })
  workflow
    .command('plan <change>')
    .description('输出 Change 的有效运行计划；已启动 Change 优先使用不可变快照')
    .option('--json', 'Agent 可编程 JSON 输出')
    .action(async (change: string, opts: { json?: boolean }) =>
      bail(await cmdWorkflowPlan(deps, change, opts)))
}
