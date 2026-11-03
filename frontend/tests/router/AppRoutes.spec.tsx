import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { AppRoutes } from '@/router';

// Never resolves, so the route stays on its loading fallback.
vi.mock('@/views/LandingView', () => new Promise(() => undefined));
vi.mock('@/views/TemplatesView', () => new Promise(() => undefined));

it('holds the home page on its backdrop while it loads, with no skeleton blocks', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <AppRoutes />
    </MemoryRouter>,
  );

  expect(container.querySelector('img.landing-hero__video')).toBeInTheDocument();
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
  ['/templates', '创作模板 · Nebulens'],
  ['/no-such-page', '页面不存在 · Nebulens'],
])('names the browser tab after the page at %s', async (path, title) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

  await waitFor(() => expect(document.title).toBe(title));
});
