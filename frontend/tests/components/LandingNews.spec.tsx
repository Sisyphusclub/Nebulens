import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { LandingNews } from '@/components/landing/LandingNews';
import type { Announcement } from '@/data/announcements';
import type { DailyCheckInResponse } from '@/types/image';

const NEWS: readonly Announcement[] = [
  {
    id: 'templates',
    date: '2026-11-08',
    kind: 'update',
    title: '模板更好找',
    items: ['分类全部平铺显示。', '详情可以复制链接。'],
  },
  {
    id: 'retired',
    date: '2026-11-02',
    kind: 'notice',
    title: '旧模型已下线',
    items: ['请改用其他模型。'],
  },
];

type NewsProps = Parameters<typeof LandingNews>[0];

function renderNews(props: Partial<NewsProps> = {}) {
  const handlers = {
    onLogin: vi.fn(),
    onCheckIn: vi.fn<() => Promise<DailyCheckInResponse>>(),
    onNotify: vi.fn(),
  };
  const view = render(
    <LandingNews
      isAuthPending={false}
      isAuthenticated={false}
      checkedInToday={false}
      dailyCheckInReward={5}
      announcements={NEWS}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

it('heads the row "最近上新"', () => {
  renderNews();
  const row = screen.getByRole('region', { name: '最近上新' });
  expect(within(row).getByRole('heading', { level: 2, name: '最近上新' })).toBeInTheDocument();
});

it('opens with an invitation to sign in for a visitor', async () => {
  const user = userEvent.setup();
  const { onLogin } = renderNews();

  expect(screen.getByRole('heading', { level: 3, name: '登录，开始创作' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '立即登录' }));
  expect(onLogin).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: /签到/ })).toBeNull();
});

it('opens with the daily check-in for someone signed in', async () => {
  const user = userEvent.setup();
  let finish: () => void = () => {};
  const onCheckIn = vi.fn(
    () =>
      new Promise<DailyCheckInResponse>((resolve) => {
        finish = () => resolve({} as DailyCheckInResponse);
      }),
  );
  renderNews({ isAuthenticated: true, dailyCheckInReward: 8, onCheckIn });

  expect(screen.getByRole('heading', { level: 3, name: '签到领 8 积分' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '立即登录' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '立即签到' }));
  expect(onCheckIn).toHaveBeenCalledTimes(1);
  // One check-in at a time: the button waits for the first to come back.
  expect(screen.getByRole('button', { name: '签到中' })).toBeDisabled();

  await act(async () => {
    finish();
    await Promise.resolve();
  });
  expect(screen.getByRole('button', { name: '立即签到' })).toBeEnabled();
});

it('says so when the check-in is already done for the day', () => {
  const { onCheckIn } = renderNews({ isAuthenticated: true, checkedInToday: true });

  expect(screen.getByRole('heading', { level: 3, name: '今日已签到' })).toBeInTheDocument();
  const done = screen.getByRole('button', { name: '已签到' });
  expect(done).toBeDisabled();
  fireEvent.click(done);
  expect(onCheckIn).not.toHaveBeenCalled();
});

it('tells the visitor when a check-in fails', async () => {
  const user = userEvent.setup();
  const onCheckIn = vi.fn(() => Promise.reject(new Error('offline')));
  const { onNotify } = renderNews({ isAuthenticated: true, onCheckIn });

  await user.click(screen.getByRole('button', { name: '立即签到' }));
  expect(onNotify).toHaveBeenCalledWith('签到失败，请稍后重试。', 'error');
  expect(screen.getByRole('button', { name: '立即签到' })).toBeEnabled();
});

it('offers neither sign-in nor check-in until it knows who is there, but keeps the card’s place', () => {
  const { container } = renderNews({ isAuthPending: true });

  expect(screen.queryByRole('button', { name: '立即登录' })).toBeNull();
  expect(screen.queryByRole('button', { name: /签到/ })).toBeNull();
  expect(container.querySelector('.home-news__promo')).not.toBeNull();
});

it('lists the announcements, newest first, each with its kind, date, title and points', () => {
  renderNews();
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(2);

  expect(within(cards[0]!).getByRole('heading', { level: 3, name: '模板更好找' })).toBeTruthy();
  expect(cards[0]).toHaveTextContent('更新');
  expect(within(cards[0]!).getByText('11月8日')).toHaveAttribute('datetime', '2026-11-08');
  expect(
    within(cards[0]!)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['分类全部平铺显示。', '详情可以复制链接。']);

  expect(within(cards[1]!).getByRole('heading', { level: 3, name: '旧模型已下线' })).toBeTruthy();
  expect(cards[1]).toHaveTextContent('通知');
  expect(within(cards[1]!).getByText('11月2日')).toBeInTheDocument();
});

it('shows the six newest announcements and four points of each at most', () => {
  const many: Announcement[] = Array.from({ length: 8 }, (_, index) => ({
    id: `news-${index}`,
    date: '2026-10-01',
    kind: 'update',
    title: `第 ${index + 1} 条`,
    items: ['一', '二', '三', '四', '五'],
  }));
  renderNews({ announcements: many });

  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(6);
  expect(within(cards[0]!).getAllByRole('listitem')).toHaveLength(4);
});

it('grows arrows only when the row is wider than the page, and moves by them', () => {
  const { container } = renderNews();
  const row = container.querySelector('.home-news__row') as HTMLElement;
  // Everything fits: nothing to scroll to.
  expect(screen.queryByRole('button', { name: '看后面的' })).toBeNull();
  expect(screen.queryByRole('button', { name: '看前面的' })).toBeNull();

  const scrollBy = vi.fn();
  Object.defineProperties(row, {
    clientWidth: { configurable: true, value: 600 },
    scrollWidth: { configurable: true, value: 1100 },
    scrollLeft: { configurable: true, writable: true, value: 0 },
    scrollBy: { configurable: true, value: scrollBy },
  });
  fireEvent.scroll(row);
  expect(screen.queryByRole('button', { name: '看前面的' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '看后面的' }));
  expect(scrollBy).toHaveBeenLastCalledWith({ left: 480 });

  row.scrollLeft = 500;
  fireEvent.scroll(row);
  // At the far end there is only the way back.
  expect(screen.queryByRole('button', { name: '看后面的' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '看前面的' }));
  expect(scrollBy).toHaveBeenLastCalledWith({ left: -480 });
});
