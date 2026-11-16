import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ImageGrid } from '@/components/gallery/ImageGrid';
import type { HistoryEntry } from '@/types/image';
import { masonrySpan } from '@/utils/masonry';

const entry: HistoryEntry = {
  record: {
    id: 'one.png',
    createdAt: '2026-07-28T08:30:00.000Z',
    prompt: '雨夜城市街角',
    model: 'gpt-image-2',
    width: 1792,
    height: 1024,
    isPublic: false,
  },
  imageUrl: '/one.png',
};

it('exposes preview and deletion actions for an asset', () => {
  const select = vi.fn();
  const toggleSelection = vi.fn();
  const remove = vi.fn();
  render(
    <ImageGrid
      entries={[entry]}
      onSelect={select}
      onToggleSelection={toggleSelection}
      onToggleFavorite={vi.fn()}
      onRemove={remove}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '查看图片：雨夜城市街角' }));
  const selection = screen.getByRole('button', { name: '选择 one.png' });
  expect(selection.querySelector('.lucide-square')).toBeInTheDocument();
  fireEvent.click(selection);
  fireEvent.click(screen.getByRole('button', { name: '删除图片 one.png' }));
  expect(select).toHaveBeenCalledWith(entry);
  expect(toggleSelection).toHaveBeenCalledWith(entry);
  expect(remove).toHaveBeenCalledWith(entry);
  expect(screen.queryByText('未分类')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '删除图片 one.png' }).closest('.image-tile__actions'),
  ).toBeInTheDocument();
  const toolbar = screen.getByRole('toolbar', { name: '图片操作' });
  expect(toolbar).toContainElement(screen.getByRole('button', { name: '删除图片 one.png' }));
  expect(screen.getByRole('button', { name: '删除图片 one.png' })).toHaveClass(
    'button--secondary',
    'button--icon',
  );
  expect(
    screen.getByRole('button', { name: '删除图片 one.png' }).closest('.image-tile__morph'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看图片：雨夜城市街角' }).parentElement).toHaveStyle({
    aspectRatio: '1792 / 1024',
  });
  expect(screen.getByRole('button', { name: '收藏图片' }).parentElement).toHaveClass(
    'image-tile__favorite-trigger',
  );
});

it('binds square, landscape, and portrait media containers to their source dimensions', () => {
  const square: HistoryEntry = {
    ...entry,
    record: {
      ...entry.record,
      id: 'square.png',
      prompt: '方形资产',
      width: 1024,
      height: 1024,
    },
  };
  const portrait: HistoryEntry = {
    ...entry,
    record: {
      ...entry.record,
      id: 'portrait.png',
      prompt: '纵向资产',
      width: 1024,
      height: 1792,
    },
  };

  render(<ImageGrid entries={[square, entry, portrait]} onSelect={vi.fn()} />);

  expect(screen.getByRole('button', { name: '查看图片：方形资产' }).parentElement).toHaveStyle({
    aspectRatio: '1024 / 1024',
  });
  expect(screen.getByRole('button', { name: '查看图片：雨夜城市街角' }).parentElement).toHaveStyle({
    aspectRatio: '1792 / 1024',
  });
  expect(screen.getByRole('button', { name: '查看图片：纵向资产' }).parentElement).toHaveStyle({
    aspectRatio: '1024 / 1792',
  });
});

it('shows card-sized thumbnails instead of full originals', () => {
  render(
    <ImageGrid entries={[{ ...entry, imageUrl: '/api/outputs/one.png' }]} onSelect={vi.fn()} />,
  );

  expect(screen.getByRole('img', { name: '雨夜城市街角' })).toHaveAttribute(
    'src',
    '/api/outputs/one.png?w=640',
  );
});

it('shows an optional caption under each image', () => {
  render(<ImageGrid entries={[entry]} onSelect={vi.fn()} captionFor={() => 'alice · 同为海报'} />);

  expect(screen.getByText('alice · 同为海报')).toBeInTheDocument();
});

it('lays the images out as a wall of cards, each titled by the start of its prompt', () => {
  const long: HistoryEntry = {
    ...entry,
    record: {
      ...entry.record,
      id: 'long.png',
      prompt: '3:4 竖版卖点详情图。商品为山川明前绿茶茶罐，置于浅色背景',
      width: 1024,
      height: 1360,
    },
  };
  const { container } = render(<ImageGrid entries={[entry, long]} onSelect={vi.fn()} />);

  const grid = container.querySelector('.image-grid') as HTMLElement;
  expect(grid).toHaveClass('masonry__grid');
  expect(grid.parentElement).toHaveClass('masonry', 'masonry--cards');
  expect(grid.style.getPropertyValue('--masonry-rows')).toBe('40');
  expect(grid.style.getPropertyValue('--masonry-info-rows')).toBe('10');

  const [wide, tall] = [...container.querySelectorAll<HTMLElement>('.image-tile')];
  expect(wide).toHaveClass('media-card');
  // The picture's rows, ten for the caption and one for the gap under the card, which is
  // the home wall's 8px.
  expect(wide?.style.getPropertyValue('--masonry-span')).toBe(String(masonrySpan(1792, 1024, 10)));
  expect(tall?.style.getPropertyValue('--masonry-span')).toBe(String(masonrySpan(1024, 1360, 10)));
  expect(wide?.querySelector('.media-card__title')).toHaveTextContent(/^雨夜城市街角$/);
  expect(tall?.querySelector('.media-card__title')).toHaveTextContent(/^竖版卖点详情图$/);
  // The whole prompt is still the picture's name, for whoever cannot see it.
  expect(screen.getByRole('button', { name: `查看图片：${long.record.prompt}` })).toBeTruthy();
});

it('puts the caption on the line under the title, and leaves that line out when there is none', () => {
  const { container, rerender } = render(
    <ImageGrid entries={[entry]} onSelect={vi.fn()} captionFor={() => 'alice · 同为海报'} />,
  );
  const caption = container.querySelector('.image-tile__caption');
  expect(caption).toHaveClass('media-card__meta');
  expect(caption).toHaveTextContent('alice · 同为海报');
  expect(caption?.closest('.media-card__info')).not.toBeNull();

  rerender(<ImageGrid entries={[entry]} onSelect={vi.fn()} />);
  expect(container.querySelector('.image-tile__caption')).toBeNull();
  expect(container.querySelector('.media-card__title')).toHaveTextContent('雨夜城市街角');
});
