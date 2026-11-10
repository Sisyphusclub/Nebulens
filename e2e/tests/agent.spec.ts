import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';

// The skills account has its own quota, so these generations leave the shared one alone.
test.use({ storageState: SKILLS_STATE });

test('plans the images with the text model when no skill fits an Agent mode request', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent 模式' }).click();
  await expect(page.getByText('按实际用量计费')).toBeVisible();
  const editor = page.getByRole('textbox', { name: '首页创作提示词' });
  await editor.click();
  await page.keyboard.type('端到端 Agent 规划，雨夜的未来城市');
  await page.keyboard.press('Enter');

  // The mock text model picks no skill, so it plans two images itself; both are made in a
  // session of their own.
  await expect(page).toHaveURL(/\/generate\?session=/);
  const prompts = page.locator('.session-batch__prompt');
  await expect(prompts.filter({ hasText: '模拟规划' })).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: /模拟规划/ }).first()).toBeVisible();
});
