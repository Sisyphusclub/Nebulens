import { expect, it } from 'vitest';

import { thumbnailUrl } from '@/utils/thumbnail';

it('asks the API for a resized copy of a generated image', () => {
  expect(thumbnailUrl('http://localhost:3000/api/outputs/a1.png', 640)).toBe(
    'http://localhost:3000/api/outputs/a1.png?w=640',
  );
  expect(thumbnailUrl('/api/outputs/a1.png', 320)).toBe('/api/outputs/a1.png?w=320');
});

it('keeps an existing query such as a signed link', () => {
  expect(thumbnailUrl('/api/outputs/a1.png?expires=1&signature=x', 320)).toBe(
    '/api/outputs/a1.png?expires=1&signature=x&w=320',
  );
});

it('leaves local previews and static media untouched', () => {
  expect(thumbnailUrl('blob:http://localhost/abc', 640)).toBe('blob:http://localhost/abc');
  expect(thumbnailUrl('/media/skills/poster.jpg', 640)).toBe('/media/skills/poster.jpg');
});
