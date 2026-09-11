import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelLogo } from '@/components/premium/agent-chat-input/model-logo';

describe('ModelLogo', () => {
  it('uses the official Gemini artwork for Gemini image models', () => {
    const { container } = render(<ModelLogo modelId="gemini-3.1-flash-image" />);

    expect(container.firstElementChild).toHaveStyle({
      backgroundImage:
        'url("https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg")',
    });
  });
});
