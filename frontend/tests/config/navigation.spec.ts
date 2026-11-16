import { Image } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { getAppNavigation } from '@/config/navigation';

describe('app navigation', () => {
  it('uses a single-frame image icon for image generation', () => {
    expect(getAppNavigation().find((item) => item.to === '/generate')).toMatchObject({
      label: '生图',
      icon: Image,
    });
  });

  it('lists four pages, and user management for an admin; there is no gallery page', () => {
    expect(getAppNavigation().map((item) => [item.label, item.to])).toEqual([
      ['发现', '/'],
      ['生图', '/generate'],
      ['创作模板', '/templates'],
      ['资产', '/history'],
    ]);
    expect(getAppNavigation(true).at(-1)).toMatchObject({ label: '用户管理', to: '/admin/users' });
  });
});
