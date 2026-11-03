import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { useLeaveWarning } from '@/hooks/useLeaveWarning';

function leave(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

it('asks before the page unloads while work would be lost', () => {
  renderHook(() => useLeaveWarning(true));

  expect(leave().defaultPrevented).toBe(true);
});

it('lets the page go freely when nothing is running, and once the work finishes', () => {
  const { rerender } = renderHook(({ active }) => useLeaveWarning(active), {
    initialProps: { active: true },
  });

  rerender({ active: false });

  expect(leave().defaultPrevented).toBe(false);
});
