import { describe, expect, it } from 'vitest'
import { createPhaseWatch } from '../lifecycle/transitionWatch.js'
import { nodeExec } from './exec.js'

/**
 * exec 流面（T4 评审修复）：CLI 把 [TRANSITION] 打到 **stderr**（transition.ts 的成功信号行），
 * onLine 若只挂子进程 stdout，phaseWatch 在真实链路永远收不到行——automation_current_phase
 * 生产路径永不回写。本套用例用真 spawn（/bin/sh，hermetic、无 docker）钉住流面：
 *   · stderr 行同样逐行续传 onLine（phaseWatch 只认整行格式，与 stdout 交错无害）；
 *   · stdout/stderr 尾部照旧分流累积，互不串味。
 */
describe('nodeExec onLine 流面', () => {
  it('stderr 行也走 onLine（[TRANSITION] 在真实链路收得到）', async () => {
    const lines: string[] = []
    const res = await nodeExec(
      'sh',
      ['-c', 'echo out-1; echo "[TRANSITION] demo: build -> verify" 1>&2; echo out-2'],
      { onLine: (l) => lines.push(l) },
    )
    expect(res.exitCode).toBe(0)
    expect(lines).toContain('out-1')
    expect(lines).toContain('out-2')
    expect(lines).toContain('[TRANSITION] demo: build -> verify')
    // 尾部分流不混淆：stderr 内容仍归 res.stderr，绝不串进 res.stdout。
    expect(res.stderr).toContain('[TRANSITION] demo: build -> verify')
    expect(res.stdout).not.toContain('[TRANSITION]')
  })

  it('集成：stderr 流上的 [TRANSITION] 行被 phaseWatch 真检出（钉住 exec→watch 全链）', async () => {
    const writes: string[] = []
    const watch = createPhaseWatch('demo', async (v) => {
      writes.push(v)
    })
    const res = await nodeExec(
      'sh',
      [
        '-c',
        'echo working; echo "[TRANSITION] demo: build -> verify" 1>&2; echo "[TRANSITION] demo: verify -> ship" 1>&2',
      ],
      { onLine: (l) => watch.onLine(l) },
    )
    expect(res.exitCode).toBe(0)
    await watch.settle()
    // 两笔运行期写 + settle 清空；顺序由 stderr 单流内有序 + phaseWatch promise 链保序共同保证。
    expect(writes).toEqual(['verify', 'ship', ''])
  })
})
