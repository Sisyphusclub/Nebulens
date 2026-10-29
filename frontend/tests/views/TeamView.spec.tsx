import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
const api = vi.hoisted(() => ({ fetchTeamHistory: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authMocks }));
vi.mock('@/services/api/historyApi', () => api);

import { ToastProvider } from '@/components/common/ToastProvider';
import { useImageDetailModalState } from '@/hooks/useImageDetailModalState';
import { TeamView } from '@/views/TeamView';

function teamRecord(id: string, prompt: string, category: string) {
  return {
    id,
    batchId: id,
    createdAt: '2026-10-28T08:00:00.000Z',
    prompt,
    model: 'gpt-image-2.5-flare',
    aspectRatio: '3:4',
    width: 1024,
    height: 1360,
    isPublic: false,
    isShared: true,
    category,
    description: `${prompt}的描述`,
    tags: ['团队'],
    ownerName: 'alice',
  };
}

function GenerateRoute() {
  const location = useLocation();
  return <p aria-label="生图路由">{location.search}</p>;
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/team']}>
      <ToastProvider>
        <Routes>
          <Route path="/team" element={<TeamView />} />
          <Route path="/generate" element={<GenerateRoute />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.isAuthenticated = true;
  authMocks.isLoading = false;
  api.fetchTeamHistory.mockResolvedValue({
    records: [teamRecord('poster.png', '周年庆海报', 'poster')],
    nextCursor: 'page-2',
  });
});

it('lists teammates shared work and shows who made it', async () => {
  const user = userEvent.setup();
  renderView();

  await user.click(await screen.findByRole('button', { name: '查看图片：周年庆海报' }));
  const dialog = await screen.findByRole('dialog', { name: '图片详情' });
  expect(within(dialog).getByText('alice')).toBeInTheDocument();
  expect(within(dialog).getByText('周年庆海报的描述')).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: '设为仅自己' })).not.toBeInTheDocument();
  expect(api.fetchTeamHistory).toHaveBeenCalledWith({});
});

it('reloads for a usage category and loads the next page on demand', async () => {
  const user = userEvent.setup();
  renderView();
  await screen.findByRole('button', { name: '查看图片：周年庆海报' });

  api.fetchTeamHistory.mockResolvedValueOnce({
    records: [teamRecord('logo.png', '品牌标志', 'logo')],
  });
  await user.click(screen.getByRole('button', { name: '用途筛选' }));
  await user.click(screen.getByRole('menuitemradio', { name: '品牌 Logo' }));
  await waitFor(() => expect(api.fetchTeamHistory).toHaveBeenLastCalledWith({ category: 'logo' }));
  expect(await screen.findByRole('button', { name: '查看图片：品牌标志' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();

  api.fetchTeamHistory.mockResolvedValueOnce({
    records: [teamRecord('poster.png', '周年庆海报', 'poster')],
    nextCursor: 'page-2',
  });
  await user.click(screen.getByRole('button', { name: '用途筛选' }));
  await user.click(screen.getByRole('menuitemradio', { name: '全部用途' }));
  api.fetchTeamHistory.mockResolvedValueOnce({
    records: [teamRecord('social.png', '城市封面', 'social')],
  });
  await user.click(await screen.findByRole('button', { name: '加载更多' }));

  await waitFor(() => expect(api.fetchTeamHistory).toHaveBeenLastCalledWith({ cursor: 'page-2' }));
  expect(await screen.findByRole('button', { name: '查看图片：城市封面' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看图片：周年庆海报' })).toBeInTheDocument();
});

it('reuses a teammate prompt and settings in the generation workspace', async () => {
  const user = userEvent.setup();
  renderView();

  await user.click(await screen.findByRole('button', { name: '复用设置' }));

  const search = new URLSearchParams(screen.getByLabelText('生图路由').textContent ?? '');
  expect(search.get('prompt')).toBe('周年庆海报');
  expect(search.get('aspect')).toBe('3:4');
  expect(search.get('model')).toBe('gpt-image-2.5-flare');
});

it('asks signed-out visitors to sign in', () => {
  authMocks.isAuthenticated = false;
  renderView();
  expect(screen.getByRole('heading', { name: '登录后查看成果库' })).toBeInTheDocument();
  expect(api.fetchTeamHistory).not.toHaveBeenCalled();
});

/** Like the app shell, re-renders the page whenever a detail modal opens or closes. */
function ShellWithTeamView() {
  const { isImageDetailModalOpen } = useImageDetailModalState();
  return (
    <div data-modal-open={isImageDetailModalOpen}>
      <TeamView />
    </div>
  );
}

it('keeps the detail modal stable when the app shell re-renders around it', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/team']}>
      <ToastProvider>
        <Routes>
          <Route path="/team" element={<ShellWithTeamView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole('button', { name: '查看图片：周年庆海报' }));

  expect(await screen.findByRole('dialog', { name: '图片详情' })).toBeInTheDocument();
});
