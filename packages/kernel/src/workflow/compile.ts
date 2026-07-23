/**
 * compileWorkflow（G2 P1）——v1 WorkflowDef（./types.ts 旧 DTO）→ WorkflowIR（./ir.ts，
 * 已补默认值、深冻结）的编译期翻译 + 全量 fail-loud 校验（malformed 抛带结构路径的错误，
 * 如 `steps[1].guards[0].n`；validate.ts 收集错误面向编辑 UX，本层首错即抛面向调用方契约）。
 *
 * 下沉规则（裁决原话「v1 guard 编译时下沉成基础 guard」）：
 *   · nonempty-output → 按 step.outputs 逐字段下沉（when 原样传播到每一条；outputs 为空则零条）：
 *     已知非列表字段 → field-nonempty；列表字段 / 未知惰性字段 → output-present（G2 P2 兼容回退，
 *     保留 v1 旧运行期失败语义，见 ir.ts OutputPresentGuard）。经本编译器产出的 IR 里不存在定义层
 *     nonempty-output——运行期注册表对它只有 fail-loud 兜底（guard-handlers.ts）。
 *   · tasks-at-least → 原样保留（IR 一等变体）。
 *
 * 字段闭集闸（G2 P2 兼容回退——pre-P2 的 FieldRef.field 是 string）：
 *   · inputs/outputs：三种 type（string|boolean|file_path）的 field 一律允许未知惰性字段
 *     （compileFieldRef 原样保留在 IR）——惰性 ref 不参与状态写入，但保留供依赖校验/展示，恢复
 *     pre-P2 惰性 output/input 能加载能跑（含未知 file_path output）。字符集/往返合法性由 validate.ts
 *     的 IDENT_RE 把关。artifact 只在「已知 file_path output」派生（阻断 1：新增 artifact IR 不倒推
 *     收窄旧 definition 合法域），未知 file_path 不派生 artifact。
 *   · 新 typed guard（field-nonempty/file-exists/field-equals/field-in/build-head-unchanged）与
 *     artifact 的 field 仍严格 ∈ FIELD_ORDER 且非列表（scalarField / knownField 闸）——guard 要真
 *     求值必须是真字段，列表字段 scalar guard 编译期拒、运行期数组 fail-loud（P1 决策保留）。
 *     唯 v1 兼容 guard nonempty-output 下沉到列表/惰性字段走 output-present，不受此严格闸约束。
 *   · field-equals 的 value 必须经 serialize→parse 往返域（representable.ts，阻断 2），否则拒。
 *
 * 缺省口径：guards/actions 的 undefined（真未声明）→ []；null/非数组等显式 malformed →
 * fail-loud（不被默认值吞）。inputs/outputs/transitions 是 v1 必备键，无默认值。
 *
 * artifact 面：
 *   · 派生默认——outputs 里每个**已知**（∈ FIELD_ORDER）type:'file_path' 的 FieldRef 编译出一条
 *     {kind:'file', field, producerPolicy:'effective-step-skills'}；未知 file_path 是惰性 ref 不派生
 *     （阻断 1）；同一已知 field 的 file_path output 重复出现 → 抛错（重复声明），不静默合并。
 *   · 显式声明（step.artifacts，v1 DTO 之外的结构化输入）——逐条校验后**替换**同 field 的
 *     派生条目（显式声明是携带 requiredWhen 的唯一途径）；只许挂在本 step outputs 里
 *     type:'file_path' 的 FieldRef 上，其余形态拒绝。
 *
 * 输入宽容面：参数类型是 v1 WorkflowDef（两 guard 变体、边无 guards/actions），但运行时
 * 输入可能是越过 parse.ts 的结构化数据（扩展 guard、edge 级 guards/actions、artifacts）——
 * 一律按 unknown 走同一闭集校验，未知形状抛错，绝不静默丢弃。
 *
 * 冻结面：产出全部是新建对象（输入 def 的任何对象引用都不进 IR），深冻结只作用于产物；
 * 调用方的 def 不被本函数冻结或改动。
 */
