import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';

// The skills account has its own quota, so these generations leave the shared one alone.
test.use({ storageState: SKILLS_STATE });

test('plans the images on the Agent canvas, asks first, then lays them out there', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agent 模式' }).click();
  // The billing note beside the send button only shows in a wide composer, so the mode is
  // read from the controls that are always there.
  await expect(page.getByRole('button', { name: 'Agent 模式' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '交给 Agent 开始创作' })).toBeVisible();
  const editor = page.getByRole('textbox', { name: '首页创作提示词' });
  await editor.click();
  await page.keyboard.type('端到端 Agent 规划，雨夜的未来城市');
  await page.keyboard.press('Enter');

  // The request carries on in the Agent's workspace. The mock text model picks no skill, so
  // it plans two images itself, and shows the plan before spending anything on it.
  await expect(page).toHaveURL(/\/agent\?session=/);
  const plan = page.getByRole('region', { name: '待确认的方案' });
  await expect(plan).toContainText('模拟规划');
  await expect(page.getByText('按需求自己规划画面')).toBeVisible();
  await plan.getByRole('button', { name: '开始生成' }).click();

  // Both pictures land on the canvas, and the session opens there from the sidebar.
  const pictures = page.getByRole('button', { name: /^画布图片：.*模拟规划/ });
  await expect(pictures).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByText('生成了 2 张图')).toBeVisible();
  await expect(page.getByRole('link', { name: /端到端 Agent 规划/ }).first()).toHaveAttribute(
    'href',
    /\/agent\?session=/,
  );

  // A picture selected on the canvas goes with the next request as its reference.
  await pictures.first().click();
  await expect(page.getByLabel('作为参考的图')).toContainText('选中的 1 张图');
});
