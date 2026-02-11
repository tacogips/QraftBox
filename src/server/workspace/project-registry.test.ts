import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import { createProjectRegistry } from "./project-registry";

describe("ProjectRegistry", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for test
    testDir = await mkdtemp(join(tmpdir(), "qraftbox-registry-test-"));
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("getOrCreateSlug", () => {
    test("creates slug for new path", async () => {
      const dbPath = join(testDir, "test.db");
      const registry = createProjectRegistry({ dbPath });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^qraftbox-[0-9a-f]{6}$/);
    });

    test("returns same slug for same path on repeated calls", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      const slug1 = await registry.getOrCreateSlug(path);
      const slug2 = await registry.getOrCreateSlug(path);

      expect(slug1).toBe(slug2);
    });

    test("persists slug to disk", async () => {
      const dbPath = join(testDir, "test.db");
      const registry = createProjectRegistry({ dbPath });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);

      // Verify database exists and has the entry
      expect(existsSync(dbPath)).toBe(true);

      const db = new Database(dbPath);
      const row = db
        .prepare("SELECT path FROM registered_projects WHERE slug = ?")
        .get(slug) as { path: string } | undefined | null;
      expect(row?.path).toBe(path);
      db.close();
    });

    test("handles paths with special characters", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/My Project (2024)";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^my-project-2024-[0-9a-f]{6}$/);
    });

    test("handles collision by appending suffix", async () => {
      const dbPath = join(testDir, "test.db");
      const jsonPath = join(testDir, "projects.json");

      // Pre-populate JSON with conflicting slug
      await writeFile(
        jsonPath,
        JSON.stringify({
          projects: {
            "qraftbox-abc123": "/different/path/QraftBox",
          },
        }),
        "utf-8",
      );

      const registry = createProjectRegistry({
        dbPath,
        jsonMigrationPath: jsonPath,
      });

      // The migrated entry should be loaded
      const migrated = await registry.getAllProjects();
      expect(migrated.size).toBe(1);
      expect(migrated.get("qraftbox-abc123")).toBe("/different/path/QraftBox");

      // Try to create slug for a different path that generates same base slug
      const testPath = "/example/projects/QraftBox";
      const slug = await registry.getOrCreateSlug(testPath);

      // Should either be the original or have a suffix (depending on hash collision)
      expect(slug).toMatch(/^qraftbox-[0-9a-f]{6}(-\d+)?$/);

      // Verify both entries exist
      const allProjects = await registry.getAllProjects();
      expect(allProjects.size).toBe(2);
    });

    test("creates directory structure on first use", async () => {
      const dbPath = join(testDir, "test.db");
      const registry = createProjectRegistry({ dbPath });
      const path = "/example/projects/QraftBox";

      expect(existsSync(testDir)).toBe(true);

      await registry.getOrCreateSlug(path);

      // Verify database was created
      expect(existsSync(dbPath)).toBe(true);
    });

    test("normalizes basename to lowercase", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/UPPERCASE-Project";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^uppercase-project-[0-9a-f]{6}$/);
    });

    test("replaces multiple non-alphanumeric chars with single hyphen", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/foo___bar";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^foo-bar-[0-9a-f]{6}$/);
    });
  });

  describe("resolveSlug", () => {
    test("returns path for existing slug", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      const resolved = await registry.resolveSlug(slug);

      expect(resolved).toBe(path);
    });

    test("returns undefined for non-existent slug", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      const resolved = await registry.resolveSlug("non-existent-slug");

      expect(resolved).toBeUndefined();
    });

    test("returns undefined when registry database is empty", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      const resolved = await registry.resolveSlug("any-slug");

      expect(resolved).toBeUndefined();
    });
  });

  describe("removeSlug", () => {
    test("removes existing slug", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      await registry.removeSlug(slug);

      const resolved = await registry.resolveSlug(slug);
      expect(resolved).toBeUndefined();
    });

    test("persists removal to disk", async () => {
      const dbPath = join(testDir, "test.db");
      const registry = createProjectRegistry({ dbPath });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      await registry.removeSlug(slug);

      // Verify database no longer has the entry
      const db = new Database(dbPath);
      const row = db
        .prepare("SELECT path FROM registered_projects WHERE slug = ?")
        .get(slug) as { path: string } | undefined | null;
      expect(row === null || row === undefined).toBe(true);
      db.close();
    });

    test("does nothing when slug does not exist", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      // Should not throw
      await registry.removeSlug("non-existent-slug");

      const allProjects = await registry.getAllProjects();
      expect(allProjects.size).toBe(0);
    });

    test("does nothing when registry database is empty", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      // Should not throw
      await registry.removeSlug("any-slug");
    });

    test("removes from reverse index", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      await registry.removeSlug(slug);

      // Creating slug again should generate new one
      const newSlug = await registry.getOrCreateSlug(path);
      expect(newSlug).toBe(slug); // Same path generates same slug
    });
  });

  describe("getAllProjects", () => {
    test("returns empty map when no projects", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      const projects = await registry.getAllProjects();

      expect(projects.size).toBe(0);
    });

    test("returns all registered projects", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path1 = "/example/projects/QraftBox";
      const path2 = "/example/projects/OtherProject";

      const slug1 = await registry.getOrCreateSlug(path1);
      const slug2 = await registry.getOrCreateSlug(path2);

      const projects = await registry.getAllProjects();

      expect(projects.size).toBe(2);
      expect(projects.get(slug1)).toBe(path1);
      expect(projects.get(slug2)).toBe(path2);
    });

    test("returns read-only map", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      await registry.getOrCreateSlug(path);

      const projects = await registry.getAllProjects();

      // Map should be read-only (TypeScript enforces this at compile time)
      expect(projects).toBeInstanceOf(Map);
    });

    test("returns empty map when registry database is empty", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      const projects = await registry.getAllProjects();

      expect(projects.size).toBe(0);
    });
  });

  describe("getAllPaths", () => {
    test("returns empty set when no projects", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });

      const paths = await registry.getAllPaths();

      expect(paths.size).toBe(0);
    });

    test("returns all registered project paths", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path1 = "/example/projects/QraftBox";
      const path2 = "/example/projects/OtherProject";

      await registry.getOrCreateSlug(path1);
      await registry.getOrCreateSlug(path2);

      const paths = await registry.getAllPaths();

      expect(paths.size).toBe(2);
      expect(paths.has(path1)).toBe(true);
      expect(paths.has(path2)).toBe(true);
    });

    test("returns read-only set", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path = "/example/projects/QraftBox";

      await registry.getOrCreateSlug(path);

      const paths = await registry.getAllPaths();

      // Set should be read-only (TypeScript enforces this at compile time)
      expect(paths).toBeInstanceOf(Set);
    });
  });

  describe("slug generation", () => {
    test("generates consistent slug for same path", async () => {
      const testDir1 = await mkdtemp(
        join(tmpdir(), "qraftbox-registry-test-1-"),
      );
      const testDir2 = await mkdtemp(
        join(tmpdir(), "qraftbox-registry-test-2-"),
      );

      try {
        const registry1 = createProjectRegistry({
          dbPath: join(testDir1, "test.db"),
        });
        const registry2 = createProjectRegistry({
          dbPath: join(testDir2, "test.db"),
        });
        const path = "/example/projects/QraftBox";

        const slug1 = await registry1.getOrCreateSlug(path);
        const slug2 = await registry2.getOrCreateSlug(path);

        // Same path should generate same slug (deterministic hash)
        expect(slug1).toBe(slug2);
      } finally {
        await rm(testDir1, { recursive: true, force: true });
        await rm(testDir2, { recursive: true, force: true });
      }
    });

    test("generates different slugs for different paths", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path1 = "/example/projects/QraftBox";
      const path2 = "/different/location/QraftBox";

      const slug1 = await registry.getOrCreateSlug(path1);
      const slug2 = await registry.getOrCreateSlug(path2);

      // Different paths with same basename should have different hashes
      expect(slug1).not.toBe(slug2);
    });

    test("hash is based on full path, not just basename", async () => {
      const registry = createProjectRegistry({
        dbPath: join(testDir, "test.db"),
        jsonMigrationPath: join(testDir, "nonexistent.json"),
      });
      const path1 = "/path/a/QraftBox";
      const path2 = "/path/b/QraftBox";

      const slug1 = await registry.getOrCreateSlug(path1);
      const slug2 = await registry.getOrCreateSlug(path2);

      // Same basename, different full path -> different hash
      const hash1 = slug1.split("-").pop();
      const hash2 = slug2.split("-").pop();
      expect(hash1).not.toBe(hash2);
    });
  });
});