import { FIELD_ORDER, LIST_FIELDS, type FieldName } from '../types.js'
import { GUARD_DATA_KEYS } from './types.js'
import type { ArtifactProducerPolicy, FieldRef, GateKind, SkillRef, StepDef, StepTransition, WorkflowDef } from './types.js'
import type { TrackPredicate } from './predicates.js'
import { fieldEqualsValueUnrepresentableReason } from './representable.js'
import type {
  ActionConfig,
  ArtifactDeclaration,
  CompiledGuardConfig,
  StepIR,
  StepTransitionIR,
  WorkflowIR,
} from './ir.js'

const KNOWN_FIELDS: ReadonlySet<string> = new Set<string>(FIELD_ORDER)
const LIST_FIELD_SET: ReadonlySet<string> = new Set<string>(LIST_FIELDS)
const FIELD_TYPES = ['string', 'file_path', 'boolean'] as const
const ACTION_TYPES: ReadonlySet<string> = new Set<ActionConfig['type']>([
  'freeze-build-sha',
  'mark-verification-passed',
  'mark-verification-failed',
  'archive-run',
])
// artifact producer policy 全闭集（G2 P4）：语法层「是不是合法 policy token」的判定（越界如
// effective-galaxy-skills → fail-loud）。是否**允许于当前 origin** 另由 allowedPolicies 收窄（A 契约）。
const PRODUCER_POLICIES: ReadonlySet<string> = new Set<ArtifactProducerPolicy>(['effective-step-skills', 'effective-phase-skills'])
// A 契约（G2 P5 · D4）：origin 相容的 producer policy 白名单。**不以 def.name 猜 origin**——由编译入口
// 显式选定（通用 compileWorkflow=custom 契约 / compileDefaultWorkflow=default 生成校验专用）。
//   · custom：只允 effective-step-skills；显式 effective-phase-skills 编译期 fail-loud（custom step id 不必
//     是 default phase，manifest phase×track key 空间对它无定义，跨接 default manifest 无意义）。
//   · default：允许两者（default.yaml 显式 artifact 用 effective-phase-skills；file_path output 派生默认仍
//     effective-step-skills）。default 运行时 artifact 走 P4 codegen 表，本入口只服务生成校验/内部测试。
const CUSTOM_PRODUCER_POLICIES: ReadonlySet<string> = new Set<ArtifactProducerPolicy>(['effective-step-skills'])
const DEFAULT_PRODUCER_POLICIES: ReadonlySet<string> = new Set<ArtifactProducerPolicy>(['effective-step-skills', 'effective-phase-skills'])
// 阻断 3 的嵌套对象闭集：when 只允许 kind/values，file-exists 的 path 只允许 kind/field。
// 顶层 guard 键的闭集在 compileGuard 现算（type + when + GUARD_DATA_KEYS[type]）。
const WHEN_ALLOWED_KEYS: ReadonlySet<string> = new Set(['kind', 'values'])
const PATH_ALLOWED_KEYS: ReadonlySet<string> = new Set(['kind', 'field'])

function compileError(path: string, msg: string): never {
  throw new Error(`compileWorkflow: ${path}: ${msg}`)
}

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    compileError(path, `必须是对象（实际 ${JSON.stringify(v)}）`)
  }
  return v as Record<string, unknown>
}

function asArray(v: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(v)) compileError(path, `必须是数组（实际 ${JSON.stringify(v)}）`)
  return v
}

/** 对象键闭集校验（阻断 3）：出现 allowed 之外的键 → fail-loud。结构化输入（server workflows 直调
 *  绕过 parse）的附加字段此前能过 compile 再被 serialize 静默丢弃；这里在编译层挡住。 */
function rejectExtraKeys(rec: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      compileError(path, `出现该变体不接受的附加键 '${key}'（闭集：${[...allowed].join('/')}）`)
    }
  }
}

function nonemptyString(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') compileError(path, `必须是非空字符串（实际 ${JSON.stringify(v)}）`)
  return v
}

function stringArray(v: unknown, path: string): string[] {
  const arr = asArray(v, path)
  return arr.map((x, i) => {
    if (typeof x !== 'string') compileError(`${path}[${i}]`, `必须是字符串（实际 ${JSON.stringify(x)}）`)
    return x
  })
}

