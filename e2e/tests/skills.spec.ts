import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';

test.use({ storageState: SKILLS_STATE });

test('runs a skill from its form, then redraws wrong text by itself', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: '技能' })
    .getByRole('button', { name: '使用技能：信息图' })
    .click();
  const panel = page.getByRole('dialog', { name: '信息图' });
  await expect(panel.getByLabel('将生成')).toContainText('竖版');
  await panel.getByLabel('标题').fill('端到端错字流程');
  await panel.getByRole('textbox', { name: '步骤或要点 1' }).fill('下载应用');
  await panel.getByRole('button', { name: '开始生成' }).click();

  // The skill opens its own session and makes a vertical and a horizontal image, each
  // from a prompt the server planned with the title quoted exactly.
  await expect(page).toHaveURL(/\/generate\?session=/);
  const prompts = page.locator('.session-batch__prompt');
  await expect(prompts.filter({ hasText: '“端到端错字流程”' })).toHaveCount(2, {
    timeout: 30_000,
  });

  // The mock vision model misreads text containing 错字, so each image is redrawn once.
  await expect(prompts.filter({ hasText: '请只修改图中的文字' })).toHaveCount(2, {
    timeout: 60_000,
  });
});
