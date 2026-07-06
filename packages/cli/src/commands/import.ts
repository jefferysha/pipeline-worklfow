/**
 * import <name> [--strip] —— 老仓 change 的 base64 历史区 → .pipeline-history.jsonl
 * （BACKLOG #11）。解析/清理归 kernel legacy.ts，本命令只编排：
 *   幂等（JSONL 已有 import 哨兵 → 拒绝重跑）→ 逐条 append → 哨兵收尾
 *   → --strip 时写回清空历史节的 state（其余尾内容 kernel 保证逐字保留）。
 * append 在此 fail-loud（显式导入命令，不同于 set/transition 的 best-effort 记账）。
 */
import { parseLegacyHistory, stripLegacyHistory } from '@pipeline-lite/kernel'
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

export async function cmdImport(deps: CliDeps, name: string, opts: { strip?: boolean }): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  if (!deps.history) {
    deps.io.err('ERROR: import 需要 history writer（main.ts 装配缺失？）')
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  try {
    const state = await deps.store.read(dir)
    const entries = parseLegacyHistory(state.opaqueTail)
    if (entries.length === 0) {
      deps.io.err(`[IMPORT] ${name}: 无历史区可导入`)
      return 0
    }
    const prior = (await deps.readHistoryRaw?.(dir)) ?? ''
    if (prior.includes('"kind":"import"')) {
      deps.io.err(`ERROR: ${name} 已导入过（.pipeline-history.jsonl 存在 import 哨兵），拒绝重复导入`)
      return 1
    }
    for (const e of entries) {
      await deps.history.append(dir, e)
    }
    await deps.history.append(dir, {
      ts: deps.clock(),
      kind: 'import',
      raw: `legacy-yaml: ${entries.length} entries`,
    })
    if (opts.strip) {
      await deps.store.write(dir, { ...state, opaqueTail: stripLegacyHistory(state.opaqueTail) })
    }
    deps.io.err(
      `[IMPORT] ${name}: ${entries.length} 条历史 → .pipeline-history.jsonl${opts.strip ? '（已清理 YAML 历史区）' : ''}`,
    )
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
