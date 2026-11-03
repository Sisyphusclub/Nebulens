import { afterEach, expect, it } from 'vitest';

import { expectsRecentCreations, rememberRecentCreations } from '@/utils/recentSlot';

afterEach(() => {
  localStorage.clear();
});

it('reserves no room on a first visit, before anything is known', () => {
  expect(expectsRecentCreations()).toBe(false);
});

it('reserves room next time only when the last visit had something to continue', () => {
  rememberRecentCreations(true);
  expect(expectsRecentCreations()).toBe(true);

  rememberRecentCreations(false);
  expect(expectsRecentCreations()).toBe(false);
});
