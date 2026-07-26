/**
 * config 域 —— dashboard Settings「相位 × 轨道 强制技能矩阵」的读 + 写后端
 * （GOAL A3 「config 写端点为可选增量」的收编；SettingsView 矩阵 tab 此前只有只读预览）。
 *
 * "config" 由两份真相合成：全机 templates/manifest.yaml 的 `mandatory_skills:` 小节，及
 * 当前 Project 的 kernel effective Track Registry。GET 快照因此必须绑定 root；写端仍只改
 * 全机 manifest 的既有 mandatory-skills 接缝，不在本模块虚构 track 保存能力。
 *
 * 读：直接消费 kernel loadManifest + loadTrackRegistry（只 import 不改），零重复解析/合成逻辑。
 * 写：kernel 只导出了读手（loadManifest），未导出 manifest 写手；本模块不碰 kernel、
 * 自实现最小"外科手术式"文本替换——只在 mandatory_skills 小节内定位/替换/追加目标
 * `phase.track: [skill, ...]` 行，小节内其余行（含缩进注释、空行）逐字节保留。写前必须
 * 真过 kernel loadManifest 重解析校验（先写临时文件 → 真解析确认新值生效才原子 rename
 * 覆盖真文件；任何环节失败，原文件零改动、临时文件清理干净），绝不把半成品/损坏 YAML 落盘。
 *
 * 并发安全：复用 kernel 已导出的 withLock（mkdir 原子锁：进程内 FIFO 排队 + 跨进程陈锁回收），
 * 传入 manifest.yaml 所在目录，串行化并发写——与 transition.ts 用 store.withLock 串行化
 * 单个 change 目录是同一手法在不同粒度上的复用。
 *
 * 安全面：
 *   · manifestPath 由 server 启动装配注入（main.ts 固定拼出仓库 templates/manifest.yaml
 *     路径），不受请求 root 控制；root 只选择项目 Track Registry。
 *   · phase 限定 kernel PHASES 且拒 archive（archive 无强制 skill，manifest.yaml 注释自述此约定）。
 *   · track 限定 pm/frontend/backend（不接受 _all——UI 无此列，端点亦不接受，收窄可写面）。
 *   · skill token 白名单字符集（字母数字开头，其后允许 : _ . / | -），拒逗号/方括号/换行/
 *     空白/引号/# 等——防止 token 内容break 出所在的单行 flow-list `[...]` 语法（注入/损坏）。
 *   · 写手自身重复校验字符集与 phase/track 形状（纵深防线，不信任调用方已校验）。
 */
import { readFileSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { loadManifest, loadTrackRegistry, PHASES, withLock } from '@tenon/kernel'
import type { ExtendedManifestData, Phase, TrackDefinition, TrackValidationContext } from '@tenon/kernel'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** 端点可写 track（UI 矩阵列 = pm/frontend/backend；`_all` 兜底行只读展示，不经此端点改）。 */
export const EDITABLE_TRACKS = ['pm', 'frontend', 'backend'] as const
export type EditableTrack = (typeof EDITABLE_TRACKS)[number]
const EDITABLE_TRACK_SET: ReadonlySet<string> = new Set(EDITABLE_TRACKS)

/** skill token 白名单：字母数字开头，其后允许 `: _ . / | -`，长度 1-128（写手 + 校验双侧复用）。 */
export const SKILL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/|-]{0,127}$/
export const MAX_SKILLS = 50
const SECTION_HEADER_RE = /^mandatory_skills:\s*$/

/** 扁平 'phase.track' → skills 映射（GET /api/config 响应体形状；同前端 data.ts 镜像的形状）。 */
export type MandatorySkillsMap = Record<string, string[]>

/**
 * 纯派生：kernel ExtendedManifestData.mandatorySkills（嵌套 phase→track→skills 表）→
 * 扁平 'phase.track' 映射。只暴露 yaml 中实际声明过的键（含 `_all` 兜底键，供前端三级
 * 回退渲染只读预览）——不为未声明的 phase.track 组合填充空数组占位。
 */
export function flattenMandatorySkills(data: Pick<ExtendedManifestData, 'mandatorySkills'>): MandatorySkillsMap {
  const flat: MandatorySkillsMap = {}
  for (const phase of PHASES) {
    const row = data.mandatorySkills[phase] as Record<string, readonly string[] | undefined> | undefined
    if (!row) continue
    for (const track of Object.keys(row)) {
      const skills = row[track]
      if (skills) flat[`${phase}.${track}`] = [...skills]
    }
  }
  return flat
}

/** 真读 manifest.yaml（kernel loadManifest，零重复解析逻辑）→ 扁平映射。 */
export function readMandatorySkills(manifestPath: string): MandatorySkillsMap {
  return flattenMandatorySkills(loadManifest(manifestPath))
}

