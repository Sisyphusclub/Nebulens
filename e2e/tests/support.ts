import { expect, type Page } from '@playwright/test';

import { MOCK_UPSTREAM_URL } from '../playwright.config';

// Seeded by SEED_DEFAULT_ADMIN=true in .env.e2e; only ever exists on the e2e stack.
export const ADMIN = { username: 'blur', password: 'admin123' };

/**
 * Created by the global setup on the e2e stack. Skills make several images at once, so
 * their test signs in as this account to keep the burst off the admin's generation
 * rate limit, which every other test shares.
 */
export const SKILLS_USER = { username: 'skills_e2e', password: 'skills-e2e-password' };

export async function setMockFailure(on: boolean): Promise<void> {
  const res = await fetch(`${MOCK_UPSTREAM_URL}/__fail?on=${on ? 1 : 0}`);
  if (!res.ok) throw new Error(`Mock upstream control failed: ${res.status}`);
}

/**
 * Opens the generate page in a brand-new session. A bare /generate would restore the
 * remembered session or collect earlier batches into one, mixing results across tests.
 */
export async function openNewSession(page: Page): Promise<void> {
  await page.goto('/generate?prompt=');
}

export function batches(page: Page) {
  return page.locator('[data-generation-batch]');
}

/** Types a prompt into the generate composer and submits it. */
export async function submitPrompt(page: Page, prompt: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: '图像提示词' });
  await editor.click();
  await page.keyboard.type(prompt);
  await page.keyboard.press('Enter');
}

/**
 * Waits until the newest batch has finished with a loaded image. A failed generation
 * keeps its pending id, so surface its error card text instead of timing out.
 */
export async function expectLatestImage(page: Page): Promise<void> {
  const latest = batches(page).last();
  const errorCard = latest.locator('.generation-error-card');
  await expect
    .poll(async () => {
      if (await errorCard.count()) return `failed: ${await errorCard.innerText()}`;
      const id = await latest.getAttribute('data-generation-batch');
      return id?.startsWith('pending-') ? 'pending' : 'done';
    })
    .toBe('done');
  await expect(latest.locator('img').first()).toHaveJSProperty('complete', true);
  await expect
    .poll(() =>
      latest
        .locator('img')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
}
