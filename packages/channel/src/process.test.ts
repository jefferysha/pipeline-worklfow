/**
 * process —— 真进程注入面单测。makeLineBuffer/isSupervisorCmdline 纯逻辑；
 * nodeProcessFace 真 fork node 子进程 + 真 stdin/stdout 桥 + 真 SIGTERM + 真 pidAlive（非 mock）。
 */
import { describe, expect, test } from 'vitest'
import { isSupervisorCmdline, makeLineBuffer, nodeProcessFace } from './process.js'

describe('makeLineBuffer 行缓冲 + carry', () => {
  test('半行留 carry，补齐才吐；空行跳过', () => {
    const lines: string[] = []
    const feed = makeLineBuffer((l) => lines.push(l))
    feed('hel')
    expect(lines).toEqual([])
    feed('lo\nwor')
    expect(lines).toEqual(['hello'])
    feed('ld\n\n \n')
    expect(lines).toEqual(['hello', 'world'])
  })
})

describe('isSupervisorCmdline ps 正则（防 pid 复用）', () => {
  test('认 shell 壳 channel __supervisor 与 exec 后 channel.supervisor 两形态', () => {
    expect(isSupervisorCmdline('bash channel-state.sh channel __supervisor ch1 w1 /cfg', 'ch1', 'w1')).toBe(true)
    expect(isSupervisorCmdline('node -e code channel.supervisor ch1 w1 /cfg', 'ch1', 'w1')).toBe(true)
  })
  test('worker 不匹配 → false（不误判）', () => {
    expect(isSupervisorCmdline('channel __supervisor ch1 other /cfg', 'ch1', 'w1')).toBe(false)
  })
  test('无关进程 / 空 → false', () => {
    expect(isSupervisorCmdline('/usr/bin/vim foo.txt', 'ch1', 'w1')).toBe(false)
    expect(isSupervisorCmdline('', 'ch1', 'w1')).toBe(false)
  })
  test('channel 名含正则元字符也安全转义', () => {
    expect(isSupervisorCmdline('channel __supervisor a.b w+1 /cfg', 'a.b', 'w+1')).toBe(true)
    expect(isSupervisorCmdline('channel __supervisor axb wx1 /cfg', 'a.b', 'w+1')).toBe(false)
  })
})

const ECHO_SRC = 'process.stdin.on("data",d=>process.stdout.write(d));process.stdin.resume()'

describe('nodeProcessFace 真 fork + 真信号（非 mock）', () => {
  test('真 spawn node echo：stdin 写 → stdout 行回读；SIGTERM 真杀', async () => {
    const proc = nodeProcessFace()
    const child = proc.spawn(process.execPath, ['-e', ECHO_SRC])
    // 真等 spawn 落地
    await new Promise<void>((resolve, reject) => {
      child.onSpawn(resolve)
      child.onError(reject)
    })
    expect(typeof child.pid).toBe('number')
    expect(proc.pidAlive(child.pid!)).toBe(true) // 真 os.kill(pid,0)

    const gotLine = new Promise<string>((resolve) => child.onStdoutLine(resolve))
    child.write('ping\n')
    expect(await gotLine).toBe('ping')

    const exited = new Promise<{ signal: string | null }>((resolve) =>
      child.onExit((_code, signal) => resolve({ signal })),
    )
    expect(child.kill('SIGTERM')).toBe(true) // 真 SIGTERM
    const { signal } = await exited
    expect(signal).toBe('SIGTERM')
    expect(child.exited()).toBe(true)
    // 真判死：进程退出后 pidAlive false
    expect(proc.pidAlive(child.pid!)).toBe(false)
  }, 15000)

  test('spawn 不存在的二进制 → onError（pre-spawn 失败，ENOENT）', async () => {
    const proc = nodeProcessFace()
    const child = proc.spawn('trellis-no-such-binary-xyz-123', [])
    const err = await new Promise<Error>((resolve) => {
      child.onError(resolve)
      child.onSpawn(() => resolve(new Error('unexpected spawn')))
    })
    expect(err).toBeInstanceOf(Error)
  }, 15000)

  test('spawnDetached 起后台进程 + 真 kill；死 pid pidAlive=false', async () => {
    const proc = nodeProcessFace()
    // 真起一个 detached sleeper（持自身活 5s，我们提前杀它）
    const pid = proc.spawnDetached(process.execPath, ['-e', 'setTimeout(()=>{},5000)'])
    expect(typeof pid).toBe('number')
    expect(proc.pidAlive(pid!)).toBe(true)
    expect(proc.kill(pid!, 'SIGKILL')).toBe(true)
    // 真等它死透（poll pidAlive）
    for (let i = 0; i < 100 && proc.pidAlive(pid!); i++) await new Promise((r) => setTimeout(r, 20))
    expect(proc.pidAlive(pid!)).toBe(false)
    // kill 已死 pid → false（ESRCH）
    expect(proc.kill(pid!, 'SIGTERM')).toBe(false)
  }, 15000)

  test('isSupervisorProcess 真 ps 验证：真起匹配 cmdline 的进程被认', async () => {
    const proc = nodeProcessFace()
    // 真起一个 argv 含 channel __supervisor <ch> <wk> 的 sleeper（node -e 的尾 args 进 argv）
    const pid = proc.spawnDetached(process.execPath, [
      '-e',
      'setTimeout(()=>{},5000)',
      'channel',
      '__supervisor',
      'psch',
      'psw',
      '/cfg',
    ])
    expect(typeof pid).toBe('number')
    try {
      // 真跑 ps -p <pid> -o command= 并正则验证
      expect(proc.isSupervisorProcess(pid!, 'psch', 'psw')).toBe(true)
      // 别的 worker 名 → 不认
      expect(proc.isSupervisorProcess(pid!, 'psch', 'other')).toBe(false)
    } finally {
      proc.kill(pid!, 'SIGKILL')
    }
  }, 15000)
})
