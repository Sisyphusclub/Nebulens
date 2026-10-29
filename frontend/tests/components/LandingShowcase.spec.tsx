import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { LandingShowcase } from '@/components/landing/LandingShowcase';
import type { TeamImageRecord } from '@/types/image';

const tea: TeamImageRecord = {
  id: 'team-tea.png',
  createdAt: '2026-10-29T00:00:00.000Z',
  prompt: '奶茶新品上市海报，清新绿色',
  model: 'gpt-image-2',
  aspectRatio: '3:4',
  width: 1024,
  height: 1360,
  isPublic: false,
  category: 'poster',
  ownerName: 'alice',
};

it('lists teammates’ shared work and makes a similar one on click', async () => {
  const user = userEvent.setup();
  const onUse = vi.fn();
  render(
    <MemoryRouter>
      <LandingShowcase records={[tea]} onUse={onUse} />
    </MemoryRouter>,
  );

  const section = screen.getByRole('region', { name: '成果库精选' });
  expect(within(section).getByRole('link', { name: '查看全部' })).toHaveAttribute('href', '/team');
  const card = within(section).getByRole('button', { name: '做同款：奶茶新品上市海报，清新绿色' });
  expect(card).toHaveTextContent('alice');
  expect(card).toHaveTextContent('海报');
  expect(card.querySelector('img')).toHaveAttribute(
    'src',
    expect.stringContaining('/api/outputs/team-tea.png?w=640'),
  );

  await user.click(card);
  expect(onUse).toHaveBeenCalledWith(tea);
});

it('renders nothing when the library has no shared work', () => {
  const { container } = render(
    <MemoryRouter>
      <LandingShowcase records={[]} onUse={vi.fn()} />
    </MemoryRouter>,
  );
  expect(container).toBeEmptyDOMElement();
});
