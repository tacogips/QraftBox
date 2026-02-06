import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { SessionRegistry, type AyndSessionRegistry } from './session-registry';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

describe('SessionRegistry', () => {
  let testDir: string;
  let testRegistryPath: string;
  let registry: SessionRegistry;

  beforeEach(async () => {
    // Create temporary directory for each test
    testDir = await mkdtemp(join(tmpdir(), 'aynd-registry-test-'));
    testRegistryPath = join(testDir, 'session-registry.json');
    registry = new SessionRegistry(testRegistryPath);
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('register', () => {
    test('creates registry file on first registration', async () => {
      expect(existsSync(testRegistryPath)).toBe(false);

      await registry.register('session-123', '/test/project');

      expect(existsSync(testRegistryPath)).toBe(true);
    });

    test('adds session to registry', async () => {
      await registry.register('session-123', '/test/project');

      const result = await registry.getRegistry();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe('session-123');
      expect(result.sessions[0]?.projectPath).toBe('/test/project');
      expect(result.sessions[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('registers multiple sessions', async () => {
      await registry.register('session-1', '/project-1');
      await registry.register('session-2', '/project-2');
      await registry.register('session-3', '/project-1');

      const result = await registry.getRegistry();

      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.map(s => s.sessionId)).toEqual([
        'session-1',
        'session-2',
        'session-3',
      ]);
    });

    test('does not register duplicate session IDs', async () => {
      await registry.register('session-123', '/project-1');
      await registry.register('session-123', '/project-2'); // Same ID

      const result = await registry.getRegistry();

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.sessionId).toBe('session-123');
      expect(result.sessions[0]?.projectPath).toBe('/project-1'); // Original path
    });

    test('creates nested directories if needed', async () => {
      const nestedPath = join(testDir, 'nested', 'dir', 'registry.json');
      const nestedRegistry = new SessionRegistry(nestedPath);

      await nestedRegistry.register('session-123', '/test/project');

      expect(existsSync(nestedPath)).toBe(true);
    });
  });

  describe('isAyndSession', () => {
    test('returns true for registered sessions', async () => {
      await registry.register('session-123', '/test/project');

      const result = await registry.isAyndSession('session-123');

      expect(result).toBe(true);
    });

    test('returns false for unregistered sessions', async () => {
      await registry.register('session-123', '/test/project');

      const result = await registry.isAyndSession('session-456');

      expect(result).toBe(false);
    });

    test('returns false for empty registry', async () => {
      const result = await registry.isAyndSession('session-123');

      expect(result).toBe(false);
    });

    test('works after multiple registrations', async () => {
      await registry.register('session-1', '/project-1');
      await registry.register('session-2', '/project-2');
      await registry.register('session-3', '/project-3');

      expect(await registry.isAyndSession('session-1')).toBe(true);
      expect(await registry.isAyndSession('session-2')).toBe(true);
      expect(await registry.isAyndSession('session-3')).toBe(true);
      expect(await registry.isAyndSession('session-4')).toBe(false);
    });
  });

  describe('getRegistry', () => {
    test('returns empty registry initially', async () => {
      const result = await registry.getRegistry();

      expect(result).toEqual({
        sessions: [],
      });
    });

    test('returns all registered sessions', async () => {
      await registry.register('session-1', '/project-1');
      await registry.register('session-2', '/project-2');

      const result = await registry.getRegistry();

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.map(s => s.sessionId)).toEqual(['session-1', 'session-2']);
    });

    test('creates registry file if missing', async () => {
      expect(existsSync(testRegistryPath)).toBe(false);

      await registry.getRegistry();

      expect(existsSync(testRegistryPath)).toBe(true);
    });
  });

  describe('concurrent access', () => {
    test('handles concurrent registrations', async () => {
      // Register multiple sessions concurrently
      const registrations = [
        registry.register('session-1', '/project-1'),
        registry.register('session-2', '/project-2'),
        registry.register('session-3', '/project-3'),
        registry.register('session-4', '/project-4'),
        registry.register('session-5', '/project-5'),
      ];

      await Promise.all(registrations);

      const result = await registry.getRegistry();

      expect(result.sessions).toHaveLength(5);
      expect(result.sessions.map(s => s.sessionId)).toContain('session-1');
      expect(result.sessions.map(s => s.sessionId)).toContain('session-2');
      expect(result.sessions.map(s => s.sessionId)).toContain('session-3');
      expect(result.sessions.map(s => s.sessionId)).toContain('session-4');
      expect(result.sessions.map(s => s.sessionId)).toContain('session-5');
    });

    test('lock prevents data corruption', async () => {
      // Rapidly register sessions concurrently
      const registrations = [];
      for (let i = 0; i < 10; i++) {
        registrations.push(registry.register(`session-${i}`, `/project-${i}`));
      }

      await Promise.all(registrations);

      const result = await registry.getRegistry();

      // All 10 sessions should be registered
      expect(result.sessions.length).toBe(10);

      // Verify all session IDs are present
      const sessionIds = result.sessions.map(s => s.sessionId);
      for (let i = 0; i < 10; i++) {
        expect(sessionIds).toContain(`session-${i}`);
      }
    });
  });

  describe('error handling', () => {
    test('throws on invalid JSON in registry', async () => {
      // Create invalid JSON file
      const { writeFile } = await import('fs/promises');
      await writeFile(testRegistryPath, 'invalid json{', 'utf-8');

      await expect(registry.getRegistry()).rejects.toThrow();
    });

    test('throws on invalid registry structure', async () => {
      // Create file with wrong structure
      const { writeFile } = await import('fs/promises');
      await writeFile(
        testRegistryPath,
        JSON.stringify({ wrongField: 'value' }),
        'utf-8'
      );

      await expect(registry.getRegistry()).rejects.toThrow('Invalid registry format');
    });

    test('throws on malformed session record', async () => {
      // Create registry with invalid session
      const { writeFile } = await import('fs/promises');
      const invalidRegistry = {
        sessions: [
          {
            sessionId: 'valid-123',
            createdAt: '2024-01-01T00:00:00Z',
            projectPath: '/valid/path',
          },
          {
            sessionId: 123, // Should be string
            createdAt: '2024-01-01T00:00:00Z',
            projectPath: '/invalid/path',
          },
        ],
      };

      await writeFile(
        testRegistryPath,
        JSON.stringify(invalidRegistry),
        'utf-8'
      );

      await expect(registry.getRegistry()).rejects.toThrow('Invalid registry format');
    });
  });

  describe('file system operations', () => {
    test('persists data across registry instances', async () => {
      // Register with first instance
      await registry.register('session-123', '/test/project');

      // Create new instance with same path
      const registry2 = new SessionRegistry(testRegistryPath);
      const result = await registry2.isAyndSession('session-123');

      expect(result).toBe(true);
    });

    test('registry file is valid JSON', async () => {
      await registry.register('session-123', '/test/project');

      const content = await readFile(testRegistryPath, 'utf-8');
      const parsed = JSON.parse(content) as AyndSessionRegistry;

      expect(parsed).toHaveProperty('sessions');
      expect(Array.isArray(parsed.sessions)).toBe(true);
    });

    test('registry file has readable format', async () => {
      await registry.register('session-123', '/test/project');

      const content = await readFile(testRegistryPath, 'utf-8');

      // Check pretty-printed JSON (has newlines and indentation)
      expect(content).toContain('\n');
      expect(content).toContain('  '); // 2-space indentation
    });
  });
});
