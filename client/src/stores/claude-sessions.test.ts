/**
 * Tests for Claude Sessions Store
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import {
  createClaudeSessionsStore,
  initialClaudeSessionsState,
  type ClaudeSessionsStore,
} from './claude-sessions';
import type {
  ExtendedSessionEntry,
  ProjectInfo,
  SessionListResponse,
} from '../../../src/types/claude-session';

describe('createClaudeSessionsStore', () => {
  let store: ClaudeSessionsStore;
  let fetchMock: Mock<typeof global.fetch>;

  beforeEach(() => {
    store = createClaudeSessionsStore();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      expect(store.sessions).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.projects).toEqual([]);
      expect(store.selectedSessionId).toBe(null);
      expect(store.filters).toEqual({});
      expect(store.pagination).toEqual({ offset: 0, limit: 50 });
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(null);
    });

    it('should match exported initial state', () => {
      const initial = initialClaudeSessionsState;
      expect(store.sessions).toEqual(initial.sessions);
      expect(store.total).toEqual(initial.total);
      expect(store.projects).toEqual(initial.projects);
      expect(store.selectedSessionId).toEqual(initial.selectedSessionId);
      expect(store.filters).toEqual(initial.filters);
      expect(store.pagination).toEqual(initial.pagination);
      expect(store.isLoading).toEqual(initial.isLoading);
      expect(store.error).toEqual(initial.error);
    });
  });

  describe('fetchProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockProjects: ProjectInfo[] = [
        {
          path: '/g/gits/tacogips/qraftbox',
          encoded: '-g-gits-tacogips-qraftbox',
          sessionCount: 10,
          lastModified: '2026-02-05T10:00:00Z',
        },
        {
          path: '/home/user/project',
          encoded: '-home-user-project',
          sessionCount: 5,
          lastModified: '2026-02-04T15:30:00Z',
        },
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: mockProjects }),
      } as Response);

      await store.fetchProjects();

      expect(fetchMock).toHaveBeenCalledWith('/api/claude/projects');
      expect(store.projects).toEqual(mockProjects);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(null);
    });

    it('should set loading state during fetch', async () => {
      fetchMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ projects: [] }),
              } as Response);
            }, 100);
          })
      );

      const promise = store.fetchProjects();
      expect(store.isLoading).toBe(true);
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle fetch error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response);

      await store.fetchProjects();

      expect(store.projects).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toContain('Failed to load projects');
    });

    it('should handle network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await store.fetchProjects();

      expect(store.isLoading).toBe(false);
      expect(store.error).toBe('Network error');
    });
  });

  describe('fetchSessions', () => {
    const mockSession: ExtendedSessionEntry = {
      sessionId: 'session-123',
      fullPath: '/home/.claude/projects/test/session-123.jsonl',
      fileMtime: 1707139200000,
      firstPrompt: 'Test prompt',
      summary: 'Test summary',
      messageCount: 5,
      created: '2026-02-05T10:00:00Z',
      modified: '2026-02-05T12:00:00Z',
      gitBranch: 'main',
      projectPath: '/g/gits/tacogips/qraftbox',
      isSidechain: false,
      source: 'qraftbox',
      projectEncoded: '-g-gits-tacogips-qraftbox',
    };

    it('should fetch sessions successfully', async () => {
      const mockResponse: SessionListResponse = {
        sessions: [mockSession],
        total: 1,
        offset: 0,
        limit: 50,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await store.fetchSessions();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/claude/sessions?')
      );
      expect(store.sessions).toEqual([mockSession]);
      expect(store.total).toBe(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(null);
    });

    it('should include filters in query params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [],
          total: 0,
          offset: 0,
          limit: 50,
        }),
      } as Response);

      await store.fetchSessions({
        workingDirectoryPrefix: '/g/gits',
        source: 'qraftbox',
        branch: 'main',
      });

      const callArg = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(callArg).toContain('workingDirectoryPrefix=%2Fg%2Fgits');
      expect(callArg).toContain('source=qraftbox');
      expect(callArg).toContain('branch=main');
    });

    it('should reset offset when fetching with new filters', async () => {
      store.setFilters({});
      // Set a non-zero offset
      await store.loadMore();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [],
          total: 0,
          offset: 0,
          limit: 50,
        }),
      } as Response);

      await store.fetchSessions({ source: 'qraftbox' });

      expect(store.pagination.offset).toBe(0);
    });

    it('should handle fetch error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      } as Response);

      await store.fetchSessions();

      expect(store.sessions).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toContain('Failed to load sessions');
    });
  });

  describe('selectSession', () => {
    it('should set selected session ID', () => {
      store.selectSession('session-123');
      expect(store.selectedSessionId).toBe('session-123');
    });

    it('should clear selected session with null', () => {
      store.selectSession('session-123');
      store.selectSession(null);
      expect(store.selectedSessionId).toBe(null);
    });
  });

  describe('setFilters', () => {
    it('should update single filter', () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.setFilters({ source: 'qraftbox' });

      expect(store.filters.source).toBe('qraftbox');
      expect(store.pagination.offset).toBe(0);
    });

    it('should update multiple filters', () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.setFilters({
        source: 'qraftbox',
        branch: 'main',
        workingDirectoryPrefix: '/g/gits',
      });

      expect(store.filters.source).toBe('qraftbox');
      expect(store.filters.branch).toBe('main');
      expect(store.filters.workingDirectoryPrefix).toBe('/g/gits');
    });

    it('should merge with existing filters', () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.setFilters({ source: 'qraftbox' });
      store.setFilters({ branch: 'main' });

      expect(store.filters.source).toBe('qraftbox');
      expect(store.filters.branch).toBe('main');
    });

    it('should reset offset', () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.loadMore();
      store.setFilters({ source: 'qraftbox' });

      expect(store.pagination.offset).toBe(0);
    });

    it('should automatically fetch sessions', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.setFilters({ source: 'qraftbox' });

      // Wait for async fetch
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('clearFilters', () => {
    it('should clear all filters', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.setFilters({ source: 'qraftbox', branch: 'main' });
      store.clearFilters();

      expect(store.filters).toEqual({});
      expect(store.pagination.offset).toBe(0);
    });

    it('should automatically fetch sessions', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      store.clearFilters();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Test error'));
      await store.fetchProjects();

      expect(store.error).not.toBe(null);

      store.clearError();
      expect(store.error).toBe(null);
    });
  });

  describe('loadMore', () => {
    it('should increment offset by limit', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 50, limit: 50 }),
      } as Response);

      await store.loadMore();

      expect(store.pagination.offset).toBe(50);
    });

    it('should fetch sessions with new offset', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 50, limit: 50 }),
      } as Response);

      await store.loadMore();

      const callArg = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(callArg).toContain('offset=50');
    });
  });

  describe('resumeSession', () => {
    it('should resume session successfully', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'resumed',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await store.resumeSession('session-123');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/claude/sessions/session-123/resume',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: undefined }),
        })
      );
      expect(result).toEqual(mockResponse);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(null);
    });

    it('should resume session with prompt', async () => {
      const mockResponse = {
        sessionId: 'session-123',
        status: 'resumed',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await store.resumeSession('session-123', 'Continue with tests');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/claude/sessions/session-123/resume',
        expect.objectContaining({
          body: JSON.stringify({ prompt: 'Continue with tests' }),
        })
      );
    });

    it('should handle resume error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      } as Response);

      await expect(store.resumeSession('session-123')).rejects.toThrow();

      expect(store.isLoading).toBe(false);
      expect(store.error).toContain('Failed to resume session');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          sessions: [
            {
              sessionId: 'test',
              fullPath: '/test',
              fileMtime: 0,
              firstPrompt: 'test',
              summary: 'test',
              messageCount: 1,
              created: '2026-01-01',
              modified: '2026-01-01',
              gitBranch: 'main',
              projectPath: '/test',
              isSidechain: false,
              source: 'qraftbox',
              projectEncoded: 'test',
            } as ExtendedSessionEntry,
          ],
          total: 1,
          offset: 0,
          limit: 50,
        }),
      } as Response);

      await store.fetchSessions({ source: 'qraftbox' });
      store.selectSession('session-123');

      store.reset();

      expect(store.sessions).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.projects).toEqual([]);
      expect(store.selectedSessionId).toBe(null);
      expect(store.filters).toEqual({});
      expect(store.pagination).toEqual({ offset: 0, limit: 50 });
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe('date range filters', () => {
    it('should include date range in query params', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      await store.fetchSessions({
        dateRange: {
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
        },
      });

      const callArg = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(callArg).toContain('dateFrom=2026-01-01');
      expect(callArg).toContain('dateTo=2026-02-01');
    });
  });

  describe('search query filter', () => {
    it('should include search query in params', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], total: 0, offset: 0, limit: 50 }),
      } as Response);

      await store.fetchSessions({
        searchQuery: 'authentication',
      });

      const callArg = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(callArg).toContain('search=authentication');
    });
  });
});
