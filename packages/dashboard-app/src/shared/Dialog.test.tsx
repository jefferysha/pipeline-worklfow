import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { Dialog, DialogInteractionBoundary } from './Dialog'

describe('Dialog', () => {
  it('keeps the workspace close control inert when close is disabled', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <Dialog
          closeDisabled
          closeLabel="Close workspace"
          onClose={onClose}
          title="Workspace"
          variant="workspace"
        >
          Content
        </Dialog>
      </I18nProvider>,
    )

    const close = screen.getByRole('button', { name: 'Close workspace' })
    expect(close).toBeDisabled()
    await user.click(close)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('allows an authorized portal submit and blocks the same action after its interaction boundary loses authority', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const renderDialog = (disabled: boolean): JSX.Element => (
      <I18nProvider>
        <DialogInteractionBoundary disabled={disabled}>
          <Dialog onClose={vi.fn()} title="Track settings" testid="track-settings-dialog">
            <form onSubmit={onSubmit}>
              <button type="submit">Save track</button>
            </form>
          </Dialog>
        </DialogInteractionBoundary>
      </I18nProvider>
    )
    const { rerender } = render(renderDialog(false))

    fireEvent.click(screen.getByRole('button', { name: 'Save track' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    rerender(renderDialog(true))
    const overlay = screen.getByTestId('track-settings-dialog')
    expect(overlay).toHaveAttribute('inert')
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save track', hidden: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