function knownField(v: unknown, path: string): FieldName {
  if (typeof v !== 'string' || !KNOWN_FIELDS.has(v)) {
    compileError(path, `'${String(v)}' 不是已知状态字段（../types.ts FIELD_ORDER 闭集）`)
  }
  return v as FieldName
}

/** scalar guard 的 field 位：已知字段且非列表字段。两个旧口径对列表互斥——stepGuard.scalar
 *  恒 ''（nonempty 永 fail）、transition 层 fstr join(',')（非空列表即过），语义对照没有可继承
 *  的单一真值，IR 层裁决为编译期拒绝（列表语义不属于 scalar guard 闭集）。 */
function scalarField(v: unknown, path: string): FieldName {
  const field = knownField(v, path)
  if (LIST_FIELD_SET.has(field)) {
    compileError(path, `'${field}' 是列表字段（../types.ts LIST_FIELDS），scalar guard 不定义列表语义`)
  }
  return field
}

function compileWhen(v: unknown, path: string): TrackPredicate | undefined {
  if (v === undefined) return undefined
  const rec = asRecord(v, path)
  if (rec.kind !== 'track-in' && rec.kind !== 'track-not-in') {
    compileError(`${path}.kind`, `必须是 'track-in' | 'track-not-in'（实际 ${JSON.stringify(rec.kind)}）`)
  }
  const values = stringArray(rec.values, `${path}.values`)
  rejectExtraKeys(rec, WHEN_ALLOWED_KEYS, path) // 闭集：when 只允许 kind/values（阻断 3，覆盖嵌套 when）
  return { kind: rec.kind, values }
}

/** when 存在才落键——IR 里不留 `when: undefined` 的悬挂键（冻结产物形状可预期）。 */
function withWhen<T extends object>(config: T, when: TrackPredicate | undefined): T & { when?: TrackPredicate } {
  return when === undefined ? config : { ...config, when }
}

