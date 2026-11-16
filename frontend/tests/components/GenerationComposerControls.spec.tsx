import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { GenerationComposerControls } from '@/components/generation/GenerationComposerControls';

function renderControls(overrides: Partial<Parameters<typeof GenerationComposerControls>[0]> = {}) {
  const onPrivateChange = vi.fn();
  const view = render(
    <GenerationComposerControls
      model="gpt-image-2.5-flare"
      aspect="auto"
      count={1}
      resolution="standard"
      quality="medium"
      isPrivate={false}
      onModelChange={vi.fn()}
      onAspectChange={vi.fn()}
      onCountChange={vi.fn()}
      onResolutionChange={vi.fn()}
      onQualityChange={vi.fn()}
      onPrivateChange={onPrivateChange}
      {...overrides}
    />,
  );
  return { ...view, onPrivateChange };
}

it('offers who can see the new images, everyone by default', async () => {
  const user = userEvent.setup();
  const { onPrivateChange } = renderControls();

  await user.click(screen.getByRole('button', { name: '自定义生成参数' }));
  const visibility = screen.getByRole('group', { name: '可见范围' });
  expect(within(visibility).getByRole('menuitemradio', { name: '所有人可见' })).toHaveAttribute(
    'data-state',
    'checked',
  );

  await user.click(within(visibility).getByRole('menuitemradio', { name: '仅自己可见' }));

  expect(onPrivateChange).toHaveBeenCalledWith(true);
  // Like the other choices, picking one leaves the panel open.
  expect(screen.getByRole('group', { name: '可见范围' })).toBeInTheDocument();
});

it('shows a lock on the settings button while new images stay with their maker', async () => {
  const user = userEvent.setup();
  const { container, onPrivateChange } = renderControls({ isPrivate: true });

  const trigger = screen.getByRole('button', { name: '自定义生成参数' });
  expect(trigger).toHaveAttribute('data-private', 'true');
  expect(trigger.querySelector('.lucide-lock')).toBeInTheDocument();
  expect(trigger.querySelector('.lucide-sliders-horizontal')).not.toBeInTheDocument();
  // The summary keeps its length, so the toolbar keeps its single row.
  expect(trigger).toHaveTextContent('智能 · 1K · 标准 · 1张');
  expect(container.querySelector('.generation-custom-trigger__private')).toHaveTextContent(
    '仅自己可见',
  );

  await user.click(trigger);
  const visibility = screen.getByRole('group', { name: '可见范围' });
  expect(within(visibility).getByRole('menuitemradio', { name: '仅自己可见' })).toHaveAttribute(
    'data-state',
    'checked',
  );
  await user.click(within(visibility).getByRole('menuitemradio', { name: '所有人可见' }));
  expect(onPrivateChange).toHaveBeenCalledWith(false);
});

it('keeps the visibility choice when a skill or the Agent plans the images', async () => {
  const user = userEvent.setup();
  renderControls({ planned: true });

  await user.click(screen.getByRole('button', { name: '自定义生成参数' }));

  expect(screen.queryByRole('group', { name: '生成张数' })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: '可见范围' })).toBeInTheDocument();
});
