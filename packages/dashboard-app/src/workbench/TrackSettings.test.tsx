import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WbTrackDefinition } from '../api/client'
import { I18nProvider } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { TrackSettings } from './TrackSettings'

const TRACKS: readonly WbTrackDefinition[] = [
  {
    id: 'pm', label: 'PM', builtin: true,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: 'pending', automationEligible: true, coverageProfile: 'pm',
      routing: { enabled: false }, skills: { matrix: true, profile: 'pm' },
    },
  },
  {
    id: 'frontend', label: 'Frontend', builtin: true,
    workflow: { default: 'default', allowed: '*' },
    policyProfile: {
      reviewSeed: 'pending', automationEligible: true, coverageProfile: 'frontend',
      routing: { enabled: true, pattern: '(ui|css)', priority: 300 },
      skills: { matrix: true, profile: 'frontend' },
    },
  },
]

function state(reloadConfig = vi.fn(async () => {})): MandatoryState {
  return {
    root: '/repo', revision: 'tracks-r1', table: {}, capable: true,
    tracks: TRACKS, matrixTracks: TRACKS, writableProfiles: ['pm', 'frontend'],
    configError: null, track: 'pm', setTrack: vi.fn(), savingKey: null,
    saveError: null, setSkills: vi.fn(), registry: [], reloadConfig,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TrackSettings', () => {
  it('keeps the complete editing surface atomic until a pending save fails', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'zh')
    const user = userEvent.setup()
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => pending)
    vi.stubGlobal('fetch', fetchMock)

    render(<I18nProvider><TrackSettings state={state()} /></I18nProvider>)
    await user.click(screen.getByTestId('wb-track-settings-toggle'))
    await user.click(screen.getByTestId('wb-track-edit-pm'))
    const editor = screen.getByTestId('wb-track-editor')
    const label = within(editor).getByLabelText('显示名称')
    await user.clear(label)
    await user.type(label, 'Product draft')
    await user.click(within(editor).getByTestId('wb-track-editor-save'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    for (const control of editor.querySelectorAll('input, select, button')) {
      expect(control).toBeDisabled()
    }
    expect(screen.getByTestId('wb-track-edit-frontend')).toBeDisabled()
    expect(screen.getByLabelText('关闭轨道设置')).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(editor).toBeInTheDocument()
    expect(label).toHaveValue('Product draft')
    const requestOptions = fetchMock.mock.calls[0]?.[1]
    expect(requestOptions).toBeDefined()
    expect(JSON.parse(String(requestOptions?.body))).toMatchObject({
      root: '/repo', revision: 'tracks-r1', patch: { label: 'Product draft' },
    })

    await act(async () => {
      release(new Response(JSON.stringify({ ok: false, error: 'conflict' }), { status: 409 }))
      await pending
    })
    expect(await screen.findByTestId('wb-track-editor-error')).toHaveTextContent('conflict')
    await waitFor(() => expect(within(editor).getByTestId('wb-track-editor-save')).toHaveFocus())
    expect(label).toBeEnabled()
  })

  it('returns focus to the editor opener after save success and manual close', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'zh')
    const user = userEvent.setup()
    const reloadConfig = vi.fn(async () => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      revision: 'tracks-r2',
      source: 'project-file',
      tracks: TRACKS,
    }), { status: 200 })))

    render(<I18nProvider><TrackSettings state={state(reloadConfig)} /></I18nProvider>)
    await user.click(screen.getByTestId('wb-track-settings-toggle'))
    const editPm = screen.getByTestId('wb-track-edit-pm')
    await user.click(editPm)
    await user.click(screen.getByTestId('wb-track-editor-save'))

    await waitFor(() => expect(screen.queryByTestId('wb-track-editor')).toBeNull())
    expect(reloadConfig).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(editPm).toHaveFocus())

    await user.click(editPm)
    const editor = screen.getByTestId('wb-track-editor')
    await user.click(within(editor).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByTestId('wb-track-editor')).toBeNull())
    expect(editPm).toHaveFocus()

    await user.click(editPm)
    const pmLabel = within(screen.getByTestId('wb-track-editor')).getByLabelText('显示名称')
    await user.clear(pmLabel)
    await user.type(pmLabel, 'Dirty PM')
    const editFrontend = screen.getByTestId('wb-track-edit-frontend')
    await user.click(editFrontend)
    await user.click(within(screen.getByTestId('wb-track-unsaved-draft')).getByRole('button', { name: '丢弃并离开' }))
    await user.click(within(screen.getByTestId('wb-track-editor')).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(editFrontend).toHaveFocus())
  })

  it('returns focus to the clicked editor opener even when activation does not focus it', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'zh')
    render(<I18nProvider><TrackSettings state={state()} /></I18nProvider>)
    fireEvent.click(screen.getByTestId('wb-track-settings-toggle'))
    const editPm = screen.getByTestId('wb-track-edit-pm')
    expect(editPm).not.toHaveFocus()

    fireEvent.click(editPm)
    fireEvent.click(within(screen.getByTestId('wb-track-editor')).getByRole('button', { name: '关闭' }))

    await waitFor(() => expect(screen.queryByTestId('wb-track-editor')).toBeNull())
    expect(editPm).toHaveFocus()
  })

  it('preserves the current opener when a dirty editor switch is cancelled', async () => {
    localStorage.setItem('tenon-dashboard-lang', 'zh')
    const user = userEvent.setup()
    render(<I18nProvider><TrackSettings state={state()} /></I18nProvider>)
    await user.click(screen.getByTestId('wb-track-settings-toggle'))
    const editPm = screen.getByTestId('wb-track-edit-pm')
    await user.click(editPm)
    const label = within(screen.getByTestId('wb-track-editor')).getByLabelText('显示名称')
    await user.clear(label)
    await user.type(label, 'Dirty PM')

    await user.click(screen.getByTestId('wb-track-edit-frontend'))
    await user.click(within(screen.getByTestId('wb-track-unsaved-draft')).getByRole('button', { name: '继续编辑' }))
    expect(label).toHaveValue('Dirty PM')

    await user.click(within(screen.getByTestId('wb-track-editor')).getByRole('button', { name: '关闭' }))
    await user.click(within(screen.getByTestId('wb-track-unsaved-draft')).getByRole('button', { name: '丢弃并离开' }))
    await waitFor(() => expect(screen.queryByTestId('wb-track-editor')).toBeNull())
    expect(editPm).toHaveFocus()
  })
})
