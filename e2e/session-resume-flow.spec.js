const { expect, test } = require('@playwright/test');

test('second prompt continues current claude session', async ({ page }) => {
  const contextId = 'ctx-1';
  const projectPath = '/tmp/project';
  let promptCounter = 0;
  const dispatchBodies = [];
  let aiSessions = [];

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

    if (path === '/api/workspace/recent' && method === 'GET') {
      await route.fulfill({ status: 200, json: { recent: [] } });
      return;
    }

    if (path === '/api/ai/queue/status' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          runningCount: 0,
          queuedCount: aiSessions.filter((s) => s.state === 'queued').length,
          runningSessionIds: [],
          totalCount: aiSessions.length,
        },
      });
      return;
    }

    if (path === '/api/ai/sessions' && method === 'GET') {
      await route.fulfill({ status: 200, json: { sessions: aiSessions } });
      return;
    }

    if (path === '/api/prompts' && method === 'POST') {
      promptCounter += 1;
      await route.fulfill({
        status: 200,
        json: {
          prompt: {
            id: `prompt-${promptCounter}`,
            prompt: 'x',
            description: '',
            context: { references: [] },
            projectPath,
            status: 'pending',
            sessionId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: null,
          },
        },
      });
      return;
    }

    if (path.startsWith('/api/prompts/') && path.endsWith('/dispatch') && method === 'POST') {
      const body = req.postDataJSON();
      dispatchBodies.push(body);

      if (dispatchBodies.length === 1) {
        aiSessions = [
          {
            id: 'session-qb-1',
            state: 'queued',
            prompt: 'hello',
            createdAt: new Date().toISOString(),
            context: { references: [] },
            claudeSessionId: 'claude-1',
          },
        ];
      }

      await route.fulfill({
        status: 200,
        json: {
          prompt: { id: `prompt-${dispatchBodies.length}` },
          session: { sessionId: `session-qb-${dispatchBodies.length}` },
        },
      });
      return;
    }

    if (path === '/api/prompts' && method === 'GET') {
      await route.fulfill({ status: 200, json: { prompts: [], total: 0 } });
      return;
    }

    if (path.startsWith(`/api/ctx/${contextId}/claude-sessions/sessions`) && method === 'GET') {
      await route.fulfill({ status: 200, json: { sessions: [], total: 0, offset: 0, limit: 20 } });
      return;
    }

    await route.fulfill({ status: 200, json: {} });
  });

  await page.goto('/');

  const promptInput = page.getByLabel('AI prompt (single-line)');
  await expect(promptInput).toBeVisible();

  await promptInput.fill('say hello');
  await page.keyboard.press('Enter');
  await expect.poll(() => dispatchBodies.length).toBe(1);
  expect(dispatchBodies[0].resumeSessionId).toBeUndefined();

  await promptInput.fill('say hello again');
  await page.keyboard.press('Enter');
  await expect.poll(() => dispatchBodies.length).toBe(2);
  expect(dispatchBodies[1].resumeSessionId).toBe('claude-1');
});
