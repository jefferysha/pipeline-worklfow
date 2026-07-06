/**
 * compress —— 上下文压缩类型契约（BACKLOG #30 / GOAL B13·D11：对标 Comet CONTEXT-COMPRESSION）。
 *
 * 思想：phase handoff（design→build / build→verify / verify→ship）时，把上游产出的长文档
 * （design_doc / plan / verification_report）**确定性**压缩为结构化摘要传给下游——保留关键
 * 决策 / 约束 / 待办 / 结构骨架，去除叙述正文 / 代码体 / 样板。零 LLM（纯规则，可测可 oracle），
 * 压缩率可量化（原字符 → 压缩字符，字符数是确定性 token 代理，不引 tokenizer 依赖）。
 *
 * 超越判据（D11 vs Comet）：① 确定性（同输入同输出，可回归 oracle）；② 结构化产出（headings/
 * decisions/constraints/openTodos/keyFields 分桶，非纯文本 blob）；③ 压缩率逐文档 + 聚合量化。
 */

/** front-matter / key:value 键值对 */
export interface KeyField {
  key: string
  value: string
}

/** 压缩率统计（字符/行双口径；ratio = 1 - 压缩/原） */
export interface CompressStats {
  originalChars: number
  originalLines: number
  compressedChars: number
  compressedLines: number
  /** 保留的信号行数（headings + decisions + constraints + openTodos + keyFields） */
  keptLines: number
  /** 丢弃行数（原行数 - 保留数，下界 0） */
  droppedLines: number
  /** 压缩率 1 - 压缩/原（4 位小数；原为 0 → 0；短文档膨胀可为负，诚实报告） */
  ratio: number
}

/** 单文档结构化压缩产物 */
export interface CompressedDoc {
  /** 首个 H1 文本（无 → null） */
  title: string | null
  /** 标题骨架（带 # 级别前缀，去重保序） */
  headings: string[]
  /** 决策行（去 bullet/引用前缀，去重保序） */
  decisions: string[]
  /** 约束行（同上） */
  constraints: string[]
  /** 未完成 todo 文本（不含已完成） */
  openTodos: string[]
  /** 已完成 todo 计数（压缩掉正文但保留计量） */
  doneTodoCount: number
  /** front-matter 键值 */
  keyFields: KeyField[]
  stats: CompressStats
}

export interface CompressOptions {
  /** 标题骨架最大深度（默认 6，即全保留） */
  maxHeadingDepth?: number
}
