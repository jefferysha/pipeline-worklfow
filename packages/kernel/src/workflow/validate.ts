import { compileWorkflow } from './compile.js'
import { validateOpenSpecContractWorkflow } from './document-contract.js'
import type { WorkflowDef } from './types.js'

function detectCycle(skillIds: string[], dependsOn: Map<string, string[]>): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map(skillIds.map((id) => [id, WHITE]))
  const errors: string[] = []

  function visit(id: string, path: string[]): void {
    color.set(id, GRAY)
    for (const dep of dependsOn.get(id) ?? []) {
      if (color.get(dep) === GRAY) {
        errors.push(`循环依赖：${[...path, id, dep].join(' -> ')}`)
        continue
      }
      if (color.get(dep) === WHITE) visit(dep, [...path, id])
    }
    color.set(id, BLACK)
  }

  for (const id of skillIds) {
    if (color.get(id) === WHITE) visit(id, [])
  }
  return errors
}

// G16：serialize 原样写出、parse 用 (\S+) 读回的每一类标识符，字符集越出这个范围就可能
// 「保存成功、下次打不开」（如含空格）。与 dashboard 客户端表单、server 路由层 name 校验
// 同一条规则；此处是绕过 UI 直调已鉴权 HTTP 时的唯一服务端后盾。
const IDENT_RE = /^[a-zA-Z0-9_-]+$/
// Workflow 是用户可见名称；允许 Unicode 字母/数字，但仍拒绝空白、点与路径分隔符。
const WORKFLOW_NAME_RE = /^[\p{L}\p{N}\p{M}_-]+$/u
/**
 * skill id 允许命名空间冒号（插件 skill 如 `superpowers:brainstorming`、`commit-commands:commit`）。
 * skill-tracker.sh 落的是命名空间全名、internal-skill-gate 按全名匹配 step.skills[].id——workflow 必须能
 * 声明带冒号的 skill id。parse.ts 用 `\S+` 本就接受冒号,validate 此前用 IDENT_RE 拒绝致两处不一致,自定义
 * workflow 无法 gate 占多数的命名空间 skill（superpowers、commit-commands 等插件下的 skill）。`plugin:skill` 形态,
 * 每段仍是 IDENT_RE 字符集,允许多级（`a:b:c`）以防未来更深命名空间。
 */
const SKILL_IDENT_RE = /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/

export function validateWorkflow(wf: WorkflowDef): string[] {
  const errors: string[] = []
  const producedByEarlierStep = new Set<string>()
  const allStepIds = new Set(wf.steps.map((s) => s.id))

  if (!WORKFLOW_NAME_RE.test(wf.name)) {
    errors.push(`workflow name '${wf.name}' 含非法字符（允许中文、字母、数字、- 与 _；不允许空格、点或路径符号）`)
  }

  wf.steps.forEach((step, index) => {
    if (!IDENT_RE.test(step.id)) {
      errors.push(`step id '${step.id}' 含非法字符（仅允许 a-zA-Z0-9_-）`)
    }
    for (const skill of step.skills) {
      if (!SKILL_IDENT_RE.test(skill.id)) {
        errors.push(`step '${step.id}' 的 skill id '${skill.id}' 含非法字符（仅允许 a-zA-Z0-9_- 及命名空间冒号，如 superpowers:brainstorming）`)
      }
    }
    for (const ref of [...step.inputs, ...step.outputs]) {
      if (!IDENT_RE.test(ref.field)) {
        errors.push(`step '${step.id}' 的字段 '${ref.field}' 含非法字符（仅允许 a-zA-Z0-9_-）`)
      }
    }
    for (const t of step.transitions) {
      if (!IDENT_RE.test(t.event)) {
        errors.push(`step '${step.id}' 的 transitions 里 event '${t.event}' 含非法字符（仅允许 a-zA-Z0-9_-）`)
      }
    }
    const skillIds = step.skills.map((s) => s.id)
    const dependsOn = new Map(step.skills.map((s) => [s.id, [...(s.depends_on ?? [])]]))

    for (const skill of step.skills) {
      for (const dep of skill.depends_on ?? []) {
        if (!skillIds.includes(dep)) {
          errors.push(`step '${step.id}' 的 skill '${skill.id}' 依赖了同 step 内不存在的 '${dep}'`)
        }
      }
    }
    errors.push(...detectCycle(skillIds, dependsOn).map((e) => `step '${step.id}': ${e}`))

    for (const input of step.inputs) {
      if (!producedByEarlierStep.has(input.field)) {
        errors.push(`step '${step.id}' 的 inputs 字段 '${input.field}' 不对应任何更早 step 的 outputs`)
      }
    }
    for (const output of step.outputs) producedByEarlierStep.add(output.field)

    // 每条 transition 的 to 必须指向同一 workflow 里真实存在的 step id——否则
    // pipeline transition 在真运行时才会发现走不到，属于本该在保存时就拦下的错误。
    for (const t of step.transitions) {
      if (!allStepIds.has(t.to)) {
        errors.push(`step '${step.id}' 的 transitions 里 event '${t.event}' 的 to '${t.to}' 不存在`)
      }
    }

    // 只有数组里最后一个 step 允许零 transitions（视为终态，如 archive）；中间任何一个
    // step 零 transitions 意味着一旦真运行到这一步就再也走不出去，是配置错误而非合法终态，
    // 保存时就该拦，不能留到用户真跑 transition 命令时才发现卡死。
    const isLastStep = index === wf.steps.length - 1
    if (!isLastStep && step.transitions.length === 0) {
      errors.push(`step '${step.id}' 没有声明任何 transitions（不是最后一个 step，会导致走进死路）`)
    }
  })

  errors.push(...validateOpenSpecContractWorkflow(wf))

  // 深校验（G2 P2）：复用 compileWorkflow 做新 guard/action 变体 + FIELD_ORDER 字段闭集 + 列表
  // 字段互斥 + artifact 形状的结构校验——不在本文件再抄一份闭集判定，避免与编译器漂移。
  // compileWorkflow 是 fail-loud 首错即抛；本层是收集式校验，故 try/catch 收编为一条错误、追加
  // 在既有图/标识符校验之后（既有错误恒先收齐，不被 compile 首错抢断），loadWorkflow 据此拒含
  // 畸形新字段的文件。合法 workflow 编译无错 → 不追加，行为逐字不变。
  try {
    compileWorkflow(wf)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  return errors
}