/** 单个 guard 编译。nonempty-output 是一对多展开，故返回数组。 */
function compileGuard(raw: unknown, path: string, outputs: readonly FieldRef[]): CompiledGuardConfig[] {
  const rec = asRecord(raw, path)
  // 阻断 3（覆盖顶层）：结构化输入（server workflows 直调、绕过 parse）里变体白名单外的附加顶层键
  // 此前能过 compile、再被 serialize 静默丢弃（如 {type:'nonempty-output', n:2}、
  // {type:'tasks-at-least', n:1, field:'plan'}）；这里 fail-loud。允许键 = type + 可选 when + 本变体
  // GUARD_DATA_KEYS（与 parse 共用同一张表）。未知 type 不在表里 → 跳过本闸，留给下面 switch 的
  // default 报「未知 guard type」（错误定位到 .type，不被本闸抢走）。
  // hasOwnProperty（非 `in`）：避开原型链上的 'toString' 等——那些应落到 switch default 报「未知
  // guard type」，而非在此把继承成员当 data 键去 spread。
  if (typeof rec.type === 'string' && Object.prototype.hasOwnProperty.call(GUARD_DATA_KEYS, rec.type)) {
    const dataKeys = GUARD_DATA_KEYS[rec.type as keyof typeof GUARD_DATA_KEYS]
    rejectExtraKeys(rec, new Set<string>(['type', 'when', ...dataKeys]), path)
  }
  const when = compileWhen(rec.when, `${path}.when`)
  switch (rec.type) {
    case 'tasks-at-least': {
      const n = rec.n
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
        compileError(`${path}.n`, `必须是非负整数（parse.ts 的 \\d+ 口径；实际 ${JSON.stringify(n)}）`)
      }
      return [withWhen({ type: 'tasks-at-least' as const, n }, when)]
    }
    case 'nonempty-output':
      // v1 兼容 guard 下沉（G2 P2 兼容回退）：逐 output 分流——
      //   · 已知非列表字段 → field-nonempty（真求值 typed guard，运行期读标量）；
      //   · 列表字段 / 未知惰性字段 → output-present（保留 v1 旧运行期失败语义：数组/未设 → ''
      //     → 普通 guard failure，见 ir.ts OutputPresentGuard）。
      // 刻意不走 scalarField（那会对列表/未知字段编译期拒）——nonempty-output 是 v1 兼容 guard，
      // 其列表/惰性下沉走旧运行期失败，与「新 scalar guard 引用列表字段编译期拒」（P1，仍生效于
      // field-nonempty 等 typed guard）分道。
      return outputs.map((o) =>
        KNOWN_FIELDS.has(o.field) && !LIST_FIELD_SET.has(o.field)
          ? withWhen({ type: 'field-nonempty' as const, field: o.field as FieldName }, when)
          : withWhen({ type: 'output-present' as const, field: o.field }, when),
      )
    case 'field-nonempty':
      return [withWhen({ type: 'field-nonempty' as const, field: scalarField(rec.field, `${path}.field`) }, when)]
    case 'file-exists': {
      const p = asRecord(rec.path, `${path}.path`)
      if (p.kind !== 'field') {
        compileError(`${path}.path.kind`, `必须是 'field'（实际 ${JSON.stringify(p.kind)}）`)
      }
      const field = scalarField(p.field, `${path}.path.field`)
      rejectExtraKeys(p, PATH_ALLOWED_KEYS, `${path}.path`) // 闭集：path 只允许 kind/field（阻断 3，覆盖嵌套 path）
      return [withWhen({ type: 'file-exists' as const, path: { kind: 'field' as const, field } }, when)]
    }
    case 'field-equals': {
      const value = rec.value
      if (typeof value !== 'string') compileError(`${path}.value`, `必须是字符串（实际 ${JSON.stringify(value)}）`)
      // 阻断 2：value 必须经 serialize→parse 往返域（representable.ts 委托 text/representable 通用面
      // + 叠加 U+2028/U+2029 行解析限制），否则「保存成功、下次 loadWorkflow 打不开」——compile
      // fail-loud。与 tracks/representable 对「lone surrogate + 控制字符」通用域一致（cross-check 守）。
      const unrep = fieldEqualsValueUnrepresentableReason(value)
      if (unrep) compileError(`${path}.value`, unrep)
      return [withWhen({ type: 'field-equals' as const, field: scalarField(rec.field, `${path}.field`), value }, when)]
    }
    case 'field-in': {
      const values = stringArray(rec.values, `${path}.values`)
      if (values.length === 0) compileError(`${path}.values`, '不得是空数组（至少一个合法值）')
      return [
        withWhen(
          { type: 'field-in' as const, field: scalarField(rec.field, `${path}.field`), values: values as [string, ...string[]] },
          when,
        ),
      ]
    }
    case 'full-direct-override':
      return [withWhen({ type: 'full-direct-override' as const }, when)]
    case 'build-head-unchanged': {
      if (rec.field !== 'build_sha') {
        compileError(`${path}.field`, `必须是 'build_sha'（barrier 只定义在 build 冻结 SHA 上；实际 ${JSON.stringify(rec.field)}）`)
      }
      return [withWhen({ type: 'build-head-unchanged' as const, field: 'build_sha' as const }, when)]
    }
    default:
      compileError(`${path}.type`, `未知 guard type ${JSON.stringify(rec.type)}（闭集见 types.ts WorkflowGuardConfig）`)
  }
}

function compileGuards(raw: unknown, path: string, outputs: readonly FieldRef[]): CompiledGuardConfig[] {
  if (raw === undefined) return []
  return asArray(raw, path).flatMap((g, j) => compileGuard(g, `${path}[${j}]`, outputs))
}

/** 单 step 的 guard 下沉（stepGuard.evaluateStepGuards / check 预览复用）：等价 compileStep 里
 *  guards 的编译，但不编译 step 其它面。nonempty-output 按 step.outputs 展开为 field-nonempty，
 *  malformed guard/字段闭集越界一律 fail-loud（与整表编译同口径）。 */
export function compileStepGuards(step: StepDef): CompiledGuardConfig[] {
  const rec = asRecord(step, 'step')
  return compileGuards(rec.guards, 'step.guards', asArray(rec.outputs, 'step.outputs') as readonly FieldRef[])
}

