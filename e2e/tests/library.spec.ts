import { expect, test } from '@playwright/test';

import { expectLatestImage, openNewSession, submitPrompt } from './support';

test('finds shared work with AI search, serves thumbnails, and makes a similar one', async ({
  page,
}) => {
  // New images are shared to the library by default.
  const prompt = '端到端：咖啡新品海报，暖色调';
  await openNewSession(page);
  await submitPrompt(page, prompt);
  await expectLatestImage(page);

  // Describing a need searches the library and says why each piece was picked.
  await page.goto('/team');
  await page.getByRole('searchbox', { name: '描述你要找的作品' }).fill('咖啡新品海报');
  await expect(page.getByText(/AI 找到 \d+ 个相关作品/)).toBeVisible();
  const match = page.getByRole('button', { name: `查看图片：${prompt}` }).first();
  await expect(match).toBeVisible();
  await expect(page.locator('.image-tile__caption').first()).toContainText('blur ·');

  // Grid cards load a WebP thumbnail instead of the full original.
  const src = await match.locator('img').getAttribute('src');
  expect(src).toContain('?w=640');
  const thumbnail = await page.request.get(src ?? '');
  expect(thumbnail.ok()).toBe(true);
  expect(thumbnail.headers()['content-type']).toBe('image/webp');

  // The homepage showcase offers the newest shared work to copy.
  await page.goto('/');
  const showcase = page.getByRole('region', { name: '成果库精选' });
  await showcase
    .getByRole('button', { name: `做同款：${prompt}` })
    .first()
    .click();
  await expect(page.getByRole('textbox', { name: '首页创作提示词' })).toContainText('咖啡新品海报');
});
