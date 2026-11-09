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
  // What it read sits apart from what can be done about it.
  expect(
    screen.getByRole('button', { name: '切换到 2K' }).closest('.ai-insight__actions'),
  ).not.toBeNull();
  expect(screen.getByText('识别为海报').closest('.ai-insight__facts')).not.toBeNull();
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

it('offers AI polishing and shows its progress', async () => {
  const user = userEvent.setup();
  const onEnhance = vi.fn();
  const { rerender } = render(
    <AiInsightBar
      prompt="雨后的未来都市街道"
      resolution="standard"
      canUse2k
      similarCount={0}
      onUse2k={vi.fn()}
      enhance={{ enhancing: false, canUndo: false, onEnhance, onUndo: vi.fn() }}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'AI 润色提示词' }));
  expect(onEnhance).toHaveBeenCalledTimes(1);

  rerender(
    <AiInsightBar
      prompt="雨后的未来都市街道"
      resolution="standard"
      canUse2k
      similarCount={0}
      onUse2k={vi.fn()}
      enhance={{ enhancing: true, canUndo: false, onEnhance, onUndo: vi.fn() }}
    />,
  );
  expect(screen.getByRole('button', { name: 'AI 润色提示词' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'AI 润色提示词' })).toHaveTextContent('润色中');
});

it('lets the user undo a polish', async () => {
  const user = userEvent.setup();
  const onUndo = vi.fn();
  render(
    <AiInsightBar
      prompt="雨后霓虹街道，电影级广角构图"
      resolution="standard"
      canUse2k
      similarCount={0}
      onUse2k={vi.fn()}
      enhance={{ enhancing: false, canUndo: true, onEnhance: vi.fn(), onUndo }}
    />,
  );

  expect(screen.getByRole('status', { name: 'AI 理解' })).toHaveTextContent('已润色');
  await user.click(screen.getByRole('button', { name: '撤销润色' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
});
