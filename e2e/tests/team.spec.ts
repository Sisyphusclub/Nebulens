import { expect, test } from '@playwright/test';

import { batches, expectLatestImage, openNewSession, submitPrompt } from './support';

test('checks quoted text after generation, fixes it, and shares the work', async ({ page }) => {
  const prompt = '端到端：海报标题写“错字检查”';
  await openNewSession(page);
  await submitPrompt(page, prompt);
  await expectLatestImage(page);

  // The mock vision model reports “错字” as “措字”; analysis runs in the background.
  const notice = batches(page).last().getByRole('status').filter({ hasText: '疑似错字' });
  await expect(notice).toContainText('“错字检查”被写成了“措字检查”', { timeout: 30_000 });

  await notice.getByRole('button', { name: '修正文字' }).click();
  await expect(batches(page)).toHaveCount(2);
  await expectLatestImage(page);

  await page.goto('/team');
  await page.getByRole('button', { name: '用途筛选' }).click();
  await page.getByRole('menuitemradio', { name: '海报' }).click();
  await page
    .getByRole('button', { name: `查看图片：${prompt}` })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: '图片详情' });
  await expect(dialog).toContainText('模拟分析：一张测试海报');
  await expect(dialog).toContainText('团队可见');
});
