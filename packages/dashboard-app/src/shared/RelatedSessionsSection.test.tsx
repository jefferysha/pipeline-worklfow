import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { RelatedSessionSearchResponse } from '../api/memoryTypes'
import { searchRelatedSessions } from '../api/memoryClient'
import { RelatedSessionsSection } from './RelatedSessionsSection'

vi.mock('../api/memoryClient', () => ({ searchRelatedSessions: vi.fn() }))

const searchMock = vi.mocked(searchRelatedSessions)

function response(over: Partial<RelatedSessionSearchResponse> = {}): RelatedSessionSearchResponse {
  return {
    protocol: 'tenon-related-session-memory/v1',
    query: 'related session memory',
    platform: 'all',
    partial: false,
    warnings: [],
    matches: [{
      platform: 'codex',
      session_id: 'session-12345678',
      title: 'Previous memory investigation',
      updated_at: '2026-07-28T00:00:00Z',
      score: 3.2,
      hit_count: 2,
      excerpt: 'We chose a bounded project-scoped session search.',
      descendants_merged: 0,
    }],
    ...over,
  }
}

function renderSection(root = '/repo', name = 'related-session-memory') {
  return render(
    <I18nProvider>
      <RelatedSessionsSection root={root} name={name} />
    </I18nProvider>,
  )
}

beforeEach(() => searchMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('RelatedSessionsSection', () => {
  it('suggests a readable Change query without auto-search, then native Enter shows loading and results', async () => {
    let resolveSearch: ((value: RelatedSessionSearchResponse) => void) | undefined
    searchMock.mockImplementation(() => new Promise((resolve) => { resolveSearch = resolve }))
    const user = userEvent.setup()
    renderSection()

    const input = screen.getByRole('textbox', { name: '检索词' })
    expect(input).toHaveValue('related session memory')
    expect(searchMock).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox', { name: '宿主' }), 'codex')
    await user.type(input, '{Enter}')
    expect(searchMock).toHaveBeenCalledWith({
      root: '/repo',
      name: 'related-session-memory',
      query: 'related session memory',
      platform: 'codex',
    }, expect.any(AbortSignal))
    expect(screen.getByRole('status')).toHaveTextContent('正在检索相关会话')

    await act(async () => { resolveSearch?.(response({ platform: 'codex' })) })
    const results = await screen.findByRole('list', { name: '相关会话结果' })
    expect(within(results).getByText('Previous memory investigation')).toBeVisible()
    expect(within(results).getByText('We chose a bounded project-scoped session search.')).toBeVisible()
    expect(within(results).getByText(/Codex/)).toBeVisible()
    expect(results).not.toHaveTextContent('/repo')
  })

  it('counts Unicode code points and does not submit Enter while an IME composition is active', async () => {
    searchMock.mockResolvedValue(response())
    const user = userEvent.setup()
    renderSection()
    const input = screen.getByRole('textbox', { name: '检索词' })

    await user.clear(input)
    await user.type(input, '🙂'.repeat(128))
    expect(input).toHaveValue('🙂'.repeat(128))

    await user.click(screen.getByRole('button', { name: '检索' }))
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1))

    searchMock.mockClear()
    input.focus()
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 229,
        bubbles: true,
        isComposing: true,
      }))
    })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('distinguishes empty and typed error states, with a safe retry action', async () => {
    const user = userEvent.setup()
    searchMock.mockResolvedValueOnce(response({ matches: [] }))
    renderSection()

    await user.click(screen.getByRole('button', { name: '检索' }))
    expect(await screen.findByText(/没有找到相关会话/)).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    searchMock.mockRejectedValueOnce(new Error('memory-search-busy'))
    await user.click(screen.getByRole('button', { name: '重试' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('相关会话检索失败')
    expect(alert).not.toHaveTextContent('memory-search-busy')

    searchMock.mockResolvedValueOnce(response({ matches: [] }))
    await user.click(within(alert).getByRole('button', { name: '重试' }))
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(3))
    expect(await screen.findByText(/没有找到相关会话/)).toBeVisible()
  })

  it('labels budget-limited results as partial without exposing protocol warning text', async () => {
    const user = userEvent.setup()
    searchMock.mockResolvedValueOnce(response({
      partial: true,
      warnings: [{ code: 'total-read-budget-reached', message: 'private protocol detail' }],
    }))
    renderSection()

    await user.click(screen.getByRole('button', { name: '检索' }))
    const warning = await screen.findByRole('status')
    expect(warning).toHaveTextContent('仅展示可确认的部分结果')
    expect(warning).toHaveTextContent('1 条预算提示')
    expect(warning).not.toHaveTextContent('total-read-budget-reached')
    expect(warning).not.toHaveTextContent('private protocol detail')
    expect(screen.getByRole('list', { name: '相关会话结果' })).toBeVisible()
  })

  it('does not describe a partial empty response as a complete no-match result', async () => {
    const user = userEvent.setup()
    searchMock.mockResolvedValueOnce(response({
      partial: true,
      warnings: [{ code: 'total-read-budget-exhausted', message: 'private protocol detail' }],
      matches: [],
    }))
    renderSection()

    await user.click(screen.getByRole('button', { name: '检索' }))

    expect(await screen.findByRole('status')).toHaveTextContent('仅展示可确认的部分结果')
    expect(screen.getByText(/读取预算内没有找到相关会话/)).toBeVisible()
    expect(screen.queryByText(/^没有找到相关会话/)).not.toBeInTheDocument()
  })

  it('aborts and clears old state on root/name change; a stale resolution cannot overwrite the new Change', async () => {
    let resolveOld: ((value: RelatedSessionSearchResponse) => void) | undefined
    searchMock.mockImplementationOnce((_input, signal) => new Promise((resolve) => {
      resolveOld = resolve
      expect(signal?.aborted).toBe(false)
    }))
    const user = userEvent.setup()
    const view = renderSection('/repo-a', 'first-change')

    await user.click(screen.getByRole('button', { name: '检索' }))
    const oldSignal = searchMock.mock.calls[0]?.[1]
    expect(screen.getByRole('status')).toHaveTextContent('正在检索相关会话')

    view.rerender(
      <I18nProvider>
        <RelatedSessionsSection root="/repo-b" name="second-change" />
      </I18nProvider>,
    )
    expect(oldSignal?.aborted).toBe(true)
    expect(screen.getByRole('textbox', { name: '检索词' })).toHaveValue('second change')
    expect(screen.getByText(/提交后才会检索/)).toBeVisible()

    await act(async () => {
      resolveOld?.(response({
        matches: [{
          ...response().matches[0],
          title: 'Stale first Change result',
        }],
      }))
    })
    expect(screen.queryByText('Stale first Change result')).not.toBeInTheDocument()

    searchMock.mockResolvedValueOnce(response({
      query: 'second change',
      matches: [{
        ...response().matches[0],
        title: 'Current second Change result',
      }],
    }))
    await user.click(screen.getByRole('button', { name: '检索' }))
    expect(await screen.findByText('Current second Change result')).toBeVisible()
    expect(searchMock).toHaveBeenLastCalledWith({
      root: '/repo-b',
      name: 'second-change',
      query: 'second change',
      platform: 'all',
    }, expect.any(AbortSignal))
  })
})
