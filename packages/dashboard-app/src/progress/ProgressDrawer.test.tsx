import { createRef, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { DEFAULT_WORKFLOW_RULES, makeChange } from '../testkit'
import { toFlatRow } from './progressViewModel'
import { ProgressDrawer } from './ProgressDrawer'

vi.mock('../shared/TaskDetail', () => ({
  TaskDetail: ({
    curStageExtra,
    documentsExtra,
  }: {
    curStageExtra?: ReactNode
    documentsExtra?: ReactNode
  }) => (
    <>
      <section data-testid="current-stage-extra">{curStageExtra}</section>
      <section data-testid="documents-extra">{documentsExtra}</section>
    </>
  ),
}))

vi.mock('./ContextBundlePreview', () => ({
  ContextBundlePreview: () => <div data-testid="context-bundle-preview" />,
}))

vi.mock('../verification/VerificationEvidenceComposer', () => ({
  VerificationEvidenceComposer: () => <div data-testid="verification-evidence-composer" />,
}))

function renderDrawer(phase: string): void {
  const change = makeChange('integration-demo', phase)
  const row = toFlatRow(
    { root: '/repo', change, state: 'agent' },
    DEFAULT_WORKFLOW_RULES,
    'default',
  )

  render(
    <I18nProvider>
      <ProgressDrawer
        row={row}
        drawerRef={createRef<HTMLElement>()}
        scrimRef={createRef<HTMLDivElement>()}
        badge={null}
        onClose={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('ProgressDrawer integration surfaces', () => {
  it('keeps context bundle preview and verification evidence together during Verify', () => {
    renderDrawer('verify')

    expect(screen.getByTestId('current-stage-extra'))
      .toContainElement(screen.getByTestId('context-bundle-preview'))
    expect(screen.getByTestId('documents-extra'))
      .toContainElement(screen.getByTestId('verification-evidence-composer'))
  })

  it('keeps the context bundle preview without exposing the evidence composer outside Verify', () => {
    renderDrawer('build')

    expect(screen.getByTestId('context-bundle-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('verification-evidence-composer')).not.toBeInTheDocument()
  })
})
