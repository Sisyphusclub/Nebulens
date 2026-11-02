import { request, type FullConfig } from '@playwright/test';

import { ADMIN_STATE, BASE_URL, MOCK_UPSTREAM_URL, SKILLS_STATE } from './playwright.config';
import { ADMIN, SKILLS_USER, setMockFailure } from './tests/support';

// Signs in once and stores the session, so tests do not spend the auth rate limit,
// and gives the seeded admin enough credits for every run on the same stack. The
// skills test gets its own account the same way.
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

    let skillsUserId = users.find((user) => user.username === SKILLS_USER.username)?.id;
    if (skillsUserId === undefined) {
      const created = await api.post('/api/admin/users', { data: SKILLS_USER });
      if (!created.ok())
        throw new Error(
          `Creating the skills user failed: ${created.status()} ${await created.text()}`,
        );
      skillsUserId = ((await created.json()) as { user: { id: string } }).user.id;
    }
    const skillsQuota = await api.patch(
      `/api/admin/users/${encodeURIComponent(skillsUserId)}/quota`,
      { data: { permanentTotal: 100 } },
    );
    if (!skillsQuota.ok())
      throw new Error(
        `Setting skills user quota failed: ${skillsQuota.status()} ${await skillsQuota.text()}`,
      );
  } finally {
    await api.dispose();
  }

  const skillsApi = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  });
  try {
    const signIn = await skillsApi.post('/api/auth/sign-in/username', { data: SKILLS_USER });
    if (!signIn.ok())
      throw new Error(`Skills user sign-in failed: ${signIn.status()} ${await signIn.text()}`);
    await skillsApi.storageState({ path: SKILLS_STATE });
  } finally {
    await skillsApi.dispose();
  }
  console.log(`e2e stack ready at ${BASE_URL} (mock upstream ${MOCK_UPSTREAM_URL})`);
}