function compileAction(raw: unknown, path: string): ActionConfig {
  const rec = asRecord(raw, path)
  if (typeof rec.type !== 'string' || !ACTION_TYPES.has(rec.type)) {
    compileError(`${path}.type`, `未知 action type ${JSON.stringify(rec.type)}（闭集见 ir.ts ActionConfig）`)
  }
  return { type: rec.type as ActionConfig['type'] }
}

function compileActions(raw: unknown, path: string): ActionConfig[] {
  if (raw === undefined) return []
  return asArray(raw, path).map((a, j) => compileAction(a, `${path}[${j}]`))
}

/**
 * inputs/outputs 的 field 编译（G2 P2 兼容回退——pre-P2 的 FieldRef.field 是 string）：
 *   · 三种 type（string|boolean|file_path）一视同仁 → 允许未知惰性字段（field ∉ FIELD_ORDER 原样
 *     保留，非空即可）。pre-P2 声明非 FIELD_ORDER 惰性 output/input（不挂 guard/显式 artifact）的旧
 *     workflow 能加载、能跑转换图、能参与「前序 output→后序 input」定义层依赖校验——惰性 ref 不参与
 *     状态写入，但保留在 IR 里供依赖校验/展示。字符集/往返合法性由 validate.ts 的 IDENT_RE 把关
 *     （serialize/parse 往返域）。
 *   · 阻断 1：此前对未知 type:'file_path' field 直接 knownField 拒（残留 P1 严格面），误杀 pre-P2 能载的
 *     `outputs: [{field: custom_report, type: file_path}]`——artifact 派生规则不能倒推改变旧 definition
 *     的合法域。现放宽为惰性 ref，artifact 派生下沉到 compileArtifacts 只对**已知** file_path output 生效。
 * guard/显式 artifact 对字段的 FIELD_ORDER 严格校验各自在其编译点保留（scalarField / compileArtifact
 * 的 knownField），不受本放宽影响——即「新 typed guard / 显式 artifact 声明仍只能引用 FIELD_ORDER」。
 */
function compileFieldRef(raw: FieldRef, path: string): FieldRef {
  const rec = asRecord(raw, path)
  const type = rec.type
  if (type !== 'string' && type !== 'file_path' && type !== 'boolean') {
    compileError(`${path}.type`, `必须是 ${FIELD_TYPES.join(' | ')}（实际 ${JSON.stringify(type)}）`)
  }
  // 阻断 1：三种 type（string|boolean|file_path）的 field 一律作惰性 ref 保留（非空字符串即可）——
  // pre-P2 的 FieldRef.field 是任意 string、不按 type 收窄，未知 file_path output 也能加载。字符集/
  // 往返合法性由 validate.ts 的 IDENT_RE 把关。artifact 只在「已知 file_path output」派生
  // （compileArtifacts 用 KNOWN_FIELDS 过滤），未知 file_path 不派生——新增 artifact IR 不能倒推收窄
  // 旧 definition 的合法域（此前对未知 file_path 直接 knownField 拒，误杀 pre-P2 能载的惰性 output）。
  const field = nonemptyString(rec.field, `${path}.field`)
  return { field, type }
}

function compileSkillRef(raw: SkillRef, path: string): SkillRef {
  const rec = asRecord(raw, path)
  const id = nonemptyString(rec.id, `${path}.id`)
  if (rec.depends_on === undefined) return { id }
  return { id, depends_on: stringArray(rec.depends_on, `${path}.depends_on`) }
}

/** 显式 artifact 声明的编译。kind 只一个合法值；producerPolicy 属 PRODUCER_POLICIES 闭集，缺省补
 *  'effective-step-skills'（custom 派生默认），给错拒绝。声明保留作者给定的 policy（default.yaml 用
 *  'effective-phase-skills'）。 */
