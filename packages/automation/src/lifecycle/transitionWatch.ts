/**
 * 沙箱内阶段回写（v5 决策 G / T4）—— 检出沙箱日志流里的 [TRANSITION] 行，把「沙箱内当前阶段」
 * 写入 change 的 automation_current_phase 字段，供进度详情显示「沙箱内阶段：verify（host 阶段
 * 在 run 结束后结算）」。
 *
 * 行格式唯一真相源：packages/cli/src/commands/transition.ts 的
 * `[TRANSITION] ${name}: ${from} -> ${to}`（ASCII "->"、无 ANSI；lite CLI 全事件同一格式）。
 * 与该格式强耦合是计划已知风险——transitionWatch.test.ts 双向钉死（改 CLI 输出 = 先改测试）。
 *
 * 写盘限流（防 SSE 风暴）：每次字段写都会改 .pipeline.yaml 指纹 → server 推快照。故只在
 * 「值真的变化」时写（同值重复行零写盘）；写回 best-effort（同 setStateField 既有 .catch 风格），
 * 磁盘/四闸异常绝不拖垮 run 本身。
 */

/** 一行 [TRANSITION] 的解析结果。 */
export interface TransitionLine {
  readonly name: string
  readonly from: string
  readonly to: string
}

/**
 * [TRANSITION] 行格式（钉死）：行首前缀 + change 名 + ": " + from + " -> " + to。
 * 行尾容忍空白/\r（docker 流按 \n 切行时 \r\n 会留尾 \r）。
 */
export const TRANSITION_LINE_RE = /^\[TRANSITION\] (\S+): (\S+) -> (\S+)\s*$/

/** 解析单行；非 [TRANSITION] 行 / 格式不合 → null。 */
export const parseTransitionLine = (line: string): TransitionLine | null => {
  const m = TRANSITION_LINE_RE.exec(line)
  if (!m) return null
  return { name: m[1]!, from: m[2]!, to: m[3]! }
}

/** 逐行观察器：onLine 喂日志行；settle 在 run 结算（完成/失败/取消）时清理字段。 */
export interface PhaseWatch {
  onLine(line: string): void
  /** 排空在途写 + 清空字段（仅当本次 run 写过；幂等）。任何路径的结算都必须调它。 */
  settle(): Promise<void>
}

/**
 * 构造一个 change 的阶段观察器。write = 写 automation_current_phase 的注入面
 * （lifecycle 绑 ports.setStateField；测试绑收集器）。
 *
 * 写串行化：onLine 是同步回调而写是异步——用 promise 链保序，避免「后写的旧值盖掉先写的新值」。
 */
export const createPhaseWatch = (name: string, write: (value: string) => Promise<void>): PhaseWatch => {
  // 最近一次已排队写入的值；'' = 从未写过（阶段名不可能是空串）。
  let last = ''
  let chain: Promise<void> = Promise.resolve()
  const enqueue = (value: string): void => {
    chain = chain.then(() => write(value)).catch(() => {
      // best-effort：单笔写失败吞掉（同 lifecycle 其它 setStateField 的 .catch(() => {}) 风格）
    })
  }
  return {
    onLine(line) {
      const t = parseTransitionLine(line)
      // 只认本 change 的转换行（不串味）；同值重复零写盘（限流）。
      if (!t || t.name !== name || t.to === last) return
      last = t.to
      enqueue(t.to)
    },
    async settle() {
      if (last !== '') {
        last = ''
        enqueue('')
      }
      await chain
    },
  }
}
