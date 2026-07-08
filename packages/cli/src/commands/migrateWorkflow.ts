/**
 * migrate-workflow <name> —— Task 4 之前创建的老 change 一次性迁移工具
 * （workflow 定制引擎 Task 10）。
 *
 * 实测结论（Task 10 实现前的真实验证，见 task-10-report.md 完整命令+输出）：
 * parsePipeline() 起手于 emptyFields()，而 emptyFields() 把 workflow 缺省为 'default'
 * （Task 4）；解析器只在文件里找到某已知字段的行时才覆写骨架值，文件里完全没有
 * `workflow:` 这一行时，读出来的 fields.workflow 本来就已经是 'default'，不是 '' 也不是
 * undefined。也就是说：
 *   - "老 change，字段物理缺失"和"已迁移 / Task 4 起新建 change，字段物理写着
 *     workflow: default"，这两种情况经 store.get 读出来完全无法区分（都是 'default'）；
 *   - 唯一能观察到的信号只有"当前值是不是 default"——非 default 只可能是真实自定义
 *     workflow（Task 5-9 落地的合法产物：自定义 skill DAG / step 转换），绝不能当成
 *     "老格式待迁移"覆写掉。
 *
 * 因此本命令的判定条件是"current 解析为 default（含 undefined）→ 无条件补齐/确认落盘；
 * 否则视为真实定制、绝不触碰"——不是任务简报 Step 3 示例代码的写法（那份示例是
 * current==='default' 时跳过不写、否则覆写成 default）。验证后发现示例代码的方向是反的：
 * 给定上述读时兜底行为，示例代码的覆写分支只会在遇到真实自定义 workflow 时触发，会把用户的
 * 定制冲回 default，是破坏性 bug。
 *
 * current 已解析为 default 时无条件（重新）写一次：老文件借此真正把字段物理补齐到磁盘
 * （confirm + 落盘，为未来解析器兜底行为变化兜底——如 emptyFields() 的特判被移除，老文件
 * 不会再悄悯读成 default）；已迁移文件则是无害的同值重写。store 层不暴露"字段是否物理
 * 存在于文件"这一信号，两种子情况在 store.get 面前本就不可区分，收敛到同一个安全写入即可。
 */
import { errMsg, type CliDeps } from '../deps.js'
import { changeDir, isValidChangeName } from '../paths.js'

export async function cmdMigrateWorkflow(deps: CliDeps, name: string): Promise<number> {
  if (!isValidChangeName(name)) {
    deps.io.err(`ERROR: change-name 非法: '${name}' (仅允许 a-z A-Z 0-9 - _)`)
    return 1
  }
  const dir = changeDir(deps.cwd, name)
  try {
    const current = await deps.store.get(dir, 'workflow')
    if (current !== 'default' && current !== undefined) {
      deps.io.err(`[MIGRATE] ${name}: workflow='${current}'（非 default，视为真实定制，跳过，不覆写）`)
      return 0
    }
    await deps.store.set(dir, 'workflow', 'default')
    deps.io.err(`[MIGRATE] ${name}: workflow 字段已确认/补齐为 default（phase 等其余字段值不变）`)
    return 0
  } catch (e) {
    deps.io.err(`ERROR: ${errMsg(e)}`)
    return 1
  }
}