function compileArtifact(raw: unknown, path: string, outputs: readonly FieldRef[], allowedPolicies: ReadonlySet<string>): ArtifactDeclaration {
  const rec = asRecord(raw, path)
  if (rec.kind !== undefined && rec.kind !== 'file') {
    compileError(`${path}.kind`, `必须是 'file'（实际 ${JSON.stringify(rec.kind)}）`)
  }
  if (rec.producerPolicy !== undefined) {
    // 先过语法层全闭集（越界 token fail-loud），再过 origin 相容白名单（A 契约 fail-loud）。
    if (typeof rec.producerPolicy !== 'string' || !PRODUCER_POLICIES.has(rec.producerPolicy)) {
      compileError(`${path}.producerPolicy`, `必须是 ${[...PRODUCER_POLICIES].map((p) => `'${p}'`).join(' | ')}（实际 ${JSON.stringify(rec.producerPolicy)}）`)
    }
    if (!allowedPolicies.has(rec.producerPolicy)) {
      compileError(
        `${path}.producerPolicy`,
        `custom workflow 不允许 producerPolicy '${rec.producerPolicy}'（A 契约：custom artifact 只能 ${[...allowedPolicies].map((p) => `'${p}'`).join(' | ')}；effective-phase-skills 仅 default 轨适用）`,
      )
    }
  }
  const producerPolicy = (rec.producerPolicy ?? 'effective-step-skills') as ArtifactProducerPolicy
  const field = knownField(rec.field, `${path}.field`)
  const ref = outputs.find((o) => o.field === field)
  if (!ref) {
    compileError(`${path}.field`, `artifact 只能挂在本 step outputs 声明的字段上（'${field}' 不在 outputs 里）`)
  }
  if (ref.type !== 'file_path') {
    compileError(`${path}.field`, `artifact 只许挂 type:'file_path' 的 FieldRef（'${field}' 声明为 '${ref.type}'）`)
  }
  const requiredWhen = compileWhen(rec.requiredWhen, `${path}.requiredWhen`)
  const base: ArtifactDeclaration = { kind: 'file', field, producerPolicy }
  return requiredWhen === undefined ? base : { ...base, requiredWhen }
}

/** 派生默认（file_path 输出逐条）+ 显式声明按 field 替换派生条目；顺序 = outputs 声明序。 */
function compileArtifacts(
  rawExplicit: unknown,
  path: string,
  outputs: readonly FieldRef[],
  outputsPath: string,
  allowedPolicies: ReadonlySet<string>,
): ArtifactDeclaration[] {
  const byField = new Map<FieldName, ArtifactDeclaration>()
  outputs.forEach((o, j) => {
    if (o.type !== 'file_path') return
    // 阻断 1：只有「已知 file_path output」派生 artifact；未知 file_path 是惰性 ref（不派生、不参与
    // 状态写入），与未知 string/boolean 一视同仁——不能因 artifact 派生规则倒推拒绝 pre-P2 能载的
    // 未知 file_path output。同 field 的重复 file_path output 仍在此拦（仅对已知字段有 artifact 派生
    // 语义，才谈得上「重复派生同一 artifact」）。
    if (!KNOWN_FIELDS.has(o.field)) return
    const field = o.field as FieldName
    if (byField.has(field)) {
      compileError(`${outputsPath}[${j}].field`, `'${field}' 重复声明（同 field 的 file_path output 已在前面出现）`)
    }
    byField.set(field, { kind: 'file', field, producerPolicy: 'effective-step-skills' })
  })
  if (rawExplicit !== undefined) {
    const seen = new Set<FieldName>()
    asArray(rawExplicit, path).forEach((a, j) => {
      const artifact = compileArtifact(a, `${path}[${j}]`, outputs, allowedPolicies)
      if (seen.has(artifact.field)) {
        compileError(`${path}[${j}].field`, `'${artifact.field}' 重复声明`)
      }
      seen.add(artifact.field)
      byField.set(artifact.field, artifact)
    })
  }
  return [...byField.values()]
}

function compileTransition(raw: StepTransition, path: string, outputs: readonly FieldRef[]): StepTransitionIR {
  const rec = asRecord(raw, path)
  return {
    event: nonemptyString(rec.event, `${path}.event`),
    to: nonemptyString(rec.to, `${path}.to`),
    guards: compileGuards(rec.guards, `${path}.guards`, outputs),
    actions: compileActions(rec.actions, `${path}.actions`),
  }
}

