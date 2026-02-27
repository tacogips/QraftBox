import { expect, test } from '@playwright/test';

test('second prompt continues current session id', async ({ page }) => {
  const contextId = 'ctx-1';
  const projectPath = '/tmp/project';
  const submitBodies = [];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === '/api/health' && method === 'GET') {
      await route.fulfill({ status: 200, json: { status: 'ok', timestamp: Date.now() } });
      return;
    }

    if (path === '/api/workspace' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          workspace: {
            tabs: [
              {
                id: contextId,
                path: projectPath,
                name: 'project',
                isGitRepo: true,
                projectSlug: 'project',
              },
            ],
            activeTabId: contextId,
          },
        },
      });
      return;
    }

    if (path === '/api/workspace/recent' && method === 'GET') {
      await route.fulfill({ status: 200, json: { recent: [] } });
      return;
    }

    if (path === `/api/ctx/${contextId}/diff` && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          files: [
            {
              path: 'README.md',
              status: 'modified',
              additions: 1,
              deletions: 0,
              hunks: [],
            },
          ],
        },
      });
      return;
    }

    if (path === '/api/model-config' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          profiles: [],
          operationBindings: {},
          operationLanguages: {},
          promptOverrides: {},
        },
      });
      return;
    }

    if (path === '/api/ai/prompt-queue' && method === 'GET') {
      await route.fulfill({ status: 200, json: { prompts: [] } });
      return;
    }

    if (path === '/api/ai/sessions' && method === 'GET') {
      await route.fulfill({ status: 200, json: { sessions: [] } });
      return;
    }

    if (path === '/api/ai/sessions/hidden' && method === 'GET') {
      await route.fulfill({ status: 200, json: { sessionIds: [] } });
      return;
    }

    if (
      path === `/api/ctx/${contextId}/claude-sessions/sessions` &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        json: {
          sessions: [],
          total: 0,
          offset: 0,
          limit: 20,
        },
      });
      return;
    }

    if (path === '/api/ai/submit' && method === 'POST') {
      const body = req.postDataJSON();
      submitBodies.push(body);

      await route.fulfill({
        status: 200,
        json: {
          sessionId: body.qraft_ai_session_id,
          immediate: false,
        },
      });
      return;
    }

    await route.fulfill({ status: 200, json: {} });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sessions' }).click();
  await page.getByRole('button', { name: /create new session/i }).click();

  const promptInput = page.getByPlaceholder('Add the next instruction for this session');
  await expect(promptInput).toBeVisible();

  await promptInput.fill('say hello');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => submitBodies.length).toBe(1);

  await promptInput.fill('say hello again');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => submitBodies.length).toBe(2);

  expect(typeof submitBodies[0]?.qraft_ai_session_id).toBe('string');
  expect(submitBodies[0]?.qraft_ai_session_id?.length ?? 0).toBeGreaterThan(0);
  expect(submitBodies[1]?.qraft_ai_session_id).toBe(
    submitBodies[0]?.qraft_ai_session_id,
  );
});
