import { expect, test } from '@playwright/test';

import { expectLatestImage, openNewSession, submitPrompt } from './support';

test('finds work with AI search, serves thumbnails, and makes a similar one', async ({ page }) => {
  // New images are visible to everyone by default.
  const prompt = '端到端：咖啡新品海报，暖色调';
  await openNewSession(page);
  await submitPrompt(page, prompt);
  await expectLatestImage(page);

  // Describing a need searches the maker's assets and says why each piece was picked.
  await page.goto('/history');
  await page.getByRole('button', { name: 'AI 找图' }).click();
  await page.getByRole('searchbox', { name: '搜索资产' }).fill('咖啡新品海报');
  await expect(page.getByText(/AI 找到 \d+ 张/)).toBeVisible();
  const match = page.getByRole('button', { name: `查看图片：${prompt}` }).first();
  await expect(match).toBeVisible();
  await expect(page.locator('.image-tile__caption').first()).toContainText(
    /同为海报|标签相近|画面描述相近/,
  );

  // Grid cards load a WebP thumbnail instead of the full original.
  const src = await match.locator('img').getAttribute('src');
  expect(src).toContain('?w=640');
  const thumbnail = await page.request.get(src ?? '');
  expect(thumbnail.ok()).toBe(true);
  expect(thumbnail.headers()['content-type']).toBe('image/webp');

  // The homepage inspiration feed offers the newest work everyone can see to copy.
  await page.goto('/');
  const showcase = page.getByRole('region', { name: '灵感' });
  await showcase
    .getByRole('button', { name: `做同款：${prompt}` })
    .first()
    .click();
  await expect(page.getByRole('textbox', { name: '首页创作提示词' })).toContainText('咖啡新品海报');
});

test('keeps an image to its maker when asked to', async ({ page }) => {
  const prompt = '端到端：只给自己看的草图';
  await openNewSession(page);
  await page.getByRole('button', { name: '自定义生成参数' }).click();
  await page.getByRole('menuitemradio', { name: '仅自己可见' }).click();
  await page.keyboard.press('Escape');
  await submitPrompt(page, prompt);
  await expectLatestImage(page);

  // Its maker's assets say who can see it.
  await page.goto('/history');
  await page
    .getByRole('button', { name: `查看图片：${prompt}` })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: '图片详情' })).toContainText('仅自己可见');
  await page.keyboard.press('Escape');

  // The homepage wall offers only work everyone can see, even to the maker.
  await page.goto('/');
  const showcase = page.getByRole('region', { name: '灵感' });
  await expect(showcase.getByRole('button', { name: /^做同款：端到端/ }).first()).toBeVisible();
  await expect(showcase.getByRole('button', { name: `做同款：${prompt}` })).toHaveCount(0);
});
