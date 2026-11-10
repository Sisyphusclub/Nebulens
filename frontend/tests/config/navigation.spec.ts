import { GalleryVerticalEnd, Image } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { getAppNavigation } from '@/config/navigation';

describe('app navigation', () => {
  it('uses a single-frame image icon for image generation', () => {
    expect(getAppNavigation().find((item) => item.to === '/generate')).toMatchObject({
      label: '生图',
      icon: Image,
    });
  });

  it('gives the shared results library a gallery icon, apart from the admin people icon', () => {
    const navigation = getAppNavigation(true);
    const library = navigation.find((item) => item.to === '/team');
    const admin = navigation.find((item) => item.to === '/admin/users');

    expect(library).toMatchObject({ label: '成果库', icon: GalleryVerticalEnd });
    expect(library?.icon).not.toBe(admin?.icon);
  });
});
