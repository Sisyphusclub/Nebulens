import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { LandingShowcase } from '@/components/landing/LandingShowcase';
import {
  CREATION_TEMPLATES,
  orderTemplatesWithAnimeLast,
  TEMPLATE_SHORTCUT_CATEGORIES,
} from '@/data/creationTemplates';
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

it('puts teammates’ shared work in its own row and makes a similar one on click', async () => {
  const user = userEvent.setup();
  const onUse = vi.fn();
  render(
    <MemoryRouter>
      <LandingShowcase records={[tea]} onUse={onUse} onUseTemplate={vi.fn()} />
    </MemoryRouter>,
  );

  const section = screen.getByRole('region', { name: '团队作品' });
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

it('fills the featured tab with a row of templates per category, so it is never empty', async () => {
  const user = userEvent.setup();
  const onUseTemplate = vi.fn();
  render(
    <MemoryRouter>
      <LandingShowcase records={[]} onUse={vi.fn()} onUseTemplate={onUseTemplate} />
    </MemoryRouter>,
  );

  const feed = screen.getByRole('region', { name: '灵感' });
  expect(within(feed).queryByRole('region', { name: '团队作品' })).not.toBeInTheDocument();
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES) {
    const row = within(feed).getByRole('region', { name: category });
    expect(within(row).getAllByRole('button', { name: /^做同款：/ })).toHaveLength(4);
    expect(within(row).getByRole('link', { name: `更多${category}` })).toHaveAttribute(
      'href',
      `/templates?${new URLSearchParams({ category }).toString()}`,
    );
  }

  const first = orderTemplatesWithAnimeLast(CREATION_TEMPLATES).find(
    (template) => template.category === TEMPLATE_SHORTCUT_CATEGORIES[0],
  )!;
  const card = within(feed).getByRole('button', { name: `做同款：${first.title}` });
  expect(card).toHaveTextContent(`创作模板 · ${first.category}`);
  await user.click(card);
  expect(onUseTemplate).toHaveBeenCalledWith(first);
});

function renderShowcase(records: TeamImageRecord[] = [tea]) {
  return render(
    <MemoryRouter>
      <LandingShowcase records={records} onUse={vi.fn()} onUseTemplate={vi.fn()} />
    </MemoryRouter>,
  );
}

it('narrows the wall to one template category from the tabs', async () => {
  const user = userEvent.setup();
  renderShowcase();
  const section = screen.getByRole('region', { name: '灵感' });
  const tabs = within(section).getByRole('group', { name: '灵感分类' });
  expect(within(tabs).getByRole('button', { name: '精选' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.click(within(tabs).getByRole('button', { name: '电影风格' }));

  const film = CREATION_TEMPLATES.filter((template) => template.category === '电影风格');
  const cards = within(section).getAllByRole('button', { name: /^做同款：/ });
  expect(cards).toHaveLength(Math.min(24, film.length));
  // Shared work has its own categories, so a template category shows templates only.
  expect(within(section).queryByRole('button', { name: `做同款：${tea.prompt}` })).toBeNull();
  for (const card of cards) expect(card).toHaveTextContent('创作模板 · 电影风格');
});

it('searches shared work and every template, and says when nothing matches', async () => {
  const user = userEvent.setup();
  renderShowcase();
  const section = screen.getByRole('region', { name: '灵感' });
  const search = within(section).getByRole('searchbox', { name: '搜索灵感' });

  await user.type(search, '奶茶');
  expect(
    within(section).getByRole('button', { name: `做同款：${tea.prompt}` }),
  ).toBeInTheDocument();

  await user.clear(search);
  await user.type(search, 'zzzz不存在的内容');
  expect(within(section).queryAllByRole('button', { name: /^做同款：/ })).toHaveLength(0);
  expect(section).toHaveTextContent('没有找到相关作品，换个关键词试试');
});

it('titles a shared card by the start of its prompt and keeps the whole prompt for its name', () => {
  const long: TeamImageRecord = {
    ...tea,
    id: 'team-long.png',
    prompt: '3:4 竖版卖点详情图。商品为山川明前绿茶茶罐，置于浅色背景',
  };
  render(
    <MemoryRouter>
      <LandingShowcase records={[long]} onUse={vi.fn()} onUseTemplate={vi.fn()} />
    </MemoryRouter>,
  );

  const card = screen.getByRole('button', { name: `做同款：${long.prompt}` });
  expect(card.querySelector('.home-feed__title')).toHaveTextContent(/^竖版卖点详情图$/);
});
