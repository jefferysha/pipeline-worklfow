import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WbTrackDefinition } from '../api/client'
import { I18nProvider } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { TrackSelector } from './TrackSelector'

const TRACK: WbTrackDefinition = {
  id: 'pm',
  label: 'PM',
  builtin: true,
  workflow: { default: 'default', allowed: '*' },
  policyProfile: {
    reviewSeed: 'pending',
    automationEligible: true,
    coverageProfile: 'pm',
    routing: { enabled: false },
    skills: { matrix: true, profile: 'pm' },
  },
}

function state(table: MandatoryState['table']): MandatoryState {
  return {
    root: '/repo', revision: 'tracks-r1', table, capable: true,
    tracks: [TRACK], matrixTracks: [TRACK], writableProfiles: ['pm'],
    configError: null, track: 'pm', setTrack: vi.fn(), savingKey: null,
    saveError: null, setSkills: vi.fn(), registry: [], reloadConfig: vi.fn(async () => {}),
  }
}

describe('TrackSelector', () => {
  it('keeps Track Settings mounted while an authoritative config reload is pending', async () => {
    const user = userEvent.setup()
    const view = render(
      <I18nProvider>
        <TrackSelector state={state({})} />
      </I18nProvider>,
    )

    await user.click(screen.getByTestId('wb-track-settings-toggle'))
    expect(screen.getByRole('dialog', { name: '工作轨道' })).toBeInTheDocument()

    view.rerender(
      <I18nProvider>
        <TrackSelector state={state(null)} />
      </I18nProvider>,
    )

    expect(screen.getByRole('dialog', { name: '工作轨道' })).toBeInTheDocument()
  })
})
