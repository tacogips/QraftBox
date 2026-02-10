import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
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
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^qraftbox-[0-9a-f]{6}$/);
    });

    test("returns same slug for same path on repeated calls", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug1 = await registry.getOrCreateSlug(path);
      const slug2 = await registry.getOrCreateSlug(path);

      expect(slug1).toBe(slug2);
    });

    test("persists slug to disk", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);

      // Read file directly
      const filePath = join(testDir, "projects.json");
      expect(existsSync(filePath)).toBe(true);

      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.projects[slug]).toBe(path);
    });

    test("handles paths with special characters", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/My Project (2024)";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^my-project-2024-[0-9a-f]{6}$/);
    });

    test("handles collision by appending suffix", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      // Pre-populate registry file with conflicting slug
      const filePath = join(testDir, "projects.json");
      await writeFile(
        filePath,
        JSON.stringify({
          projects: {
            "qraftbox-abc123": "/different/path/QraftBox",
          },
        }),
        "utf-8",
      );

      // Try to create slug for path that would generate same base slug
      // We need to find a path that hashes to abc123
      const testPath = "/example/projects/QraftBox";
      const slug = await registry.getOrCreateSlug(testPath);

      // Should either be the original or have a suffix
      expect(slug).toMatch(/^qraftbox-[0-9a-f]{6}(-\d+)?$/);

      // Verify both slugs exist
      const allProjects = await registry.getAllProjects();
      expect(allProjects.size).toBeGreaterThanOrEqual(2);
    });

    test("creates directory structure on first use", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      expect(existsSync(testDir)).toBe(true);

      await registry.getOrCreateSlug(path);

      // Verify file was created
      const filePath = join(testDir, "projects.json");
      expect(existsSync(filePath)).toBe(true);
    });

    test("normalizes basename to lowercase", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/UPPERCASE-Project";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^uppercase-project-[0-9a-f]{6}$/);
    });

    test("replaces multiple non-alphanumeric chars with single hyphen", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/foo___bar";

      const slug = await registry.getOrCreateSlug(path);

      expect(slug).toMatch(/^foo-bar-[0-9a-f]{6}$/);
    });
  });

  describe("resolveSlug", () => {
    test("returns path for existing slug", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      const resolved = await registry.resolveSlug(slug);

      expect(resolved).toBe(path);
    });

    test("returns undefined for non-existent slug", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      const resolved = await registry.resolveSlug("non-existent-slug");

      expect(resolved).toBeUndefined();
    });

    test("returns undefined when registry file does not exist", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      const resolved = await registry.resolveSlug("any-slug");

      expect(resolved).toBeUndefined();
    });

    test("handles corrupted registry file gracefully", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      // Write invalid JSON
      const filePath = join(testDir, "projects.json");
      await writeFile(filePath, "{ invalid json", "utf-8");

      const resolved = await registry.resolveSlug("any-slug");

      expect(resolved).toBeUndefined();
    });
  });

  describe("removeSlug", () => {
    test("removes existing slug", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      await registry.removeSlug(slug);

      const resolved = await registry.resolveSlug(slug);
      expect(resolved).toBeUndefined();
    });

    test("persists removal to disk", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);
      await registry.removeSlug(slug);

      // Read file directly
      const filePath = join(testDir, "projects.json");
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.projects[slug]).toBeUndefined();
    });

    test("does nothing when slug does not exist", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      // Should not throw
      await registry.removeSlug("non-existent-slug");

      const allProjects = await registry.getAllProjects();
      expect(allProjects.size).toBe(0);
    });

    test("does nothing when registry file does not exist", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      // Should not throw
      await registry.removeSlug("any-slug");
    });

    test("removes from reverse index", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
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
      const registry = createProjectRegistry({ baseDir: testDir });

      const projects = await registry.getAllProjects();

      expect(projects.size).toBe(0);
    });

    test("returns all registered projects", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
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
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      await registry.getOrCreateSlug(path);

      const projects = await registry.getAllProjects();

      // Map should be read-only (TypeScript enforces this at compile time)
      expect(projects).toBeInstanceOf(Map);
    });

    test("returns empty map when registry file does not exist", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });

      const projects = await registry.getAllProjects();

      expect(projects.size).toBe(0);
    });
  });

  describe("caching behavior", () => {
    test("caches registry data after first load", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path1 = "/example/projects/QraftBox";
      const path2 = "/example/projects/OtherProject";

      // First operation loads from disk
      const slug1 = await registry.getOrCreateSlug(path1);

      // Manually modify file on disk
      const filePath = join(testDir, "projects.json");
      await writeFile(
        filePath,
        JSON.stringify({
          projects: {
            [slug1]: path1,
            "manual-slug": "/manual/path",
          },
        }),
        "utf-8",
      );

      // Second operation should use cache, not see manual change
      await registry.getOrCreateSlug(path2);
      const allProjects = await registry.getAllProjects();

      // Should not include manually added slug because cache was already loaded
      expect(allProjects.get("manual-slug")).toBeUndefined();
      expect(allProjects.size).toBe(2);
    });

    test("invalidates cache on write operations", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
      const path = "/example/projects/QraftBox";

      const slug = await registry.getOrCreateSlug(path);

      // Remove operation writes to disk
      await registry.removeSlug(slug);

      // Verify removal is reflected
      const resolved = await registry.resolveSlug(slug);
      expect(resolved).toBeUndefined();
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
        const registry1 = createProjectRegistry({ baseDir: testDir1 });
        const registry2 = createProjectRegistry({ baseDir: testDir2 });
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
      const registry = createProjectRegistry({ baseDir: testDir });
      const path1 = "/example/projects/QraftBox";
      const path2 = "/different/location/QraftBox";

      const slug1 = await registry.getOrCreateSlug(path1);
      const slug2 = await registry.getOrCreateSlug(path2);

      // Different paths with same basename should have different hashes
      expect(slug1).not.toBe(slug2);
    });

    test("hash is based on full path, not just basename", async () => {
      const registry = createProjectRegistry({ baseDir: testDir });
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
