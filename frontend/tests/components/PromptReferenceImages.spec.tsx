import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromptReferenceImages } from '@/components/generation/PromptReferenceImages';
import type { FeedItem } from '@/utils/generationFeed';

function feedItem(overrides: Partial<FeedItem> = {}, referenceIds: string[] = []): FeedItem {
  return {
    id: 'batch-1',
    createdAt: '2026-11-02T00:00:00.000Z',
    entries: [],
    settings: {
      prompt: '优化这个设备图片',
      model: 'gpt-image-2.5-flare',
      count: 1,
      aspectRatio: '1:1',
      resolution: 'standard',
      isPublic: false,
      referenceIds,
    },
    ...overrides,
  };
}

describe('PromptReferenceImages', () => {
  it('shows the sent reference images from the server once they are uploaded', () => {
    render(<PromptReferenceImages item={feedItem({}, ['a.png', 'b.png'])} />);

    const images = screen.getAllByRole('img', { name: /^参考图 \d$/ });
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute(
      'src',
      expect.stringContaining('/api/images/references/a.png'),
    );
    expect(images[1]).toHaveAttribute(
      'src',
      expect.stringContaining('/api/images/references/b.png'),
    );
  });

  it('shows local previews while the reference images are still uploading', () => {
    render(<PromptReferenceImages item={feedItem({ referencePreviewUrls: ['blob:local-1'] })} />);

    expect(screen.getByRole('img', { name: '参考图 1' })).toHaveAttribute('src', 'blob:local-1');
  });

  it('renders nothing for a text-only prompt', () => {
    const { container } = render(<PromptReferenceImages item={feedItem()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
