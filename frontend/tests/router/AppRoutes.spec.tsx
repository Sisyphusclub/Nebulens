import { render, screen } from '@testing-library/react';
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
