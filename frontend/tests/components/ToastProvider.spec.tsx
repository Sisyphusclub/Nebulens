import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from '@/components/common/ToastProvider';

function Notify({ onAction }: { onAction: () => void }) {
  const { notify } = useToast();
  useEffect(() => {
    notify('图片已删除', 'success', { action: { label: '撤销', onAction } });
  }, [notify, onAction]);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

it('offers the action on the toast and dismisses it once used', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn();
  render(
    <ToastProvider>
      <Notify onAction={onAction} />
    </ToastProvider>,
  );

  await user.click(screen.getByRole('button', { name: '撤销' }));

  expect(onAction).toHaveBeenCalledOnce();
  expect(screen.queryByText('图片已删除')).not.toBeInTheDocument();
});

it('keeps an actionable toast up for the whole undo window', () => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <Notify onAction={vi.fn()} />
    </ToastProvider>,
  );

  act(() => {
    vi.advanceTimersByTime(4_500);
  });
  expect(screen.getByRole('button', { name: '撤销' })).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument();
});
