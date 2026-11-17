import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { LandingClosing, LandingFooter } from '@/components/landing/LandingClosing';

it('closes the page with one line about the product and a way to start', async () => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  render(<LandingClosing onStart={onStart} />);

  const closing = screen.getByRole('region', { name: '下一套物料，交给贝尔灵画' });
  expect(
    within(closing).getByRole('heading', { level: 2, name: '下一套物料，交给贝尔灵画' }),
  ).toBeInTheDocument();
  expect(closing).toHaveTextContent('说一句需求，Agent 规划、生成、校对，交付一整套。');
  // The logo is decoration here: the heading already names the product.
  expect(closing.querySelector('img')).toHaveAttribute('alt', '');

  await user.click(within(closing).getByRole('button', { name: '开始创作' }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

it('ends on a footer with the product’s name, its pages and the way back up', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LandingFooter />
    </MemoryRouter>,
  );

  const footer = screen.getByRole('contentinfo');
  expect(footer).toHaveTextContent('贝尔灵画');
  expect(footer).toHaveTextContent('设计 Agent');

  // Every page but the one the visitor is on, from the same list the sidebar uses.
  const links = within(within(footer).getByRole('navigation', { name: '页脚导航' })).getAllByRole(
    'link',
  );
  expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
    ['Agent 画布', '/agent'],
    ['生图', '/generate'],
    ['创作模板', '/templates'],
    ['资产', '/history'],
  ]);

  await user.click(within(footer).getByRole('button', { name: '回到顶部' }));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
});
