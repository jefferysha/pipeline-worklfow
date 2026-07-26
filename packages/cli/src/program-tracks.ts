import type { Command } from 'commander'
import type { CliDeps } from './deps.js'
import {
  cmdTracksCreate,
  cmdTracksDelete,
  cmdTracksList,
  cmdTracksShow,
  cmdTracksUpdate,
  type TracksCreateOpts,
  type TracksUpdateOpts,
} from './commands/tracks.js'
import { bail } from './program-exit.js'

export function registerTrackCommands(program: Command, deps: CliDeps): void {
  const tracks = program
    .command('tracks')
    .description('动态 Track Registry：list / show <id> / create <id> / update <id> / delete <id>（--json 稳定输出）')
    .action(() => {
      deps.io.err('用法：tenon tracks <list|show|create|update|delete> …（详见 tenon tracks --help）')
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
}
