import { expect, test } from '@playwright/test';

import { SKILLS_STATE } from '../playwright.config';

// The skills account has its own quota, so these generations leave the shared one alone.
test.use({ storageState: SKILLS_STATE });

test('plans the images on the Agent canvas, asks first, then lays them out there', async ({
  page,
  browser,
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

  // The project is kept on the server. A picture is dragged somewhere else, so its place
  // is one no fresh layout would give it.
  const placesOf = (nodes: Element[]) =>
    nodes.map((node) => {
      const { left, top } = (node as HTMLElement).style;
      return { x: Number.parseFloat(left), y: Number.parseFloat(top) };
    });
  const second = pictures.nth(1);
  const placeOfSecond = async () => (await second.evaluateAll(placesOf))[0];
  const before = await placeOfSecond();
  const box = await second.boundingBox();
  if (box === null) throw new Error('The second picture is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await placeOfSecond())?.y).not.toBe(before?.y);
  const moved = await placeOfSecond();
  await page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== 'PUT' || !response.url().endsWith('/nodes') || !response.ok()) {
      return false;
    }
    const sent = request.postDataJSON() as { positions: Record<string, { x: number; y: number }> };
    // A place read back from the page's styles is rounded, so it is matched closely.
    return Object.values(sent.positions).some(
      (point) =>
        moved !== undefined &&
        Math.abs(point.x - moved.x) < 0.01 &&
        Math.abs(point.y - moved.y) < 0.01,
    );
  });
  const places = await pictures.evaluateAll(placesOf);

  // Another browser signed in to the same account has none of this in its own storage. It
  // finds the project in the sidebar and opens it as it was left: the conversation, the
  // pictures, and each of them where it was put.
  const elsewhere = await browser.newContext({ storageState: SKILLS_STATE });
  try {
    const other = await elsewhere.newPage();
    await other.goto(new URL('/', page.url()).toString());
    await other
      .getByRole('link', { name: /端到端 Agent 规划/ })
      .first()
      .click();
    await expect(other).toHaveURL(page.url());
    await expect(other.getByText('生成了 2 张图')).toBeVisible();
    const samePictures = other.getByRole('button', { name: /^画布图片：.*模拟规划/ });
    await expect(samePictures).toHaveCount(2);
    expect(await samePictures.evaluateAll(placesOf)).toEqual(places);
  } finally {
    await elsewhere.close();
  }
});
