import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';

import {
  AnnouncementCenter,
  READ_ANNOUNCEMENTS_STORAGE_KEY,
} from '@/components/common/AnnouncementCenter';
import { ANNOUNCEMENTS, type Announcement } from '@/data/announcements';

const older: Announcement = {
  id: '2026-11-01-older',
  date: '2026-11-01',
  kind: 'notice',
  title: '旧的公告',
  items: ['旧公告的第一条'],
};
const newer: Announcement = {
  id: '2026-11-05-newer',
  date: '2026-11-05',
  kind: 'update',
  title: '新的公告',
  items: ['新公告的第一条', '新公告的第二条'],
};

beforeEach(() => {
  localStorage.clear();
});

it('marks the bell while there are announcements not yet read', () => {
  const { container } = render(<AnnouncementCenter announcements={[newer, older]} />);

  expect(screen.getByRole('button', { name: '公告与更新，2 条未读' })).toBeInTheDocument();
  expect(container.querySelector('.announcement-bell__dot')).not.toBeNull();
});

it('lists every announcement when opened and remembers that they were read', async () => {
  const user = userEvent.setup();
  const first = render(<AnnouncementCenter announcements={[newer, older]} />);

  await user.click(screen.getByRole('button', { name: '公告与更新，2 条未读' }));

  const panel = screen.getByRole('menu');
  expect(within(panel).getByRole('heading', { name: '新的公告' })).toBeInTheDocument();
  expect(within(panel).getByText('新公告的第二条')).toBeInTheDocument();
  expect(within(panel).getByText('2026-11-01')).toBeInTheDocument();
  // What was new when the panel opened stays labelled as new while it is open.
  expect(within(panel).getAllByText('新')).toHaveLength(2);
  expect(screen.getByRole('button', { name: '公告与更新' })).toBeInTheDocument();
  expect(first.container.querySelector('.announcement-bell__dot')).toBeNull();

  first.unmount();
  const second = render(<AnnouncementCenter announcements={[newer, older]} />);
  expect(screen.getByRole('button', { name: '公告与更新' })).toBeInTheDocument();
  expect(second.container.querySelector('.announcement-bell__dot')).toBeNull();
});

it('counts only announcements added after the last read', () => {
  localStorage.setItem(READ_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify([older.id]));

  render(<AnnouncementCenter announcements={[newer, older]} />);

  expect(screen.getByRole('button', { name: '公告与更新，1 条未读' })).toBeInTheDocument();
});

it('shows no bell when there is nothing to announce', () => {
  render(<AnnouncementCenter announcements={[]} />);

  expect(screen.queryByRole('button', { name: /公告与更新/ })).not.toBeInTheDocument();
});

it('ships announcements newest first with unique ids and something to say', () => {
  expect(ANNOUNCEMENTS.length).toBeGreaterThan(0);
  expect(new Set(ANNOUNCEMENTS.map((item) => item.id)).size).toBe(ANNOUNCEMENTS.length);
  const dates = ANNOUNCEMENTS.map((item) => item.date);
  expect([...dates].sort().reverse()).toEqual(dates);
  for (const item of ANNOUNCEMENTS) {
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(item.items.length).toBeGreaterThan(0);
  }
});
