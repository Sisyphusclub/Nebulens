import { expect, test } from '@playwright/test';

import {
  ADMIN,
  batches,
  expectLatestImage,
  openNewSession,
  setMockFailure,
  submitPrompt,
} from './support';

test.afterEach(async () => {
  await setMockFailure(false);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs in through the account dialog', async ({ page }) => {
    await page.goto('/generate');
    await page.getByRole('button', { name: '登录', exact: true }).filter({ visible: true }).click();
    const dialog = page.locator('form').filter({ has: page.getByLabel('用户名') });
    await dialog.getByLabel('用户名').fill(ADMIN.username);
    await dialog.getByLabel('密码', { exact: true }).fill(ADMIN.password);
    await dialog.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page.getByRole('button', { name: `账户：${ADMIN.username}` })).toBeVisible();
  });
});

test('generates an image from a prompt', async ({ page }) => {
  await openNewSession(page);
  await submitPrompt(page, '端到端：清晨窗边的咖啡');

  await expect(page).toHaveURL(/[?&]session=/);
  await expect(batches(page)).toHaveCount(1);
  await expectLatestImage(page);
  await expect(page.getByText('生成完成', { exact: true })).toBeVisible();
});

test('retries a failed generation in place of its error card', async ({ page }) => {
  await openNewSession(page);
  await setMockFailure(true);
  await submitPrompt(page, '端到端：先失败再重试');

  const errorCard = page.locator('.generation-error-card');
  await expect(errorCard).toBeVisible();
  await expect(errorCard).toContainText('生成失败');

  await setMockFailure(false);
  await errorCard.getByRole('button', { name: '重试' }).click();

  await expect(errorCard).toHaveCount(0);
  await expect(batches(page)).toHaveCount(1);
  await expectLatestImage(page);
});

test('returns to the latest result after a refresh', async ({ page }) => {
  await openNewSession(page);
  // A locally saved failed task at the top used to steal the initial scroll on reload.
  await setMockFailure(true);
  await submitPrompt(page, '端到端：先失败的一组');
  await expect(page.locator('.generation-error-card')).toBeVisible();
  await setMockFailure(false);
  for (const prompt of ['端到端：第一组', '端到端：第二组', '端到端：第三组']) {
    await submitPrompt(page, prompt);
    await expectLatestImage(page);
  }
  await expect(batches(page)).toHaveCount(4);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(batches(page).last()).not.toBeInViewport();
  await page.reload();

  await expect(batches(page)).toHaveCount(4);
  await expect(batches(page).last()).toBeInViewport({ ratio: 0.9 });
});

test('adds a pasted image as a reference instead of inline content', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: '首页创作提示词' });
  await editor.click();

  // A real clipboard needs OS permissions; a synthetic paste exercises the same handler.
  const defaultPrevented = await editor.evaluate(async (target) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    canvas.getContext('2d')!.fillRect(0, 0, 32, 32);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], 'pasted-reference.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(defaultPrevented).toBe(true);
  await expect(page.getByText('pasted-reference.png')).toBeVisible();
  await expect(editor.locator('img')).toHaveCount(0);
});

test('polishes a prompt with AI and keeps quoted text', async ({ page }) => {
  await openNewSession(page);
  const editor = page.getByRole('textbox', { name: '图像提示词' });
  await editor.click();
  await page.keyboard.type('端到端：咖啡海报，标题“晨光拿铁”');

  await page.getByRole('button', { name: 'AI 润色提示词' }).click();

  await expect(editor).toContainText('模拟润色：柔和自然光，电影感构图');
  await expect(editor).toContainText('“晨光拿铁”');
  await page.getByRole('button', { name: '撤销润色' }).click();
  await expect(editor).not.toContainText('模拟润色');
});
