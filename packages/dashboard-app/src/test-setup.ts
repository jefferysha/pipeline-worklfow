import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// ── 内存 localStorage（jsdom/node 全局竞争隔离，对齐老仓 test-setup 教训）──
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}
vi.stubGlobal('localStorage', new MemoryStorage())

// ── 可驱动的 EventSource stub ──
// jsdom 无 EventSource。这是「真 EventSource stub」：组件真注册 'snapshot'/'message' 监听、真调 close，
// 测试经 lastEventSource() 拿到实例后 emit() 派发真事件 → 组件走真更新路径（非 mock 返回值）。
export interface FakeEventSource {
  url: string
  readyState: number
  close(): void
  emit(event: string, data: string): void
  listeners: Record<string, Array<(e: MessageEvent) => void>>
}

const created: FakeEventSource[] = []

class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  url: string
  readyState = MockEventSource.OPEN
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {}
  constructor(url: string) {
    this.url = url
    created.push(this as unknown as FakeEventSource)
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    ;(this.listeners[type] ||= []).push(fn)
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn)
  }
  emit(type: string, data: string): void {
    const ev = { data } as MessageEvent
    if (type === 'message' && this.onmessage) this.onmessage(ev)
    for (const fn of this.listeners[type] || []) fn(ev)
  }
  close(): void {
    this.readyState = MockEventSource.CLOSED
  }
}
vi.stubGlobal('EventSource', MockEventSource)

export function lastEventSource(): FakeEventSource | undefined {
  return created[created.length - 1]
}
export function resetEventSources(): void {
  created.length = 0
}
