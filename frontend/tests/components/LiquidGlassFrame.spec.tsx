import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LiquidGlassFrame } from '@/components/common/LiquidGlassFrame';

it('wraps the composer and keeps plain frosted glass where refraction is unsupported', () => {
  render(
    <LiquidGlassFrame className="landing-composer-content">
      <textarea aria-label="提示词" />
    </LiquidGlassFrame>,
  );

  const frame = screen.getByRole('textbox', { name: '提示词' }).parentElement;
  expect(frame).toHaveClass('liquid-glass-frame', 'landing-composer-content');
  // jsdom is not Chromium, so no refraction filter is built and the CSS fallback applies.
  expect(frame).not.toHaveAttribute('data-refraction');
  expect(frame?.querySelector('filter#liquid-glass-refraction')).not.toBeInTheDocument();
});
