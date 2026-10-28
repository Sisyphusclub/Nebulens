import { request, type FullConfig } from '@playwright/test';

import { ADMIN_STATE, BASE_URL, MOCK_UPSTREAM_URL } from './playwright.config';
import { ADMIN, setMockFailure } from './tests/support';

// Signs in once and stores the session, so tests do not spend the auth rate limit,
// and gives the seeded admin enough credits for every run on the same stack.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await setMockFailure(false);
  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  });
  try {
    const signIn = await api.post('/api/auth/sign-in/username', {
      data: ADMIN,
    });
    if (!signIn.ok())
      throw new Error(`Admin sign-in failed: ${signIn.status()} ${await signIn.text()}`);

    const list = await api.get('/api/admin/users');
    const { users } = (await list.json()) as {
      users: Array<{ id: string; username?: string }>;
    };
    const admin = users.find((user) => user.username === ADMIN.username);
    if (!admin) throw new Error(`Seeded admin "${ADMIN.username}" not found`);

    const quota = await api.patch(`/api/admin/users/${encodeURIComponent(admin.id)}/quota`, {
      data: { permanentTotal: 100 },
    });
    if (!quota.ok())
      throw new Error(`Setting admin quota failed: ${quota.status()} ${await quota.text()}`);

    await api.storageState({ path: ADMIN_STATE });
  } finally {
    await api.dispose();
  }
  console.log(`e2e stack ready at ${BASE_URL} (mock upstream ${MOCK_UPSTREAM_URL})`);
}
