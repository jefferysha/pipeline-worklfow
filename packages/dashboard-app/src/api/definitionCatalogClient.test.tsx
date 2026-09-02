import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeAdapterInstall, subscribeDefinitionCatalog } from './definitionCatalogClient'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly listeners = new Map<string, Array<(event: Event) => void>>()
  readonly close = vi.fn(() => { this.closed = true })
  closed = false
  readyState = 1

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emit(type: string, data = ''): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>)
    }
  }

  fail(): void {
    this.readyState = 2
    this.onerror?.(new Event('error'))
  }

  onerror: ((event: Event) => void) | null = null
}

const validState = {
  job_id: 'job-1', host: 'cursor', phase: 'installed', message: 'installed',
  at: '2026-09-02T00:00:00.000Z', exit_code: 0,
}

const validCatalog = {
  schema_version: 'definition-catalog/v1', revision: 'r1', fingerprint: 'f1', generated_at: '2026-09-02T00:00:00.000Z',
  project: { root: '/repo', identity: 'p1' }, adapters: [], workflows: [], tracks: [], pipelines: [],
}

afterEach(() => {
  vi.unstubAllGlobals()
  FakeEventSource.instances = []
})

describe('definition catalog adapter install stream', () => {
  it('closes the finite EventSource on complete so the browser cannot reconnect and replay states', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const onState = vi.fn()
    const onComplete = vi.fn()
    const stop = subscribeAdapterInstall('/api/adapters/install/job-1/stream', onState, onComplete)
    const source = FakeEventSource.instances[0]
    if (!source) throw new Error('EventSource fixture missing')

    source.emit('install-state', JSON.stringify({ schema_version: 'adapter-install-event/v1', kind: 'install-state', state: validState }))
    source.emit('complete', JSON.stringify({ schema_version: 'adapter-install-event/v1', kind: 'complete', job_id: 'job-1' }))
    source.emit('install-state', JSON.stringify({ schema_version: 'adapter-install-event/v1', kind: 'install-state', state: validState }))

    expect(onState).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(source.close).toHaveBeenCalledTimes(1)
    stop()
    expect(source.close).toHaveBeenCalledTimes(1)
  })

  it('closes and reports a malformed event or transport error instead of leaving the UI busy forever', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const onError = vi.fn()
    subscribeAdapterInstall('/api/adapters/install/job-1/stream', vi.fn(), undefined, onError)
    const source = FakeEventSource.instances[0]
    if (!source) throw new Error('EventSource fixture missing')

    source.emit('install-state', '{not-json')
    source.fail()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(source.close).toHaveBeenCalledTimes(1)
  })

  it('does not report a transient catalog reconnect as an error and deduplicates snapshots by fingerprint', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const onCatalog = vi.fn()
    const onError = vi.fn()
    const stop = subscribeDefinitionCatalog('/repo', onCatalog, onError)
    const source = FakeEventSource.instances[0]
    if (!source) throw new Error('EventSource fixture missing')

    source.onerror?.(new Event('error'))
    expect(onError).not.toHaveBeenCalled()
    source.emit('snapshot', JSON.stringify({ schema_version: 'definition-catalog-event/v1', kind: 'snapshot', revision: 'r1', fingerprint: 'f1', catalog: validCatalog }))
    source.emit('catalog-updated', JSON.stringify({ schema_version: 'definition-catalog-event/v1', kind: 'catalog-updated', revision: 'r1', fingerprint: 'f1', catalog: validCatalog }))
    expect(onCatalog).toHaveBeenCalledTimes(1)

    source.fail()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(source.close).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reports an unavailable EventSource so an install UI can recover instead of staying busy', () => {
    const onError = vi.fn()
    vi.stubGlobal('EventSource', undefined)
    const stop = subscribeAdapterInstall('/api/adapters/install/job-1/stream', vi.fn(), undefined, onError)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(() => stop()).not.toThrow()
  })
})