function compileStep(step: StepDef, index: number, allowedPolicies: ReadonlySet<string>): StepIR {
  const path = `steps[${index}]`
  const rec = asRecord(step, path)
  const id = nonemptyString(rec.id, `${path}.id`)
  if (typeof rec.label !== 'string') compileError(`${path}.label`, `必须是字符串（实际 ${JSON.stringify(rec.label)}）`)
  const gate = rec.gate
  if (gate !== null && gate !== 'review' && gate !== 'confirm') {
    compileError(`${path}.gate`, `必须是 null | 'review' | 'confirm'（实际 ${JSON.stringify(gate)}）`)
  }
  const prompt = rec.prompt
  if (prompt !== undefined) {
    if (typeof prompt !== 'string') compileError(`${path}.prompt`, `必须是字符串（实际 ${JSON.stringify(prompt)}）`)
    if (prompt.includes('\0')) compileError(`${path}.prompt`, '不得含 NUL（环境与子进程参数无法保真承载）')
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(prompt)) {
      compileError(`${path}.prompt`, '含未配对 UTF-16 surrogate，UTF-8 落盘无法往返')
    }
  }
  const skills = asArray(rec.skills, `${path}.skills`).map((s, j) => compileSkillRef(s as SkillRef, `${path}.skills[${j}]`))
  const inputs = asArray(rec.inputs, `${path}.inputs`).map((r, j) => compileFieldRef(r as FieldRef, `${path}.inputs[${j}]`))
  const outputs = asArray(rec.outputs, `${path}.outputs`).map((r, j) => compileFieldRef(r as FieldRef, `${path}.outputs[${j}]`))
  // 不预折 `?? []`：null/非数组的显式 malformed 必须进 compileGuards 被 fail-loud 拒绝，
  // 只有 undefined（真未声明）才吃默认 []（compileGuards 自身的口径）。
  const guards = compileGuards(rec.guards, `${path}.guards`, outputs)
  const artifacts = compileArtifacts(rec.artifacts, `${path}.artifacts`, outputs, `${path}.outputs`, allowedPolicies)
  const transitions = asArray(rec.transitions, `${path}.transitions`).map((t, j) =>
    compileTransition(t as StepTransition, `${path}.transitions[${j}]`, outputs),
  )
  return {
    id, label: rec.label, gate: gate as GateKind,
    ...(prompt === undefined ? {} : { prompt }),
    skills, inputs, outputs, guards, artifacts, transitions,
  }
}

/** 产物全是本文件新建的纯数据树（无环、无函数键），直接后序递归冻结。 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

function compileWith(def: WorkflowDef, allowedPolicies: ReadonlySet<string>): WorkflowIR {
  const rec = asRecord(def, 'workflow')
  const name = nonemptyString(rec.name, 'name')
  const openspecContract = rec.openspecContract
  if (openspecContract !== undefined && openspecContract !== 'required') {
    compileError('openspecContract', `必须是 'required'（实际 ${JSON.stringify(openspecContract)}）`)
  }
  const steps = asArray(rec.steps, 'steps').map((s, i) => compileStep(s as StepDef, i, allowedPolicies))
  return deepFreeze({ name, ...(openspecContract === undefined ? {} : { openspecContract }), steps })
}

/**
 * 通用编译入口 = **custom 契约**（G2 P5 · A 契约钉死）：拒绝任何 effective-phase-skills artifact
 * （fail-loud）。loadWorkflow（项目 custom yaml 的 validate/compile 路径）、cli/server 的 custom
 * transition adapter 全走此入口——它们加载的都是 custom workflow。default 运行时 artifact 走 P4
 * codegen 表、不经本函数；default 生成校验/内部测试走下方 compileDefaultWorkflow。
 */
export function compileWorkflow(def: WorkflowDef): WorkflowIR {
  return compileWith(def, CUSTOM_PRODUCER_POLICIES)
}

/**
 * default 生成校验/内部专用入口（G2 P5 · A 契约钉死）：允许 effective-phase-skills（default.yaml 的
 * phase policy 声明）。**绝不以 def.name==='default' 猜 origin**——本入口是显式的、内部/生成验证专用
 * 边界；default 运行时 artifact 消费 P4 codegen 表，不由通用 compileWorkflow 承担 default 运行。
 */
export function compileDefaultWorkflow(def: WorkflowDef): WorkflowIR {
  return compileWith(def, DEFAULT_PRODUCER_POLICIES)
}
