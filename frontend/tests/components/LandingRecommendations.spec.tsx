import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { LandingRecommendations } from '@/components/landing/LandingRecommendations';
import type { TeamRecommendation } from '@/types/image';

const recommendation: TeamRecommendation = {
  record: {
    id: 'tea.png',
    createdAt: '2026-10-28T00:00:00.000Z',
    prompt: '奶茶新品上市海报',
    model: 'gpt-image-2',
    aspectRatio: '3:4',
    width: 1024,
    height: 1360,
    isPublic: false,
    isShared: true,
    category: 'poster',
  },
  ownerName: 'alice',
  reason: '同为海报 · 标签相近：奶茶',
};

it('lists similar teammate work with the reason and author, and hands back choices', async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  const onUsePrompt = vi.fn();
  render(
    <LandingRecommendations
      recommendations={[recommendation]}
      onOpen={onOpen}
      onUsePrompt={onUsePrompt}
    />,
  );

  const panel = screen.getByRole('region', { name: '成果库里相似的作品' });
  expect(panel).toHaveTextContent('同为海报 · 标签相近：奶茶');
  expect(panel).toHaveTextContent('alice');
  expect(panel).toHaveTextContent('奶茶新品上市海报');

  await user.click(within(panel).getByRole('button', { name: '查看图片：奶茶新品上市海报' }));
  expect(onOpen).toHaveBeenCalledWith(recommendation);
  await user.click(within(panel).getByRole('button', { name: '用这个提示词' }));
  expect(onUsePrompt).toHaveBeenCalledWith(recommendation);
});

it('offers a close button when the panel can be dismissed', async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  render(
    <LandingRecommendations
      recommendations={[recommendation]}
      onOpen={vi.fn()}
      onUsePrompt={vi.fn()}
      onDismiss={onDismiss}
    />,
  );
  await user.click(screen.getByRole('button', { name: '关闭成果库推荐' }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
