/**
 * cli 依赖注入面 —— 命令逻辑全部是接受 CliDeps 的纯函数（CONTRACT §4 agent:cli）。
 * store/flow 按 types.ts 契约注入；测试全 mock，绝不 import kernel 实现。
 */
import type { FlowEngine, HistoryWriter, StateStore } from '@pipeline-lite/kernel'

export interface GateMarkerInfo {
  kind: 'confirm' | 'review' | 'interaction'
  /** marker 年龄毫秒（now - mtime） */
  ageMs: number
  /** marker 原文（transition 落的三行格式：相位\n指引\nchange 名，老内核同款） */
  raw: string
}

export interface CliIO {
  /** 写一行到 stdout（实现负责补 '\n'） */
  out(line: string): void
  /** 写一行到 stderr（实现负责补 '\n'） */
  err(line: string): void
}

export interface CliDeps {
  store: StateStore
  flow: FlowEngine
  /** 项目根：change 定位在 <cwd>/openspec/changes/<name>/ */
  cwd: string
  io: CliIO
  /** ISO8601 UTC 注入时钟（CONTRACT §5.6：业务码禁止散落 new Date()） */
  clock: () => string
  /** 枚举 changesRoot 下的活跃 change 目录名（不含 archive 目录）；main.ts 用 fs 实现 */
  listChanges: (changesRoot: string) => Promise<string[]>
  /**
   * transition 成功后写 openspec/changes/<name>/.breadcrumb（CONTRACT §5.4，
   * hook shim 只 cat 该缓存）。best-effort：失败仅 WARN，不影响已完成的转换。
   */
  writeBreadcrumb?: (changeDir: string, content: string) => Promise<void>
  /** lite 历史 .pipeline-history.jsonl appender（CONTRACT §1）。best-effort。 */
  history?: HistoryWriter
  /** 读 .pipeline-history.jsonl 原文（缺失 → 空串）。import 幂等哨兵检查用 */
  readHistoryRaw?: (changeDir: string) => Promise<string>
  /**
   * 读项目根的三门 marker（缺失 → 不出现在数组里）。main.ts 用 fs 实现；
   * 新鲜判定（GATE_FRESH_MS）是 inbox 命令的职责，这里只报原始年龄。
   */
  readGateMarkers?: () => Promise<GateMarkerInfo[]>
  /**
   * `git rev-parse HEAD` 的 stdout（trim 后；非 git 仓 → 空串）。
   * 对齐老内核 build-complete 的 `$(git rev-parse HEAD 2>/dev/null || echo "")` 口径：
   * 失败也取 stdout——unborn 仓会捕获到字面 "HEAD"（T6 实测怪癖，oracle parity 需要）。
   */
  gitHeadSha?: () => Promise<string>
  /**
   * 进入 review 相位（manifest.reviewPhases）时写 <cwd>/.pipeline-pending-review 门 marker
   * （老内核 state-transition.sh 语义：三行 = 相位\n指引\nchange 名）。best-effort。
   */
  writeReviewMarker?: (content: string) => Promise<void>
}

/** 统一错误消息提取（避免各命令散落 String(e) 口径） */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
