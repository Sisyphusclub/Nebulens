import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AnimatedDropdown,
  AnimatedDropdownContent,
  AnimatedDropdownItem,
  AnimatedDropdownLabel,
  AnimatedDropdownRadioGroup,
  AnimatedDropdownRadioItem,
  AnimatedDropdownTrigger,
} from '@/components/premium/animated-dropdown';
import { HIGHLIGHT_FOLLOW } from '@/lib/ease';

function renderMenu() {
  render(
    <AnimatedDropdown open>
      <AnimatedDropdownTrigger>打开</AnimatedDropdownTrigger>
      <AnimatedDropdownContent aria-label="菜单">
        <AnimatedDropdownLabel>标题</AnimatedDropdownLabel>
        <AnimatedDropdownRadioGroup value="a" aria-label="选项">
          <AnimatedDropdownRadioItem value="a">甲</AnimatedDropdownRadioItem>
          <AnimatedDropdownRadioItem value="b">乙</AnimatedDropdownRadioItem>
        </AnimatedDropdownRadioGroup>
        <AnimatedDropdownItem>丙</AnimatedDropdownItem>
      </AnimatedDropdownContent>
    </AnimatedDropdown>,
  );
  const highlight = document.querySelector('[data-beui-dropdown-highlight]');
  expect(highlight).not.toBeNull();
  return highlight as HTMLElement;
}

describe('AnimatedDropdown highlight', () => {
  it('reaches the option under the pointer within about one frame budget', () => {
    expect(HIGHLIGHT_FOLLOW.duration).toBeLessThanOrEqual(0.09);
  });

  it('shows on the hovered option and clears when the pointer leaves the options', () => {
    const highlight = renderMenu();
    expect(highlight).not.toHaveAttribute('data-active');

    fireEvent.pointerMove(screen.getByText('乙'));
    expect(highlight).toHaveAttribute('data-active');

    fireEvent.pointerMove(screen.getByText('标题'));
    expect(highlight).not.toHaveAttribute('data-active');

    fireEvent.pointerMove(screen.getByText('丙'));
    expect(highlight).toHaveAttribute('data-active');

    fireEvent.pointerLeave(screen.getByRole('menu'));
    expect(highlight).not.toHaveAttribute('data-active');
  });

  it('measures the option at full size while the menu is still scaling open', async () => {
    const highlight = renderMenu();
    const menu = screen.getByRole('menu');
    const option = screen.getByText('乙').closest('[role="menuitemradio"]') as HTMLElement;
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(menu, 'offsetHeight', 'get').mockReturnValue(100);
    menu.getBoundingClientRect = () => new DOMRect(10, 10, 100, 50);
    option.getBoundingClientRect = () => new DOMRect(20, 20, 40, 20);

    fireEvent.pointerMove(option);

    await waitFor(() => {
      expect(highlight.style.width).toBe('80px');
      expect(highlight.style.height).toBe('40px');
    });
  });

  it('stays on while the pointer crosses the gap between options in a group', () => {
    const highlight = renderMenu();

    fireEvent.pointerMove(screen.getByText('乙'));
    fireEvent.pointerMove(screen.getByRole('group', { name: '选项' }));

    expect(highlight).toHaveAttribute('data-active');
  });
});
