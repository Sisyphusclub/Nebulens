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

function renderShowcase(
  records: TeamImageRecord[] = [tea],
  handlers: { onUse?: () => void; onUseTemplate?: () => void } = {},
) {
  return render(
    <MemoryRouter>
      <LandingShowcase
        records={records}
        onUse={handlers.onUse ?? vi.fn()}
        onUseTemplate={handlers.onUseTemplate ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

function cardsIn(feed: HTMLElement): HTMLElement[] {
  return within(feed).queryAllByRole('button', { name: /^做同款：/ });
}

it('names the wall with a heading above its filters', () => {
  renderShowcase();
  const feed = screen.getByRole('region', { name: '灵感' });
  expect(within(feed).getByRole('heading', { level: 2, name: '灵感' })).toBeInTheDocument();
});

it('puts teammates’ shared work first on the wall and makes a similar one on click', async () => {
  const user = userEvent.setup();
  const onUse = vi.fn();
  renderShowcase([tea], { onUse });

  const feed = screen.getByRole('region', { name: '灵感' });
  const [first] = cardsIn(feed);
  expect(first).toHaveAccessibleName('做同款：奶茶新品上市海报，清新绿色');
  expect(first).toHaveTextContent('alice');
  expect(first).toHaveTextContent('海报');
  expect(first?.querySelector('img')).toHaveAttribute(
    'src',
    expect.stringContaining('/api/outputs/team-tea.png?w=640'),
  );

  await user.click(first!);
  expect(onUse).toHaveBeenCalledWith(tea);
});

it('mixes four templates from every category into the featured wall, so it is never empty', async () => {
  const user = userEvent.setup();
  const onUseTemplate = vi.fn();
  renderShowcase([], { onUseTemplate });

  const feed = screen.getByRole('region', { name: '灵感' });
  const cards = cardsIn(feed);
  expect(cards).toHaveLength(4 * TEMPLATE_SHORTCUT_CATEGORIES.length);
  for (const category of TEMPLATE_SHORTCUT_CATEGORIES) {
    expect(
      cards.filter((card) => card.querySelector('.home-feed__kind')?.textContent === category),
    ).toHaveLength(4);
  }
  // One from each category in turn, so neighbours on the wall differ.
  expect(
    cards
      .slice(0, TEMPLATE_SHORTCUT_CATEGORIES.length)
      .map((card) => card.querySelector('.home-feed__kind')?.textContent),
  ).toEqual(TEMPLATE_SHORTCUT_CATEGORIES);
  expect(within(feed).getByRole('link', { name: '更多模板' })).toHaveAttribute(
    'href',
    '/templates',
  );

  const first = orderTemplatesWithAnimeLast(CREATION_TEMPLATES).find(
    (template) => template.category === TEMPLATE_SHORTCUT_CATEGORIES[0],
  )!;
  const card = within(feed).getByRole('button', { name: `做同款：${first.title}` });
  expect(card).toBe(cards[0]);
  expect(card).toHaveTextContent('创作模板');
  await user.click(card);
  expect(onUseTemplate).toHaveBeenCalledWith(first);
});

it('narrows the wall to one template category from the tabs', async () => {
  const user = userEvent.setup();
  renderShowcase();
  const feed = screen.getByRole('region', { name: '灵感' });
  const tabs = within(feed).getByRole('group', { name: '灵感分类' });
  expect(within(tabs).getByRole('button', { name: '精选' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.click(within(tabs).getByRole('button', { name: '电影风格' }));

  const film = CREATION_TEMPLATES.filter((template) => template.category === '电影风格');
  const cards = cardsIn(feed);
  expect(cards).toHaveLength(Math.min(24, film.length));
  // Shared work has its own categories, so a template category shows templates only.
  expect(within(feed).queryByRole('button', { name: `做同款：${tea.prompt}` })).toBeNull();
  for (const card of cards) {
    expect(card.querySelector('.home-feed__kind')).toHaveTextContent('电影风格');
  }
  expect(within(feed).getByRole('link', { name: '更多电影风格' })).toHaveAttribute(
    'href',
    `/templates?${new URLSearchParams({ category: '电影风格' }).toString()}`,
  );
});

it('searches shared work and every template, and says when nothing matches', async () => {
  const user = userEvent.setup();
  renderShowcase();
  const feed = screen.getByRole('region', { name: '灵感' });
  const search = within(feed).getByRole('searchbox', { name: '搜索灵感' });

  await user.type(search, '奶茶');
  expect(within(feed).getByRole('button', { name: `做同款：${tea.prompt}` })).toBeInTheDocument();
  // A search has no "more" to go to: it already looked through everything.
  expect(within(feed).queryByRole('link', { name: /^更多/ })).toBeNull();

  await user.clear(search);
  await user.type(search, 'zzzz不存在的内容');
  expect(cardsIn(feed)).toHaveLength(0);
  expect(feed).toHaveTextContent('没有找到相关作品，换个关键词试试');
});

it('titles a shared card by the start of its prompt and keeps the whole prompt for its name', () => {
  const long: TeamImageRecord = {
    ...tea,
    id: 'team-long.png',
    prompt: '3:4 竖版卖点详情图。商品为山川明前绿茶茶罐，置于浅色背景',
  };
  renderShowcase([long]);

  const card = screen.getByRole('button', { name: `做同款：${long.prompt}` });
  expect(card.querySelector('.home-feed__title')).toHaveTextContent(/^竖版卖点详情图$/);
});

it('gives each card the rows its picture needs: forty to a column’s width, and one for the gap', () => {
  const shaped = (id: string, width: number, height: number): TeamImageRecord => ({
    ...tea,
    id,
    prompt: `${id} 的提示词`,
    width,
    height,
  });
  renderShowcase([
    shaped('portrait.png', 1024, 1360),
    shaped('square.png', 1024, 1024),
    shaped('wide.png', 1600, 900),
    // Beyond twice as tall or twice as wide, a picture is cropped rather than followed.
    shaped('banner.png', 3000, 600),
    shaped('scroll.png', 600, 3000),
  ]);

  const feed = screen.getByRole('region', { name: '灵感' });
  const span = (id: string): string =>
    within(feed)
      .getByRole('button', { name: `做同款：${id} 的提示词` })
      .style.getPropertyValue('--feed-span');
  expect(span('portrait.png')).toBe('54');
  expect(span('square.png')).toBe('41');
  expect(span('wide.png')).toBe('24');
  expect(span('banner.png')).toBe('21');
  expect(span('scroll.png')).toBe('81');
  // The stylesheet divides a column into the same number of rows.
  expect(
    (feed.querySelector('.home-feed__grid') as HTMLElement).style.getPropertyValue('--feed-rows'),
  ).toBe('40');
});

it('fades a long wall out behind its "more" link, and leaves a short one whole', async () => {
  const user = userEvent.setup();
  renderShowcase();
  const feed = screen.getByRole('region', { name: '灵感' });
  expect(feed.querySelector('.home-feed__wall')).toHaveAttribute('data-fade', 'true');

  // A search that finds a few pieces shows them all, with nothing laid over them.
  await user.type(within(feed).getByRole('searchbox', { name: '搜索灵感' }), '奶茶');
  expect(feed.querySelector('.home-feed__wall')).not.toHaveAttribute('data-fade');
});
