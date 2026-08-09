import type { Command } from 'commander'
import type { CliDeps } from './deps.js'
import { cmdReviewAttempt, cmdReviewBudget } from './commands/review-attempt.js'
import { bail } from './program-exit.js'

export function registerAutomatedReviewCommands(program: Command, deps: CliDeps): void {
  program
    .command('review-attempt <sub> <name>')
    .description('自动 Review 次数事务：begin 占用一次；lane 聚合证据；complete 提交整轮')
    .option('--candidate <fingerprint>', 'begin 的冻结候选 fingerprint')
    .option('--attempt-id <id>', 'complete 的 attempt UUID')
    .option('--lane <lane>', 'lane 子命令的 frozen Review lane id')
    .option('--result <result>', 'complete 结果：pass|fail')
    .option('--report <path>', 'complete 的项目内 Review 报告路径')
    .option('--json', 'JSON 输出')
    .action(async (sub: string, name: string, opts: {
      candidate?: string; attemptId?: string; lane?: string; result?: string; report?: string; json?: boolean
    }) => bail(await cmdReviewAttempt(deps, sub, name, opts)))

  program
    .command('review-budget <sub> <name>')
    .description('查看或审计化覆盖当前 Pipeline step 的有限 Review 次数')
    .option('--max-attempts <n>', 'set 的有效范围 1..20')
    .option('--json', 'JSON 输出')
    .action(async (sub: string, name: string, opts: { maxAttempts?: string; json?: boolean }) =>
      bail(await cmdReviewBudget(deps, sub, name, opts)))
}
