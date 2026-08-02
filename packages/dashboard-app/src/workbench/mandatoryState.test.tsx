import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { invalidateMandatoryConfig } from './mandatoryConfig'
import { useMandatorySkills } from './mandatoryState'

function configBody(revision: string, skills: string[] = ['frontend-design']): Record<string, unknown> {
  return {
    ok: true,
    generated_at: '2026-08-03T00:00:00Z',
    revision,
    source: 'project-file',
    mandatory_skills_writable_profiles: ['frontend'],
    tracks: [
      {
        id: 'frontend',
        label: 'Frontend',
        builtin: true,
        workflow: { default: 'default', allowed: '*' },
        policyProfile: {
          reviewSeed: 'pending',
          automationEligible: true,
          coverageProfile: 'frontend',
          routing: { enabled: true, pattern: '(ui|css)', priority: 300 },
          skills: { matrix: true, profile: 'frontend' },
        },
      },
    ],
    mandatory_skills: { 'build.frontend': skills },
  }
}

function deferredResponse(): {
  promise: Promise<Response>
  resolve: (response: Response) => void
} {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function Harness({ root = '/repo/default' }: { root?: string }): JSX.Element {
  const state = useMandatorySkills(root)
  return (
    <>
      <output data-testid="revision">{state.revision}</output>
      <output data-testid="skills">{state.table?.['build.frontend']?.join(',') ?? ''}</output>
      <button type="button" data-testid="reload" onClick={() => void state.reloadConfig()}>
        reload
      </button>
      <button type="button" data-testid="save" onClick={() => state.setSkills('build', ['next-skill'])}>
        save
      </button>
    </>
  )
}

beforeEach(() => {
  invalidateMandatoryConfig()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useMandatorySkills reloadConfig', () => {
  it('同一 root 的较旧 reload 晚到时不会覆盖较新的 authoritative config', async () => {
    const older = deferredResponse()
    const newer = deferredResponse()
    let configRequest = 0
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/config?')) {
        configRequest += 1
        if (configRequest === 1) {
          return Promise.resolve(new Response(JSON.stringify(configBody('revision-initial')), { status: 200 }))
        }
        if (configRequest === 2) return older.promise
        if (configRequest === 3) return newer.promise
      }
      if (url === '/api/skills/registry') {
        return Promise.resolve(new Response(JSON.stringify({ skills: [] }), { status: 200 }))
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }) as unknown as typeof fetch

    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('revision-initial'))

    fireEvent.click(screen.getByTestId('reload'))
    fireEvent.click(screen.getByTestId('reload'))
    expect(configRequest).toBe(3)

    await act(async () => {
      newer.resolve(new Response(JSON.stringify(configBody('revision-b-new')), { status: 200 }))
      await newer.promise
    })
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('revision-b-new'))

    await act(async () => {
      older.resolve(new Response(JSON.stringify(configBody('revision-a-old')), { status: 200 }))
      await older.promise
    })
    expect(screen.getByTestId('revision')).toHaveTextContent('revision-b-new')
  })

  it('root A→B→A 后不复用第一个 A incarnation 的旧 in-flight config', async () => {
    const firstA = deferredResponse()
    const currentA = deferredResponse()
    let aRequests = 0
    global.fetch = vi.fn((url: string) => {
      if (url.startsWith('/api/config?')) {
        const requestRoot = new URL(url, 'http://tenon.local').searchParams.get('root')
        if (requestRoot === '/repo/a') {
          aRequests += 1
          return aRequests === 1 ? firstA.promise : currentA.promise
        }
        if (requestRoot === '/repo/b') {
          return Promise.resolve(new Response(JSON.stringify(configBody('revision-b')), { status: 200 }))
        }
      }
      if (url === '/api/skills/registry') {
        return Promise.resolve(new Response(JSON.stringify({ skills: [] }), { status: 200 }))
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }) as unknown as typeof fetch

    const view = render(
      <I18nProvider>
        <Harness root="/repo/a" />
      </I18nProvider>,
    )
    await waitFor(() => expect(aRequests).toBe(1))
    view.rerender(
      <I18nProvider>
        <Harness root="/repo/b" />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('revision-b'))
    view.rerender(
      <I18nProvider>
        <Harness root="/repo/a" />
      </I18nProvider>,
    )
    await waitFor(() => expect(aRequests).toBe(2))

    await act(async () => {
      currentA.resolve(new Response(JSON.stringify(configBody('revision-a-new')), { status: 200 }))
      await currentA.promise
    })
    await waitFor(() => expect(screen.getByTestId('revision')).toHaveTextContent('revision-a-new'))
    await act(async () => {
      firstA.resolve(new Response(JSON.stringify(configBody('revision-a-old')), { status: 200 }))
      await firstA.promise
    })
    expect(screen.getByTestId('revision')).toHaveTextContent('revision-a-new')
  })

  it('成功写回的 config authority 不会被先发后到的 stale reload 回滚', async () => {
    const mutation = deferredResponse()
    const staleReload = deferredResponse()
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url.startsWith('/api/config?')) {
        const configCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
          .filter(([candidate]) => String(candidate).startsWith('/api/config?')).length
        if (configCalls === 1) {
          return Promise.resolve(new Response(JSON.stringify(configBody('revision-initial', ['old-skill'])), { status: 200 }))
        }
        return staleReload.promise
      }
      if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') return mutation.promise
      if (url === '/api/skills/registry') {
        return Promise.resolve(new Response(JSON.stringify({ skills: [] }), { status: 200 }))
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    }) as unknown as typeof fetch

    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('old-skill'))
    fireEvent.click(screen.getByTestId('save'))
    fireEvent.click(screen.getByTestId('reload'))

    await act(async () => {
      mutation.resolve(new Response(JSON.stringify({
        ok: true,
        phase: 'build',
        track: 'frontend',
        skills: ['next-skill'],
      }), { status: 200 }))
      await mutation.promise
    })
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('next-skill'))
    await act(async () => {
      staleReload.resolve(new Response(JSON.stringify(configBody('revision-stale', ['old-skill'])), { status: 200 }))
      await staleReload.promise
    })
    expect(screen.getByTestId('skills')).toHaveTextContent('next-skill')
  })
})
