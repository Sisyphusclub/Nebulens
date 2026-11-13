import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { AppRoutes } from '@/router';

// Never resolves, so the route stays on its loading fallback.
vi.mock('@/views/LandingView', () => new Promise(() => undefined));
vi.mock('@/views/TemplatesView', () => new Promise(() => undefined));
vi.mock('@/views/HistoryView', () => ({
  HistoryView: () => <Link to="/somewhere-else">离开</Link>,
}));

it('holds the home page on its own dark page while it loads, with no skeleton blocks', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <AppRoutes />
    </MemoryRouter>,
  );

  expect(container.querySelector('.home-page--loading .home-hero')).toBeInTheDocument();
  // The page draws its night sky itself once it is in: there is no picture to wait for.
  expect(container.querySelector('.home-page--loading img')).not.toBeInTheDocument();
  expect(screen.queryByRole('status', { name: '页面加载中' })).not.toBeInTheDocument();
});

it('keeps the skeleton for the other pages', () => {
  render(
    <MemoryRouter initialEntries={['/templates']}>
      <AppRoutes />
    </MemoryRouter>,
  );

  expect(screen.getByRole('status', { name: '页面加载中' })).toBeInTheDocument();
});

it('tells the user a page does not exist instead of quietly going home', () => {
  render(
    <MemoryRouter initialEntries={['/no-such-page']}>
      <AppRoutes />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: '页面不存在' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
});

it.each([
  ['/templates', '创作模板 · 贝尔灵画'],
  ['/no-such-page', '页面不存在 · 贝尔灵画'],
])('names the browser tab after the page at %s', async (path, title) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

  await waitFor(() => expect(document.title).toBe(title));
});

it('opens the next page at its top instead of where the last page was scrolled to', async () => {
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  render(
    <MemoryRouter initialEntries={['/history']}>
      <AppRoutes />
    </MemoryRouter>,
  );
  const leave = await screen.findByRole('link', { name: '离开' });
  expect(scrollTo).not.toHaveBeenCalled();

  fireEvent.click(leave);

  await screen.findByRole('heading', { name: '页面不存在' });
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  scrollTo.mockRestore();
});
