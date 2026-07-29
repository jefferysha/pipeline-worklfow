import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../i18n'
import { TaskDocumentsSection } from './TaskDocumentsSection'

describe('TaskDocumentsSection evidence timeline', () => {
  it('renders a keyboard-accessible current-read timeline', () => {
    render(<I18nProvider><TaskDocumentsSection documents={{ governed: true, blockers: [], items: [{ kind: 'proposal', status: 'recorded', requiredRead: true, paths: ['openspec/changes/x/proposal.md'], producers: ['openspec-propose'], timeline: [{ producer: 'openspec-propose', recordedAt: '2026-07-29T10:00:00Z', readAt: '2026-07-29T10:01:00Z' }] }] }} /></I18nProvider>)
    const disclosure = screen.getByText('证据时间线')
    fireEvent.keyDown(disclosure, { key: 'Enter' })
    expect(screen.getByText(/openspec-propose.*2026-07-29T10:01:00Z/)).toBeTruthy()
  })

  it('labels older snapshots without timeline evidence', () => {
    render(<I18nProvider><TaskDocumentsSection documents={{ governed: true, blockers: [], items: [{ kind: 'proposal', status: 'recorded', requiredRead: false, paths: [], producers: ['openspec-propose'] }] }} /></I18nProvider>)
    expect(screen.getByTestId('dt-document-proposal').textContent).toContain('时间线不可用')
  })
})
