import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { DefaultSkillChain } from './DefaultSkillChain'
import { invalidateMandatoryConfig } from './mandatorySkills'
import type { WbStepDef } from './WorkbenchView'

const ROOT = '/repo/default'
const STEP: WbStepDef = {
  id: 'build',
  label: '实现',
  gate: null,
  skills: [],
  inputs: [],
  outputs: [],
  guards: [],
  transitions: [],
}
const CONFIG = {
  ok: true,
  generated_at: '2026-07-30T00:00:00Z',
  revision: 'concurrent-r1',
  source: 'project-file',
  mandatory_skills_writable_profiles: ['frontend', 'backend'],
  tracks: ['frontend', 'backend'].map((id, index) => ({
    id,
    label: id === 'frontend' ? 'Frontend' : 'Backend',
    builtin: true,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: 'pending',
      automationEligible: true,
      coverageProfile: id,
      routing: { enabled: true, pattern: id, priority: 200 - index },
      skills: { matrix: true, profile: id },
    },
  })),
  mandatory_skills: {
    'build.frontend': ['frontend-skill'],
    'build.backend': ['backend-skill'],
  },
}

interface DeferredResponse {
  promise: Promise<Response>
  resolve: (response: Response) => void
}

function deferredResponse(): DeferredResponse {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}

function renderChain(): void {
  render(
    <I18nProvider>
      <DefaultSkillChain step={STEP} root={ROOT} registry={[]} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  invalidateMandatoryConfig()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DefaultSkillChain exact cell operation identity', () => {
  it('cell A/B saves stay independently busy, reject duplicate A, and merge both successes into the latest cache', async () => {
    const pendingA = deferredResponse()
    const pendingB = deferredResponse()
    let postIndex = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/config?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(CONFIG), { status: 200 })
      }
      if (url === '/api/skills/registry') {
        return new Response(JSON.stringify({ skills: [] }), { status: 200 })
      }
      if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') {
        postIndex += 1
        return postIndex === 1 ? pendingA.promise : pendingB.promise
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    renderChain()
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(screen.getByTestId('wb-sk-track-backend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(postIndex).toBe(2)

    await act(async () => {
      pendingA.resolve(new Response(JSON.stringify({
        ok: true,
        phase: 'build',
        track: 'frontend',
        skills: ['frontend-after'],
      }), { status: 200 }))
      await pendingA.promise
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存' })).toBeNull())
    expect(screen.getByTestId('wb-sk-mand')).toHaveTextContent('frontend-after')
    expect(postIndex).toBe(2)

    fireEvent.click(screen.getByTestId('wb-sk-track-backend'))
    await act(async () => {
      pendingB.resolve(new Response(JSON.stringify({
        ok: true,
        phase: 'build',
        track: 'backend',
        skills: ['backend-after'],
      }), { status: 200 }))
      await pendingB.promise
    })
    await waitFor(() => expect(screen.getByTestId('wb-sk-mand')).toHaveTextContent('backend-after'))
    fireEvent.click(screen.getByTestId('wb-sk-track-frontend'))
    expect(screen.getByTestId('wb-sk-mand')).toHaveTextContent('frontend-after')
  })

  it('cell A error arriving after cell B starts cannot pollute B; B error remains actionable', async () => {
    const pendingA = deferredResponse()
    const pendingB = deferredResponse()
    let postIndex = 0
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/config?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(CONFIG), { status: 200 })
      }
      if (url === '/api/skills/registry') {
        return new Response(JSON.stringify({ skills: [] }), { status: 200 })
      }
      if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') {
        postIndex += 1
        return postIndex === 1 ? pendingA.promise : pendingB.promise
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    renderChain()
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(screen.getByTestId('wb-sk-track-backend'))
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await act(async () => {
      pendingA.resolve(new Response(JSON.stringify({ ok: false, error: 'stale A error' }), { status: 409 }))
      await pendingA.promise
    })
    expect(screen.queryByText('stale A error')).toBeNull()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()

    await act(async () => {
      pendingB.resolve(new Response(JSON.stringify({ ok: false, error: 'current B error' }), { status: 409 }))
      await pendingB.promise
    })
    expect(await screen.findByTestId('wb-sk-save-error')).toHaveTextContent('current B error')
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it.each([
    ['wrong phase', { ok: true, phase: 'verify', track: 'frontend', skills: ['unsafe'] }],
    ['wrong track', { ok: true, phase: 'build', track: 'backend', skills: ['unsafe'] }],
    ['missing phase', { ok: true, track: 'frontend', skills: ['unsafe'] }],
    ['extra field', { ok: true, phase: 'build', track: 'frontend', skills: ['unsafe'], revision: 'invented' }],
  ])('fails closed for a malformed 200 success envelope: %s', async (_label, payload) => {
    global.fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/config?root=${encodeURIComponent(ROOT)}`) {
        return new Response(JSON.stringify(CONFIG), { status: 200 })
      }
      if (url === '/api/skills/registry') {
        return new Response(JSON.stringify({ skills: [] }), { status: 200 })
      }
      if (url === '/api/config/mandatory-skills' && opts?.method === 'POST') {
        return new Response(JSON.stringify(payload), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    renderChain()
    await screen.findByTestId('wb-sk-tracks')
    fireEvent.click(screen.getByTestId('wb-sk-edit'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByTestId('wb-sk-save-error')).toHaveTextContent('服务端响应格式无效')
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByTestId('wb-sk-mand')).toHaveTextContent('frontend-skill')
    expect(screen.getByTestId('wb-sk-mand')).not.toHaveTextContent('unsafe')
  })
})
