/**
 * spec-template-scaffold —— 按项目类型预写分层空文档集 + 三态写盘计划（纯逻辑）。
 *
 * 老仓真相源（严格只读参考）：
 *   registry-source.sh:152-184  apply_strategy <src> <dst> <skip|overwrite|append> + _copy_missing
 *     · skip:      dst 存在 → return 1（信号「未下载」，保留用户文件）；否则全量拷。
 *     · overwrite: dst 存在 → 先 rm -rf 再全量拷。
 *     · append:    cp -Rn / _copy_missing —— 只补不存在的文件（含嵌套），保留既有。
 *
 * Tenon contract 语义（parity 收尾 ①「Blank spec doc scaffold (backend/frontend/guides)」）：
 *   Tenon contract init 时按项目类型铺一套**分层空 spec 文档**（前端/后端/指南）。老仓 partial：spec 骨架
 *   靠 openspec + CONTEXT.md + docs/superpowers/specs 目录，无按类型预写的分层空文档集。本模块补齐
 *   构造性等价物：SPEC_DOC_LAYOUTS 按 web/cli/lib 声明分层文档清单，buildSpecScaffold 渲染成
 *   带 marker 的空 stub（explore 阶段填充的骨架），planDocScaffold 复刻 apply_strategy 三态写盘决策。
 *
 * kernel 零第三方依赖：本文件纯字符串/集合逻辑，fs 副作用全在 CLI 注入（ScaffoldFs）。
 */
import type { DocumentLocale } from '../types.js'

// ── 项目类型 ─────────────────────────────────────────────────────────────
export type ProjectType = 'web' | 'cli' | 'lib'
export const PROJECT_TYPES: readonly ProjectType[] = ['web', 'cli', 'lib']
export function isProjectType(v: string): v is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(v)
}

// ── 三态策略（对标 apply_strategy）────────────────────────────────────────
export type DocStrategy = 'skip' | 'overwrite' | 'append'
export const DOC_STRATEGIES: readonly DocStrategy[] = ['skip', 'overwrite', 'append']
export function isDocStrategy(v: string): v is DocStrategy {
  return (DOC_STRATEGIES as readonly string[]).includes(v)
}

// ── spec 目录约定（对标 kernel state/spec.ts SPECS_DIR）──────────────────
/** 默认 spec 目录（openspec/specs，与 living-spec 子系统对齐）。 */
export const DEFAULT_SPEC_DIR = 'openspec/specs'
/** scaffold 生成标记（HTML 注释，识别「本工具铺的空文档」用；也是 explore 阶段替换点）。 */
export const SCAFFOLD_MARKER = '<!-- pipeline:scaffold -->'

// ── 分层文档清单（按项目类型预写）────────────────────────────────────────
export interface DocSpec {
  /** 相对 spec 目录的路径（不含 spec 目录前缀） */
  rel: string
  title: string
  summary: string
}
export interface DocFile {
  /** 相对 cwd 的完整路径（含 spec 目录前缀） */
  rel: string
  content: string
}

/**
 * 各项目类型的分层空文档集（对标 Tenon contract backend/frontend/guides，按 pipeline 类型分化）：
 *  · web —— frontend + backend + guides（全栈）
 *  · cli —— commands + guides（命令行工具）
 *  · lib —— api + guides（库）
 * 每层至少一份 README + 关键文档，均为空 stub（explore 阶段填充）。
 */
export const SPEC_DOC_LAYOUTS: Record<ProjectType, readonly DocSpec[]> = {
  web: [
    { rel: 'frontend/README.md', title: '前端规格', summary: '前端范围、页面/路由、组件契约。' },
    { rel: 'frontend/components.md', title: '组件契约', summary: '关键组件的 props/状态/交互契约。' },
    { rel: 'backend/README.md', title: '后端规格', summary: '后端范围、服务边界、职责划分。' },
    { rel: 'backend/api.md', title: 'API 契约', summary: '对外 HTTP/RPC 接口的请求/响应契约。' },
    { rel: 'backend/data-model.md', title: '数据模型', summary: '实体、关系、持久化与迁移约束。' },
    { rel: 'guides/getting-started.md', title: '入门指南', summary: '本地起步、运行、调试路径。' },
    { rel: 'guides/architecture.md', title: '架构', summary: '系统分层、依赖方向、关键决策。' },
  ],
  cli: [
    { rel: 'commands/README.md', title: '命令面', summary: '命令/子命令清单与总体心智模型。' },
    { rel: 'commands/reference.md', title: '命令参考', summary: '逐命令 flag、退出码、stdout/stderr 契约。' },
    { rel: 'guides/getting-started.md', title: '入门指南', summary: '安装、一行上手、5 分钟心智模型。' },
    { rel: 'guides/architecture.md', title: '架构', summary: '内核/命令分层、依赖注入面、可移植性。' },
  ],
  lib: [
    { rel: 'api/README.md', title: '公共 API', summary: '对外导出面、稳定性承诺、版本策略。' },
    { rel: 'api/reference.md', title: 'API 参考', summary: '逐符号签名、参数/返回契约、错误语义。' },
    { rel: 'guides/getting-started.md', title: '入门指南', summary: '安装、最小可用示例、集成路径。' },
    { rel: 'guides/architecture.md', title: '架构', summary: '内部分层、纯逻辑/副作用边界、扩展点。' },
  ],
}

