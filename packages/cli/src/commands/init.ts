/**
 * init <name> --track --preset [--user] —— 初始化 change（CONTRACT §3，
 * 2026-07-06 oracle 实测回写：老内核 init stdout 为空，创建路径改走 stderr 信息行）。
 * stdout：无；exit 0/1。
 */
import { TRACKS } from '@pipeline-lite/kernel'
import type { Track } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { isValidChangeName } from '../paths.js'

export interface InitCmdOpts {
  track: string
  preset: string
  user?: string
}

export async function cmdInit(deps: CliDeps, name: string, opts: InitCmdOpts): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  if (!(TRACKS as readonly string[]).includes(opts.track)) {
    deps.io.err(`ERROR: 非法 track '${opts.track}'，允许: ${TRACKS.join(' | ')}`)
    return 1
  }
  if (!opts.preset) {
    deps.io.err('ERROR: preset 不能为空')
    return 1
  }
  try {
    const created = await deps.store.init({
      repoRoot: deps.cwd,
      name,
      track: opts.track as Track,
      preset: opts.preset,
      user: opts.user,
      clock: deps.clock,
    })
    deps.io.err(`[INIT] ${created}`)
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
