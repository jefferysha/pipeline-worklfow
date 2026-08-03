import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WbTrackDefinition } from '../api/client'
import { I18nProvider } from '../i18n'
import type { MandatoryState } from './mandatoryState'
import { TrackSettingsList } from './TrackSettingsList'

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

function state(): MandatoryState {
  return {
    root: '/repo', revision: 'tracks-r1', table: {}, capable: true,
    tracks: [TRACK], matrixTracks: [TRACK], writableProfiles: ['pm'],
    configError: null, track: 'pm', setTrack: vi.fn(), savingKey: null,
    saveError: null, setSkills: vi.fn(), registry: [], reloadConfig: vi.fn(async () => {}),
  }
}

describe('TrackSettingsList', () => {
  it('does not dispatch an edit while the list is disabled', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <TrackSettingsList disabled state={state()} onEdit={onEdit} />
      </I18nProvider>,
    )

    const edit = screen.getByTestId('wb-track-edit-pm')
    expect(edit).toBeDisabled()
    await user.click(edit)
    expect(onEdit).not.toHaveBeenCalled()
  })
})
