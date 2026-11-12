import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';

test.use({ storageState: SKILLS_STATE });

test('runs a skill from one line in the composer, then redraws wrong text by itself', async ({
  page,
}) => {
  await page.goto('/');
  // Every skill is in the composer's own library; the chips under it show only what fits.
  await page.getByRole('button', { name: '技能库' }).click();
  await page.getByRole('menuitem', { name: /^信息图/ }).click();
  await expect(
    page.getByRole('group', { name: '技能：信息图' }).getByLabel('将生成'),
  ).toContainText('竖版');
  const editor = page.getByRole('textbox', { name: '首页创作提示词' });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type('端到端错字流程，下载应用、填写手机号');
  await page.keyboard.press('Enter');

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
