/**
 * 真实 e2e —— `pipeline transition` 对非 default workflow 的真实 step 间转换（Task 8）。
 *
 * 与 transition.test.ts（mock 单测，直调 cmdTransition）的根本区别：本文件零 mock，走
 * integration-harness.ts 的 freshHarness（真临时项目 + 真 buildProgram 解析路径 + 真 fs +
 * 真 kernel store/flow/history），用真 `pipeline` 子命令驱动，断言真落盘副作用。
 *
 * 覆盖 Task 8 三条新行为（default workflow 的零回归由 transition.test.ts + 全仓 oracle 守）：
 *   1. 非 default workflow：任意 event 名（如 `complete`，不在固定 8 事件表里）按当前 step
 *      自己的 transitions 查目标 step，真把 phase 改写成目标 step id + 真 append 一条 transition 历史。
 *   2. 非 default workflow：当前 step 的 nonempty-output guard 不满足 → 真拒绝（exit 非 0），phase 不变。
 *   3. 非 default workflow：event 名不在当前 step 的 transitions 里 → 真拒绝，报错点名该 step 实际支持的 event。
 *
 * 起始 step 的落点（whole-branch review 补的 `init --workflow`，见
 * init-workflow.integration.test.ts）：本文件改用真 `pipeline init --workflow` 把 change 摆到
 * 自定义 workflow 的首个 step 上（此前这里手改 .pipeline.yaml 的 phase 行来绕开 `set phase`
 * 只认 manifest 7 相位枚举这道坎——那道坎本身没变，只是现在有了一条不必绕开它的路：init 直接
 * 调 kernel StateStore.setMany 落 phase，不经过 CLI `set` 子命令那层枚举校验），本文件从起点
 * 到被验证的转换全程走真 CLI，不再有任何手工改写状态文件的步骤。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { freshHarness, rm, type Harness } from './integration-harness.js'

const CHANGE = 'cwf'

/** 一个最小两 step workflow：s1 --complete--> s2（s2 为终态，无出边）。 */
const TWO_STEP_WF = `name: twostep
steps:
  - id: s1
    label: step-one
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions:
      - event: complete
        to: s2
  - id: s2
    label: step-two
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

/** 同上，但 s1 声明 nonempty-output guard，且必须产出的 design_doc 字段初始未设。 */
const GUARDED_WF = `name: guarded
steps:
  - id: s1
    label: step-one
    gate: null
    skills: []
    inputs: []
    outputs:
      - field: design_doc
        type: file_path
    guards:
      - type: nonempty-output
    transitions:
      - event: complete
        to: s2
  - id: s2
    label: step-two
    gate: null
    skills: []
    inputs: []
    outputs: []
    guards: []
    transitions: []
`

interface HistLine { kind: string; from?: string; to?: string; raw?: string }

describe('真实 e2e —— transition 非 default workflow 的真实 step 间转换（Task 8）', () => {
  let h: Harness

  beforeEach(async () => {
    h = await freshHarness()
  })

  afterEach(async () => {
    await rm(h.cwd, { recursive: true, force: true })
  })

  /** 真在仓库根落一份 workflow 定义文件，再真跑 `init --workflow` 把 change 直接摆到该
   *  workflow 的首个 step 上——一步到位，不再需要 set workflow + 手改 phase 行两步。 */
  async function setupCustomChange(workflowName: string, workflowYaml: string): Promise<void> {
    const wfDir = join(h.cwd, '.pipeline', 'workflows')
    await mkdir(wfDir, { recursive: true })
    await writeFile(join(wfDir, `${workflowName}.yaml`), workflowYaml, 'utf8')
    expect(await h.run(['init', CHANGE, '--track', 'backend', '--preset', 'full', '--workflow', workflowName])).toBe(0)
  }

  async function historyLines(): Promise<HistLine[]> {
    const p = join(h.cwd, 'openspec', 'changes', CHANGE, '.pipeline-history.jsonl')
    const raw = await readFile(p, 'utf8').catch(() => '')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as HistLine)
  }

  test('按 event 名查当前 step 的 transitions，真改写 phase 到目标 step + 真 append transition 历史', async () => {
    await setupCustomChange('twostep', TWO_STEP_WF)
    // 起点核验：phase 确在 s1
    expect(await h.read(CHANGE)).toMatch(/^phase: s1$/m)

    // 真跑：event `complete` 不在固定 8 事件表里，但在 s1 的 transitions 里
    expect(await h.run(['transition', CHANGE, 'complete'])).toBe(0)

    // phase 真被改写成 s2
    expect(await h.read(CHANGE)).toMatch(/^phase: s2$/m)

    // .pipeline-history.jsonl 真 append 了一条 transition 记录（from=s1,to=s2,raw=complete）
    const hist = await historyLines()
    const txn = hist.find((l) => l.kind === 'transition' && l.to === 's2')
    expect(txn, `history 应含 s1->s2 的 transition 记录，实际=${JSON.stringify(hist)}`).toBeDefined()
    expect(txn?.from).toBe('s1')
    expect(txn?.raw).toBe('complete')
  })

  test('当前 step 的 nonempty-output guard 不满足 → 真拒绝（exit 非 0），phase 不变', async () => {
    await setupCustomChange('guarded', GUARDED_WF)
    expect(await h.read(CHANGE)).toMatch(/^phase: s1$/m)

    // design_doc 初始未设 → s1 的 nonempty-output guard 应挡下这次转换
    const code = await h.run(['transition', CHANGE, 'complete'])
    expect(code, `guard 未满足应非 0 退出，err=${h.err.join('\n')}`).not.toBe(0)

    // phase 仍是 s1（零写盘）
    expect(await h.read(CHANGE)).toMatch(/^phase: s1$/m)
    // 报错要点名是哪个必须产出字段没设（帮用户定位），而非笼统「未知 event」
    expect(h.err.join('\n')).toContain('design_doc')
  })

  test('event 名不在当前 step 的 transitions 里 → 真拒绝，报错点名该 step 实际支持哪些 event', async () => {
    await setupCustomChange('twostep', TWO_STEP_WF)

    const code = await h.run(['transition', CHANGE, 'bogus-event'])
    expect(code, `未支持的 event 应非 0 退出，err=${h.err.join('\n')}`).not.toBe(0)

    // phase 不变
    expect(await h.read(CHANGE)).toMatch(/^phase: s1$/m)
    // 报错要点名当前 step 不支持该 event，且列出它实际支持的 event（complete）
    const err = h.err.join('\n')
    expect(err).toContain('bogus-event')
    expect(err).toContain('complete')
  })
})
