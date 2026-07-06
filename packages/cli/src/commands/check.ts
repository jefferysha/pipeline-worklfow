/**
 * check <name> —— guard 报告（人读）；exit 0 过 / 2 不过 / 1 错误（CONTRACT §3）。
 * 检查项内容是 flow.guardCheck（kernel/flow 相位出口必填字段表）的职责，cli 只渲染。
 */
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'
import { display } from '../render.js'

export async function cmdCheck(deps: CliDeps, name: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  let state
  try {
    state = await deps.store.read(dir)
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
  const result = deps.flow.guardCheck(state)
  deps.io.out(`[CHECK] ${name} (phase=${display(state.fields.phase)})`)
  if (result.pass) {
    deps.io.out('  [PASS] 所有检查通过')
    return 0
  }
  for (const failure of result.failures) {
    deps.io.out(`  [FAIL] ${failure}`)
  }
  deps.io.out(`  [FAIL] 共 ${result.failures.length} 项未通过`)
  return 2
}
