/**
 * turns —— TurnTracker 主机本地 turn 栈（对标 supervisor/turns.py）。
 * 老仓真相源：skills/pipeline/scripts/channel/turns.py。
 *
 * durable SOT 是 events.jsonl；本对象只在内存记 input message seq 够久，让 inbox watcher 与
 * stdout pump 产出配对的 turn_started / turn_finished。可选 hooks 在 idle ↔ mid-turn 跃迁时触发——
 * 让 supervisor idle timer（OOM 护栏）能 pause/reset。这是「绝不 mid-turn 杀」的机制保证。
 *
 * 铁律（不可阉割，与老仓一致）：
 *   · begin 从 0→1 turn 触发 onIdleExit（暂停 timer）。
 *   · finish/abortCurrent 从 1→0 触发 onIdleEnter（重启 timer）。
 *   · turnId = "msg:<inputSeq>"（与 reducer 一致）。
 */

export interface Turn {
  inputSeq: number
  turnId: string
}

export class TurnTracker {
  private readonly turns: Turn[] = []
  private readonly onIdleExit?: () => void
  private readonly onIdleEnter?: () => void

  constructor(onIdleExit?: () => void, onIdleEnter?: () => void) {
    this.onIdleExit = onIdleExit
    this.onIdleEnter = onIdleEnter
  }

  begin(inputSeq: number): Turn {
    const wasIdle = this.turns.length === 0
    const turn: Turn = { inputSeq, turnId: `msg:${inputSeq}` }
    this.turns.push(turn)
    if (wasIdle) this.onIdleExit?.()
    return turn
  }

  finish(): Turn | undefined {
    const turn = this.turns.pop()
    if (turn !== undefined && this.turns.length === 0) this.onIdleEnter?.()
    return turn
  }

  abortCurrent(): Turn | undefined {
    const turn = this.turns.pop()
    if (turn !== undefined && this.turns.length === 0) this.onIdleEnter?.()
    return turn
  }

  current(): Turn | undefined {
    return this.turns.length > 0 ? this.turns[this.turns.length - 1] : undefined
  }
}
