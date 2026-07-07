/**
 * workflow 自定义引擎类型（GOAL 清单 E）——双轨策略：workflow==='default' 时完全不使用
 * 这些类型，走 packages/kernel/src/flow/ 现有的硬编码路径；只有 workflow!=='default'
 * 才会加载、解析、消费这里定义的形状。
 */
export type FieldType = 'string' | 'file_path' | 'boolean'
export type GateKind = 'review' | 'confirm' | null

export interface FieldRef {
  readonly field: string
  readonly type: FieldType
}

export interface SkillRef {
  readonly id: string
  /** 同 step 内其它 skill 的 id；无 = 无依赖，可立即调用。跨 step 引用是校验期错误（Task 4）。 */
  readonly depends_on?: readonly string[]
}

export type GuardConfig =
  | { readonly type: 'tasks-at-least'; readonly n: number }
  | { readonly type: 'nonempty-output' }

/** step 间转换边——每个 step 自己声明"按哪个 event 名走向哪个下一个 step"，取代
 *  default workflow 依赖的全局 TRANSITION_EVENTS 表（那张表是 Record<Phase,...>，天然
 *  不适用任意自定义 step）。同一个 step 可以有多条边（不同 event 名指向不同下一个 step，
 *  对齐现有 verify-pass→ship / verify-fail→build 这种真实分支需求）。 */
export interface StepTransition {
  readonly event: string
  readonly to: string
}

export interface StepDef {
  readonly id: string
  readonly label: string
  readonly gate: GateKind
  readonly skills: readonly SkillRef[]
  readonly inputs: readonly FieldRef[]
  readonly outputs: readonly FieldRef[]
  readonly guards: readonly GuardConfig[]
  readonly transitions: readonly StepTransition[]
}

export interface WorkflowDef {
  readonly name: string
  readonly steps: readonly StepDef[]
}
