import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LiquidGlassFrame } from '@/components/common/LiquidGlassFrame';

it('wraps the composer with its refraction filter', () => {
  render(
    <LiquidGlassFrame className="landing-composer-content">
      <textarea aria-label="提示词" />
    </LiquidGlassFrame>,
  );

  const frame = screen.getByRole('textbox', { name: '提示词' }).parentElement;
  expect(frame).toHaveClass('liquid-glass-frame', 'landing-composer-content');
  expect(frame?.querySelector('filter#liquid-glass-refraction')).toBeInTheDocument();
  // jsdom is not Chromium, so the plain frosted glass applies.
  expect(frame).not.toHaveAttribute('data-refraction');
});
