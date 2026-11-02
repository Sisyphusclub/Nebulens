import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImageDetailModal } from '@/components/gallery/ImageDetailModal';
import type { HistoryEntry } from '@/types/image';

const baseEntry: HistoryEntry = {
  record: {
    id: 'detail.png',
    createdAt: '2026-09-06T08:30:00.000Z',
    prompt: '图片详情测试',
    model: 'gpt-image-2',
    width: 1024,
    height: 1024,
    isPublic: true,
  },
  imageUrl: '/detail.png',
};

describe('ImageDetailModal media framing', () => {
  it.each([
    ['square', 1024, 1024],
    ['landscape', 1792, 1024],
    ['portrait', 1024, 1792],
    ['ultra-landscape', 3072, 1024],
    ['ultra-portrait', 1024, 3072],
  ])('passes %s source dimensions to the intrinsic media layout', (_label, width, height) => {
    const entry: HistoryEntry = {
      ...baseEntry,
      record: { ...baseEntry.record, width, height },
    };

    render(<ImageDetailModal entry={entry} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '图片详情' });
    const media = dialog.querySelector<HTMLElement>('.image-detail__media');
    const image = media?.querySelector('img');

    expect(dialog).toHaveStyle(`--image-detail-image-ratio: ${width / height}`);
    expect(media).toHaveClass(
      'image-detail__media',
      'w-auto',
      'h-full',
      'items-center',
      'justify-center',
    );
    expect(image).toHaveClass('h-full', 'w-auto', 'object-contain');
    expect(image).toHaveAttribute('width', String(width));
    expect(image).toHaveAttribute('height', String(height));
  });
});

describe('ImageDetailModal team details', () => {
  const analyzed: HistoryEntry = {
    ...baseEntry,
    record: {
      ...baseEntry.record,
      isShared: true,
      category: 'poster',
      description: '奶茶新品海报',
      tags: ['奶茶', '清新'],
    },
  };

  it('shows the usage, description and tags of an analyzed image', () => {
    render(<ImageDetailModal entry={analyzed} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '图片详情' });

    expect(within(dialog).getByText('海报')).toBeInTheDocument();
    expect(within(dialog).getByText('已入库')).toBeInTheDocument();
    expect(within(dialog).getByText('奶茶新品海报')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: '标签' })).toHaveTextContent('奶茶清新');
  });

  it('lets the owner change the usage and stop sharing', async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();
    const onToggleShared = vi.fn();
    render(
      <ImageDetailModal
        entry={analyzed}
        onClose={vi.fn()}
        onCategoryChange={onCategoryChange}
        onToggleShared={onToggleShared}
      />,
    );

    await user.click(screen.getByRole('button', { name: '修改用途' }));
    await user.click(screen.getByRole('menuitemradio', { name: '品牌 Logo' }));
    expect(onCategoryChange).toHaveBeenCalledWith(analyzed, 'logo');

    await user.click(screen.getByRole('button', { name: '设为仅自己' }));
    expect(onToggleShared).toHaveBeenCalledWith(analyzed);
  });

  it('names the author of a teammate image and offers no owner controls', () => {
    render(<ImageDetailModal entry={analyzed} ownerName="alice" onClose={vi.fn()} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '修改用途' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '设为仅自己' })).not.toBeInTheDocument();
  });
});
