import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

import { MorphicCardModal } from '@/components/premium/morphic-card-modal';

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open preview
      </button>
      <MorphicCardModal id="focus-test" open={open} onClose={() => setOpen(false)}>
        <section role="dialog" aria-label="Preview">
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </section>
      </MorphicCardModal>
    </>
  );
}

// Holds every animation frame until the test flushes it, so the modal's deferred
// initial focus can be made to land after an earlier focus change.
function holdAnimationFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return () =>
    act(() => {
      frames.splice(0).forEach((callback) => callback(performance.now()));
    });
}

function renderOpenModal(children: ReactNode) {
  return render(
    <MorphicCardModal id="early-focus" open onClose={() => undefined}>
      <section role="dialog" aria-label="Settings">
        <button type="button">Close</button>
        {children}
      </section>
    </MorphicCardModal>,
  );
}

describe('MorphicCardModal', () => {
  it('moves focus inside, traps Tab, and restores the trigger after Escape', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open preview' });
    await user.click(trigger);

    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps a field focused before its deferred initial focus runs', () => {
    const flushFrames = holdAnimationFrames();
    renderOpenModal(<input aria-label="API key" />);

    const field = screen.getByLabelText('API key');
    field.focus();
    flushFrames();

    expect(field).toHaveFocus();
  });

  it('keeps focus in a menu portaled out of the modal before its deferred initial focus runs', () => {
    const flushFrames = holdAnimationFrames();
    renderOpenModal(
      createPortal(<div role="menu" aria-label="Usage" tabIndex={-1} />, document.body),
    );

    const menu = screen.getByRole('menu', { name: 'Usage' });
    menu.focus();
    flushFrames();

    expect(menu).toHaveFocus();
  });

  it('leaves focus taken elsewhere after closing before its deferred return focus runs', () => {
    const flushFrames = holdAnimationFrames();
    const page = (open: boolean) => (
      <>
        <button type="button">Opener</button>
        <input aria-label="Search" />
        <MorphicCardModal id="return-focus" open={open} onClose={() => undefined}>
          <section role="dialog" aria-label="Settings">
            <button type="button">Close</button>
          </section>
        </MorphicCardModal>
      </>
    );
    const { rerender } = render(page(false));
    screen.getByRole('button', { name: 'Opener' }).focus();
    rerender(page(true));
    flushFrames();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    rerender(page(false));
    const search = screen.getByLabelText('Search');
    search.focus();
    flushFrames();

    expect(search).toHaveFocus();
  });
});
