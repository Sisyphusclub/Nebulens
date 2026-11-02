import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { CREATION_TEMPLATES } from '@/data/creationTemplates';
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
const templates = CREATION_TEMPLATES.slice(0, 30);

it('puts teammates’ shared work first and makes a similar one on click', async () => {
  const user = userEvent.setup();
  const onUse = vi.fn();
  render(
    <MemoryRouter>
      <LandingShowcase
        records={[tea]}
        templates={templates}
        onUse={onUse}
        onUseTemplate={vi.fn()}
      />
    </MemoryRouter>,
  );

  const section = screen.getByRole('region', { name: '灵感' });
  expect(within(section).getByRole('link', { name: '成果库' })).toHaveAttribute('href', '/team');
  const cards = within(section).getAllByRole('button', { name: /^做同款：/ });
  expect(cards[0]).toHaveAccessibleName('做同款：奶茶新品上市海报，清新绿色');
  expect(cards[0]).toHaveTextContent('alice');
  expect(cards[0]).toHaveTextContent('海报');
  expect(cards[0]?.querySelector('img')).toHaveAttribute(
    'src',
    expect.stringContaining('/api/outputs/team-tea.png?w=640'),
  );

  await user.click(cards[0]!);
  expect(onUse).toHaveBeenCalledWith(tea);
});

it('tops the wall up to 24 pieces with templates, so it is never empty', async () => {
  const user = userEvent.setup();
  const onUseTemplate = vi.fn();
  render(
    <MemoryRouter>
      <LandingShowcase
        records={[]}
        templates={templates}
        onUse={vi.fn()}
        onUseTemplate={onUseTemplate}
      />
    </MemoryRouter>,
  );

  const section = screen.getByRole('region', { name: '灵感' });
  expect(within(section).queryByRole('link', { name: '成果库' })).not.toBeInTheDocument();
  expect(within(section).getByRole('link', { name: '更多模板' })).toHaveAttribute(
    'href',
    '/templates',
  );
  expect(within(section).getAllByRole('button', { name: /^做同款：/ })).toHaveLength(24);

  const first = templates[0]!;
  const card = within(section).getByRole('button', { name: `做同款：${first.title}` });
  expect(card).toHaveTextContent(`创作模板 · ${first.category}`);
  await user.click(card);
  expect(onUseTemplate).toHaveBeenCalledWith(first);
});
