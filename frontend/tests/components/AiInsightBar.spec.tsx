import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { AiInsightBar } from '@/components/generation/AiInsightBar';

const posterPrompt =
  '门店活动海报，主标题“周年庆典”，副标题“全场第二件半价”，底部写“11月1日至11月7日”';

function renderBar(props: Partial<Parameters<typeof AiInsightBar>[0]> = {}) {
  const onUse2k = vi.fn();
  render(
    <AiInsightBar
      prompt={posterPrompt}
      resolution="standard"
      canUse2k
      similarCount={0}
      onUse2k={onUse2k}
      {...props}
    />,
  );
  return { onUse2k };
}

it('says what the AI understood and offers 2K for dense text', async () => {
  const user = userEvent.setup();
  const { onUse2k } = renderBar({ similarCount: 4 });

  const bar = screen.getByRole('status', { name: 'AI 理解' });
  expect(bar).toHaveTextContent('识别为海报');
  expect(bar).toHaveTextContent('3 段画面文字');
  expect(bar).toHaveTextContent('成果库有 4 个相似作品');
  await user.click(screen.getByRole('button', { name: '切换到 2K' }));
  expect(onUse2k).toHaveBeenCalledTimes(1);
});

it('suggests redrawing instead of 2K when 2K is unavailable, and nothing at 2K', () => {
  renderBar({ canUse2k: false });
  expect(screen.getByRole('status', { name: 'AI 理解' })).toHaveTextContent('生成后可重画文字');
  expect(screen.queryByRole('button', { name: '切换到 2K' })).not.toBeInTheDocument();
});

it('omits the resolution advice once 2K is selected', () => {
  renderBar({ resolution: '2k' });
  expect(screen.queryByRole('button', { name: '切换到 2K' })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'AI 理解' })).not.toHaveTextContent('重画');
});

it('teaches quoting text when it cannot tell anything yet', () => {
  renderBar({ prompt: '雨后的城市街道，霓虹倒影' });
  expect(screen.getByRole('status', { name: 'AI 理解' })).toHaveTextContent(
    '用引号写出要出现在图中的文字',
  );
});

it('stays hidden while the prompt is empty or very short', () => {
  renderBar({ prompt: '海' });
  expect(screen.queryByRole('status', { name: 'AI 理解' })).not.toBeInTheDocument();
});