const EN_SPEC_DOC_LAYOUTS: Record<ProjectType, readonly DocSpec[]> = {
  web: [
    { rel: 'frontend/README.md', title: 'Frontend Spec', summary: 'Frontend scope, pages/routes, and component contracts.' },
    { rel: 'frontend/components.md', title: 'Component Contracts', summary: 'Props, state, and interaction contracts for key components.' },
    { rel: 'backend/README.md', title: 'Backend Spec', summary: 'Backend scope, service boundaries, and responsibilities.' },
    { rel: 'backend/api.md', title: 'API Contracts', summary: 'Request and response contracts for external HTTP/RPC interfaces.' },
    { rel: 'backend/data-model.md', title: 'Data Model', summary: 'Entities, relationships, persistence, and migration constraints.' },
    { rel: 'guides/getting-started.md', title: 'Getting Started', summary: 'Local setup, execution, and debugging paths.' },
    { rel: 'guides/architecture.md', title: 'Architecture', summary: 'System layers, dependency direction, and key decisions.' },
  ],
  cli: [
    { rel: 'commands/README.md', title: 'Command Surface', summary: 'Commands, subcommands, and the overall mental model.' },
    { rel: 'commands/reference.md', title: 'Command Reference', summary: 'Flags, exit codes, and stdout/stderr contracts by command.' },
    { rel: 'guides/getting-started.md', title: 'Getting Started', summary: 'Installation, first command, and a five-minute mental model.' },
    { rel: 'guides/architecture.md', title: 'Architecture', summary: 'Kernel/command layers, dependency injection, and portability.' },
  ],
  lib: [
    { rel: 'api/README.md', title: 'Public API', summary: 'Exports, stability commitments, and versioning policy.' },
    { rel: 'api/reference.md', title: 'API Reference', summary: 'Symbol signatures, parameters, return contracts, and errors.' },
    { rel: 'guides/getting-started.md', title: 'Getting Started', summary: 'Installation, a minimal example, and integration paths.' },
    { rel: 'guides/architecture.md', title: 'Architecture', summary: 'Internal layers, pure/effect boundaries, and extension points.' },
  ],
}

/** 渲染一份空文档 stub：marker + 标题 + summary + 待填写占位（explore 阶段填充）。 */
export function renderScaffoldDoc(spec: DocSpec, locale: DocumentLocale = 'zh-CN'): string {
  const prompt = locale === 'zh-CN'
    ? '[待填写:explore] 在 explore/spec 阶段补全本文档；完成后删除本行与 scaffold marker。'
    : '[pending:explore] Complete this document during explore/spec, then remove this line and the scaffold marker.'
  return (
    `${SCAFFOLD_MARKER}\n` +
    `# ${spec.title}\n\n` +
    `${spec.summary}\n\n` +
    `> ${prompt}\n`
  )
}

/**
 * 按项目类型构建分层空文档集（DocFile[]，rel 含 spec 目录前缀）。
 * specDir 缺省 openspec/specs；rel 顺序 = SPEC_DOC_LAYOUTS 声明序（可复现）。
 */
export function buildSpecScaffold(
  type: ProjectType,
  specDir: string = DEFAULT_SPEC_DIR,
  locale: DocumentLocale = 'zh-CN',
): DocFile[] {
  const base = specDir.replace(/\/+$/, '')
  const layout = locale === 'zh-CN' ? SPEC_DOC_LAYOUTS[type] : EN_SPEC_DOC_LAYOUTS[type]
  return layout.map((spec) => ({
    rel: `${base}/${spec.rel}`,
    content: renderScaffoldDoc(spec, locale),
  }))
}

// ── 三态写盘计划（对标 apply_strategy，纯决策；fs 由 CLI 执行）─────────────
export interface DocPlan {
  strategy: DocStrategy
  /** 要写盘的文件 */
  writes: DocFile[]
  /** overwrite 下需先删的现存 rel（升序） */
  removes: string[]
  /** 未写而保留的现存 rel（append 的既有 / skip 的全部） */
  skipped: string[]
  /** skip 策略遇冲突 → 整体跳过信号（对标 apply_strategy skip=存在则不动返非零） */
  skippedAll: boolean
}

/**
 * 计算三态写盘计划。existing = 已在磁盘上的 rel 集合（∈ files 的 rel）。
 *  · skip:      existing 非空 → 整体跳过（skippedAll，保留用户文件）；否则全量写。
 *  · overwrite: removes = 现存 rel（升序），writes = 全量。
 *  · append:    writes = 缺失的（rel ∉ existing），skipped = 既有的。
 * 纯函数，不改入参、不触 fs。
 */
export function planDocScaffold(
  files: readonly DocFile[],
  existing: ReadonlySet<string>,
  strategy: DocStrategy,
): DocPlan {
  const present = files.filter((f) => existing.has(f.rel))
  if (strategy === 'skip') {
    if (present.length > 0) {
      return { strategy, writes: [], removes: [], skipped: files.map((f) => f.rel), skippedAll: true }
    }
    return { strategy, writes: [...files], removes: [], skipped: [], skippedAll: false }
  }
  if (strategy === 'overwrite') {
    return {
      strategy,
      writes: [...files],
      removes: present.map((f) => f.rel).sort(),
      skipped: [],
      skippedAll: false,
    }
  }
  // append —— 只补缺失
  const writes = files.filter((f) => !existing.has(f.rel))
  return {
    strategy,
    writes,
    removes: [],
    skipped: present.map((f) => f.rel),
    skippedAll: false,
  }
}
