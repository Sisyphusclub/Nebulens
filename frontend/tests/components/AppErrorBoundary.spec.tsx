import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '@/components/common/AppErrorBoundary';

function Broken({ error }: { error: Error }): never {
  throw error;
}

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('shows a way back instead of a blank page when a page crashes', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AppErrorBoundary>
        <Broken error={new Error('boom')} />
      </AppErrorBoundary>
    </MemoryRouter>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('页面出了点问题');
  expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  await user.click(screen.getByRole('button', { name: '刷新页面' }));
  expect(reload).toHaveBeenCalledOnce();
});

it('reloads by itself when a page from an older release can no longer be loaded', () => {
  render(
    <MemoryRouter>
      <AppErrorBoundary>
        <Broken
          error={new TypeError('Failed to fetch dynamically imported module: /assets/x.js')}
        />
      </AppErrorBoundary>
    </MemoryRouter>,
  );

  expect(reload).toHaveBeenCalledOnce();
});

it('does not keep reloading if the page still fails right after a reload', () => {
  const stale = new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
  const { unmount } = render(
    <MemoryRouter>
      <AppErrorBoundary>
        <Broken error={stale} />
      </AppErrorBoundary>
    </MemoryRouter>,
  );
  unmount();
  render(
    <MemoryRouter>
      <AppErrorBoundary>
        <Broken error={stale} />
      </AppErrorBoundary>
    </MemoryRouter>,
  );

  expect(reload).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