export interface ReadConfigSnapshotOptions {
  readonly manifestPath: string
  readonly repoRoot: string
  readonly trackValidationContext: TrackValidationContext
  readonly generatedAt: string
}

/** `/api/config?root=` 的 dashboard 契约；tracks 是 kernel effective registry 的保序 JSON 投影。 */
export interface ConfigSnapshot {
  readonly ok: true
  readonly generated_at: string
  readonly revision: string
  readonly source: 'builtin-only' | 'project-file'
  readonly mandatory_skills: MandatorySkillsMap
  readonly tracks: readonly TrackDefinition[]
  readonly mandatory_skills_writable_profiles: readonly EditableTrack[]
}

function projectTrack(track: TrackDefinition): TrackDefinition {
  return {
    id: track.id,
    label: track.label,
    builtin: track.builtin,
    workflow: {
      default: track.workflow.default,
      allowed: track.workflow.allowed === '*' ? '*' : [...track.workflow.allowed],
    },
    policyProfile: {
      reviewSeed: track.policyProfile.reviewSeed,
      ...(track.policyProfile.autoEnqueueOnSpecComplete === undefined
        ? {}
        : { autoEnqueueOnSpecComplete: track.policyProfile.autoEnqueueOnSpecComplete }),
      automationEligible: track.policyProfile.automationEligible,
      coverageProfile: track.policyProfile.coverageProfile,
      routing: track.policyProfile.routing.enabled
        ? {
            enabled: true,
            pattern: track.policyProfile.routing.pattern,
            ...(track.policyProfile.routing.excludePattern === undefined
              ? {}
              : { excludePattern: track.policyProfile.routing.excludePattern }),
            priority: track.policyProfile.routing.priority,
          }
        : { enabled: false },
      skills: {
        matrix: track.policyProfile.skills.matrix,
        profile: track.policyProfile.skills.profile,
      },
    },
  }
}

/**
 * 真读 manifest + 项目 registry。registry 解析/语义错误沿用 kernel fail-loud；绝不退回静态轨道。
 * 写能力只声明既有 POST 真实接受、且 effective track 自持同名 matrix profile 的交集。
 */
export function readConfigSnapshot(options: ReadConfigSnapshotOptions): ConfigSnapshot {
  const manifest = loadManifest(options.manifestPath)
  const registry = loadTrackRegistry(options.repoRoot, options.trackValidationContext)
  if (registry.ordered.length === 0) {
    throw new ConfigError('effective track registry 为空，拒绝生成 config 快照')
  }
  const hasWritableSection = readFileSync(options.manifestPath, 'utf8')
    .split('\n')
    .some((line) => SECTION_HEADER_RE.test(line))
  const writableProfiles = hasWritableSection
    ? EDITABLE_TRACKS.filter((profile) => {
        const track = registry.byId.get(profile)
        return track?.policyProfile.skills.matrix === true && track.policyProfile.skills.profile === profile
      })
    : []
  return {
    ok: true,
    generated_at: options.generatedAt,
    revision: registry.revision,
    source: registry.source,
    mandatory_skills: flattenMandatorySkills(manifest),
    tracks: registry.ordered.map(projectTrack),
    mandatory_skills_writable_profiles: writableProfiles,
  }
}

export interface MandatorySkillsEdit {
  phase: Phase
  track: EditableTrack
  skills: string[]
}

export type ValidationResult =
  | { ok: true; value: MandatorySkillsEdit }
  | { ok: false; error: string }

/** POST /api/config/mandatory-skills 请求体校验（fail-loud，明确错误文案，绝不静默纠正/丢弃）。 */
export function validateMandatorySkillsBody(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体须为 JSON 对象' }
  }
  const b = body as Record<string, unknown>
  const { phase, track, skills } = b

  if (typeof phase !== 'string' || !(PHASES as readonly string[]).includes(phase)) {
    return { ok: false, error: `phase 须为合法相位之一（${PHASES.join('/')}）` }
  }
  if (phase === 'archive') {
    return { ok: false, error: 'archive 相位无强制 skill（设计如此，不可写）' }
  }
  if (typeof track !== 'string' || !EDITABLE_TRACK_SET.has(track)) {
    return { ok: false, error: `track 须为 ${EDITABLE_TRACKS.join('/')} 之一` }
  }
  if (!Array.isArray(skills)) {
    return { ok: false, error: 'skills 须为字符串数组' }
  }
  if (skills.length > MAX_SKILLS) {
    return { ok: false, error: `skills 最多 ${MAX_SKILLS} 项` }
  }
  const seen = new Set<string>()
  for (const s of skills) {
    if (typeof s !== 'string' || !SKILL_TOKEN_RE.test(s)) {
      return {
        ok: false,
        error: `非法 skill token ${JSON.stringify(s)}（仅允许字母数字与 : _ . / | -，字母数字开头，长度 1-128）`,
      }
    }
    if (seen.has(s)) {
      return { ok: false, error: `skills 含重复项 '${s}'` }
    }
    seen.add(s)
  }
  return {
    ok: true,
    value: { phase: phase as Phase, track: track as EditableTrack, skills: [...skills] as string[] },
  }
}

