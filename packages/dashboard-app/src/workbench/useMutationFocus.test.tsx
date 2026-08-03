import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMutationFocus } from './useMutationFocus'

function Harness({ busy, editorOpen }: { busy: boolean; editorOpen: boolean }): JSX.Element {
  const mutationFocus = useMutationFocus(busy, editorOpen)
  return (
    <>
      <button ref={mutationFocus.saveButtonRef} data-testid="save" type="button">Save</button>
      <button
        data-testid="opener"
        type="button"
        onClick={() => mutationFocus.captureEditorReturn()}
      >
        Open editor
      </button>
      <button
        data-testid="starter"
        type="button"
        disabled={busy}
        onClick={mutationFocus.capture}
      >
        Start
      </button>
    </>
  )
}

describe('useMutationFocus', () => {
  it('restores the initiating control after a failed mutation leaves the editor open', async () => {
    const view = render(<Harness busy={false} editorOpen />)
    const starter = screen.getByTestId('starter')
    starter.focus()
    fireEvent.click(starter)

    view.rerender(<Harness busy editorOpen />)
    screen.getByTestId('save').focus()
    view.rerender(<Harness busy={false} editorOpen />)

    await waitFor(() => expect(starter).toHaveFocus())
  })

  it('restores the editor opener after a successful mutation closes the editor', async () => {
    const view = render(<Harness busy={false} editorOpen={false} />)
    const opener = screen.getByTestId('opener')
    opener.focus()
    fireEvent.click(opener)
    view.rerender(<Harness busy={false} editorOpen />)
    fireEvent.click(screen.getByTestId('starter'))
    view.rerender(<Harness busy editorOpen />)
    const save = screen.getByTestId('save')
    save.focus()
    view.rerender(<Harness busy={false} editorOpen={false} />)

    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('restores the editor opener after a manual close', async () => {
    const view = render(<Harness busy={false} editorOpen={false} />)
    const opener = screen.getByTestId('opener')
    opener.focus()
    fireEvent.click(opener)
    view.rerender(<Harness busy={false} editorOpen />)
    screen.getByTestId('save').focus()
    view.rerender(<Harness busy={false} editorOpen={false} />)

    await waitFor(() => expect(opener).toHaveFocus())
  })
})
