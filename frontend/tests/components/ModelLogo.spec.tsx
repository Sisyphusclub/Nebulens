import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelLogo } from '@/components/premium/agent-chat-input/model-logo';

describe('ModelLogo', () => {
  it('draws the OpenAI mark for gpt image models', () => {
    const { container } = render(<ModelLogo modelId="gpt-image-2.5-flare" />);

    expect((container.firstElementChild as HTMLElement).style.backgroundImage).toContain(
      'OpenAI_logo',
    );
  });
});