// ── 写手：mandatory_skills 小节内的外科手术式文本替换 ──

/** 去掉整行/行尾注释（逐字复刻 kernel manifest.ts::stripComment——分类判定须与 kernel 解析器完全一致）。 */
function stripComment(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('#')) return ''
  const m = line.match(/^(.*?)\s#/)
  return (m ? m[1]! : line).trimEnd()
}

// 逐字对齐 kernel manifest.ts::parseSkillBlock 的条目正则——保证"这是不是一条 key: [..] 数据行"
// 的判定与 kernel 解析器完全一致，不会出现"kernel 认为是数据行，本模块当成不认识的格式"的分歧。
const ENTRY_RE = /^\s+([A-Za-z_][A-Za-z0-9_.-]*):\s*(\[.*\])\s*$/

function serializeEntry(key: string, skills: readonly string[]): string {
  return `  ${key}: [${skills.join(', ')}]`
}

/**
 * 真改盘 manifest.yaml：定位 mandatory_skills 小节内目标 `phase.track` 行，命中则原地替换、
 * 未命中则追加在小节最后一条已知条目之后；小节内其余行（含缩进注释、空行）逐字节保留。
 * withLock 串行化并发写；写后必须真过 kernel loadManifest 重解析 + 值核对，任何一步失败
 * 原文件零改动（写临时文件 → 校验通过才原子 rename，否则清理临时文件并抛 ConfigError）。
 */
export async function writeMandatorySkills(
  manifestPath: string,
  phase: string,
  track: string,
  skills: readonly string[],
): Promise<void> {
  // 纵深防线：写手不信任调用方已校验（哪怕上层 HTTP 校验被绕过、或未来新增调用方遗漏校验），
  // 重新确认字符集与 phase/track 形状，防止写出可 break 出 `[...]` flow-list 语法的行。
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(phase) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(track)) {
    throw new ConfigError(`writeMandatorySkills: 非法 phase/track（'${phase}'.'${track}'）`)
  }
  for (const s of skills) {
    if (!SKILL_TOKEN_RE.test(s)) {
      throw new ConfigError(`writeMandatorySkills: 非法 skill token '${s}'，拒绝写入`)
    }
  }
  const key = `${phase}.${track}`

  await withLock(dirname(manifestPath), async () => {
    const original = await readFile(manifestPath, 'utf8')
    const lines = original.split('\n')

    let sectionStart = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line !== undefined && SECTION_HEADER_RE.test(line)) {
        sectionStart = i
        break
      }
    }
    if (sectionStart < 0) {
      throw new ConfigError(`${manifestPath} 缺 mandatory_skills 小节，拒绝写入`)
    }
    let sectionEnd = lines.length
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const raw = lines[i]
      if (raw === undefined) continue
      if (raw.trim() === '') continue
      if (!/^\s/.test(raw)) {
        sectionEnd = i
        break
      }
    }

    const next = lines.slice()
    let found = false
    let lastEntryIdx = sectionStart
    for (let i = sectionStart + 1; i < sectionEnd; i++) {
      const line = lines[i]
      if (line === undefined) continue
      const stripped = stripComment(line)
      if (stripped.trim() === '') continue // 空行 / 纯注释行：透传保留，不视为数据行
      const m = ENTRY_RE.exec(stripped)
      if (!m) {
        throw new ConfigError(
          `${manifestPath}:${i + 1} 非预期的 mandatory_skills 条目格式，拒绝写入以防误改：'${lines[i]}'`,
        )
      }
      lastEntryIdx = i
      if (m[1] === key) {
        next[i] = serializeEntry(key, skills)
        found = true
      }
    }
    if (!found) {
      next.splice(lastEntryIdx + 1, 0, serializeEntry(key, skills))
    }

    const patched = next.join('\n')
    const tmpPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      await writeFile(tmpPath, patched, 'utf8')
      // 写后必须真过 kernel 解析器重验证——绝不凭字符串拼接自信，通不过就不碰真文件。
      let reparsed: ExtendedManifestData
      try {
        reparsed = loadManifest(tmpPath)
      } catch (e) {
        throw new ConfigError(
          `写入后 kernel 重解析失败，已中止（原文件未改动）：${e instanceof Error ? e.message : String(e)}`,
        )
      }
      const got = reparsed.mandatorySkills[phase as Phase]?.[track as EditableTrack]
      const want = [...skills]
      const same = Array.isArray(got) && got.length === want.length && got.every((v, idx) => v === want[idx])
      if (!same) {
        throw new ConfigError('写入后重解析校验值不一致，已中止（原文件未改动）')
      }
      await rename(tmpPath, manifestPath)
    } finally {
      await rm(tmpPath, { force: true })
    }
  })
}
