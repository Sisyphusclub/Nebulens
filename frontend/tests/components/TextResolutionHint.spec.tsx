import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { TextResolutionHint } from '@/components/generation/TextResolutionHint';

const densePrompt = '主标题“周年庆典”，副标题“全场第二件半价”，底部写“活动时间 11月1日至11月7日”';

it('suggests 2K for text-heavy prompts at standard resolution and switches on request', async () => {
  const user = userEvent.setup();
  const onUse2k = vi.fn();
  render(<TextResolutionHint prompt={densePrompt} resolution="standard" onUse2k={onUse2k} />);

  expect(screen.getByRole('status')).toHaveTextContent('建议切换到 2K');
  await user.click(screen.getByRole('button', { name: '切换到 2K' }));
  expect(onUse2k).toHaveBeenCalledTimes(1);
});

it('stays hidden at higher resolutions and for light text', () => {
  const { rerender } = render(
    <TextResolutionHint prompt={densePrompt} resolution="2k" onUse2k={vi.fn()} />,
  );
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  rerender(<TextResolutionHint prompt="海报写“新品”" resolution="standard" onUse2k={vi.fn()} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
