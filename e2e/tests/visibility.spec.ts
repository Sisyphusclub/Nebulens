import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';
import { expectLatestImage, openNewSession, submitPrompt } from './support';

// The skills account has its own quota, so this generation leaves the shared one alone.
test.use({ storageState: SKILLS_STATE });

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
  const sharedWork = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/history/team',
  );
  await page.goto('/');
  expect((await sharedWork).ok()).toBe(true);
  const showcase = page.getByRole('region', { name: '灵感' });
  await expect(showcase.getByRole('button', { name: /^做同款：/ }).first()).toBeVisible();
  await expect(showcase.getByRole('button', { name: `做同款：${prompt}` })).toHaveCount(0);
});
