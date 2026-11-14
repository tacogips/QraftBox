/**
 * Tests for Prompt Template API Routes
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createPromptRoutes } from "./prompts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a test config directory with sample templates
 */
async function createTestConfigDir(): Promise<string> {
  const testDir = await mkdtemp(join(tmpdir(), "qraftbox-test-"));

  // Create a sample user template
  const commitTemplate = `---
name: Custom Commit
description: User custom commit template
author: test-user
version: "1.0.0"
variables:
  - name: diff
    description: Git diff
    required: true
---

Custom commit template content
{{diff}}`;

  await writeFile(join(testDir, "commit-custom.md"), commitTemplate);

  // Create a template that overrides a builtin
  const overrideTemplate = `---
name: Override Builtin Commit
description: Overrides the builtin commit template
author: test-user
version: "2.0.0"
---

Override builtin template
This should take precedence over the builtin template.`;

  await writeFile(join(testDir, "commit.md"), overrideTemplate);

  // Create templates for other categories
  const pushTemplate = `---
name: Custom Push
description: User custom push template
---

Custom push template`;

  await writeFile(join(testDir, "push-custom.md"), pushTemplate);

  const prTemplate = `---
name: Custom PR
description: User custom PR template
---

Custom PR template`;

  await writeFile(join(testDir, "pr-custom.md"), prTemplate);

  return testDir;
}

/**
 * Create defaults.json file for testing
 */
async function createDefaultsConfig(
  testDir: string,
  defaults: Record<string, string>,
): Promise<void> {
  const configFile = join(testDir, "defaults.json");
  await writeFile(configFile, JSON.stringify(defaults, null, 2));
}

describe("Prompt Routes", () => {
  let testConfigDir: string;
  let app: ReturnType<typeof createPromptRoutes>;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testConfigDir = await createTestConfigDir();
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = testConfigDir;
    app = createPromptRoutes(testConfigDir);
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }
    // Cleanup test directory
    try {
      await rm(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe("GET /api/prompts", () => {
    test("returns all templates (builtin + user)", async () => {
      const response = await app.request("/");

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        prompts: Array<{ id: string; name: string; isBuiltin: boolean }>;
      };
      expect(data.prompts).toBeDefined();
      expect(Array.isArray(data.prompts)).toBe(true);

      // Should have builtin templates
      const builtinCommit = data.prompts.find((p) => p.id === "commit");
      expect(builtinCommit).toBeDefined();

      // User template "commit" should override builtin
      if (builtinCommit !== undefined) {
        expect(builtinCommit.name).toBe("Override Builtin Commit");
      }

      // Should have user templates
      const customCommit = data.prompts.find((p) => p.id === "commit-custom");
      expect(customCommit).toBeDefined();
      expect(customCommit?.isBuiltin).toBe(false);
    });

    test("filters by category when provided", async () => {
      const response = await app.request("/?category=commit");

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        prompts: Array<{ id: string; category: string }>;
      };
      expect(data.prompts).toBeDefined();

      // All returned templates should be commit category
      for (const template of data.prompts) {
        expect(template.category).toBe("commit");
      }
    });

    test("returns 400 for invalid category", async () => {
      const response = await app.request("/?category=invalid");

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Invalid category");
    });

    test("handles empty user template directory gracefully", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "qraftbox-empty-"));

      const emptyApp = createPromptRoutes(emptyDir);
      const response = await emptyApp.request("/");

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        prompts: Array<{ isBuiltin: boolean }>;
      };
      expect(data.prompts).toBeDefined();

      // Should only have builtin templates
      const allBuiltin = data.prompts.every((p) => p.isBuiltin);
      expect(allBuiltin).toBe(true);

      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe("GET /api/prompts/:id", () => {
    test("returns builtin template content", async () => {
      const response = await app.request("/commit");

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        content: { template: string; frontmatter: { name: string } };
      };
      expect(data.content).toBeDefined();
      expect(data.content.template).toBeDefined();
      expect(data.content.frontmatter).toBeDefined();

      // This should be the user override, not the builtin
      expect(data.content.frontmatter.name).toBe("Override Builtin Commit");
    });

    test("returns user template content", async () => {
      const response = await app.request("/commit-custom");

      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        content: { template: string; frontmatter: { name: string } };
      };
      expect(data.content).toBeDefined();
      expect(data.content.frontmatter.name).toBe("Custom Commit");
      expect(data.content.template).toContain("Custom commit template content");
    });

    test("returns 404 for non-existent template", async () => {
      const response = await app.request("/nonexistent");

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("not found");
    });

    test("returns 400 for invalid template ID format", async () => {
      const response = await app.request("/invalid@template!");

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Prompt ID must contain only");
    });
  });

  describe("GET /api/prompts/default/:category", () => {
    afterEach(async () => {
      // Clean up defaults file
      try {
        await rm(join(testConfigDir, "defaults.json"), { force: true });
      } catch {
        // Ignore errors
      }
    });

    test("returns null when no default is set", async () => {
      const response = await app.request("/default/commit");

      expect(response.status).toBe(200);

      const data = (await response.json()) as { defaultId: string | null };
      expect(data.defaultId).toBeNull();
    });

    test("returns default ID when set", async () => {
      // Set a default
      await createDefaultsConfig(testConfigDir, {
        commit: "commit-custom",
      });

      const response = await app.request("/default/commit");

      expect(response.status).toBe(200);

      const data = (await response.json()) as { defaultId: string | null };
      expect(data.defaultId).toBe("commit-custom");
    });

    test("returns 400 for invalid category", async () => {
      const response = await app.request("/default/invalid");

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Invalid category");
    });
  });

  describe("PUT /api/prompts/default/:category", () => {
    test("sets default prompt for category", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "commit-custom" }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);

      // Verify default was set
      const getResponse = await app.request("/default/commit");
      const getData = (await getResponse.json()) as {
        defaultId: string | null;
      };
      expect(getData.defaultId).toBe("commit-custom");
    });

    test("allows setting builtin template as default", async () => {
      const response = await app.request("/default/push", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "push" }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    test("returns 400 for invalid category", async () => {
      const response = await app.request("/default/invalid", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "commit" }),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Invalid category");
    });

    test("returns 400 for missing request body", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Missing required field: id");
    });

    test("returns 400 for invalid template ID format", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "invalid@id!" }),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Prompt ID must contain only");
    });

    test("returns 404 for non-existent template", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent" }),
      });

      expect(response.status).toBe(404);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("not found");
    });

    test("returns 400 for invalid JSON", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "invalid json{",
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Invalid JSON");
    });

    test("returns 400 for empty id", async () => {
      const response = await app.request("/default/commit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "" }),
      });

      expect(response.status).toBe(400);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBeDefined();
      expect(data.error).toContain("non-empty string");
    });
  });

  describe("Template Override Behavior", () => {
    test("user template overrides builtin template with same ID", async () => {
      // Get list of all prompts
      const listResponse = await app.request("/");
      const listData = (await listResponse.json()) as {
        prompts: Array<{ id: string; name: string; isBuiltin: boolean }>;
      };

      // Find the commit template (should be user override, not builtin)
      const commitTemplate = listData.prompts.find((p) => p.id === "commit");
      expect(commitTemplate).toBeDefined();
      expect(commitTemplate?.name).toBe("Override Builtin Commit");
      expect(commitTemplate?.isBuiltin).toBe(false);

      // Get content - should be the override content
      const contentResponse = await app.request("/commit");
      const contentData = (await contentResponse.json()) as {
        content: { template: string; frontmatter: { name: string } };
      };

      expect(contentData.content.frontmatter.name).toBe(
        "Override Builtin Commit",
      );
      expect(contentData.content.template).toContain(
        "Override builtin template",
      );
    });

    test("builtin templates are available when not overridden", async () => {
      const listResponse = await app.request("/");
      const listData = (await listResponse.json()) as {
        prompts: Array<{ id: string; isBuiltin: boolean }>;
      };

      // Push template should be builtin (not overridden by user)
      const pushTemplate = listData.prompts.find((p) => p.id === "push");
      expect(pushTemplate).toBeDefined();
      expect(pushTemplate?.isBuiltin).toBe(true);

      // PR template should be builtin (not overridden by user)
      const prTemplate = listData.prompts.find((p) => p.id === "pr");
      expect(prTemplate).toBeDefined();
      expect(prTemplate?.isBuiltin).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("handles corrupted template files gracefully", async () => {
      // Create a corrupted template file
      const corruptedDir = join(tmpdir(), `qraftbox-corrupt-${Date.now()}`);
      await mkdir(corruptedDir, { recursive: true });
      await writeFile(
        join(corruptedDir, "commit-corrupt.md"),
        "invalid content",
      );

      const corruptApp = createPromptRoutes(corruptedDir);

      // Should still return successfully (skipping corrupted file)
      const response = await corruptApp.request("/");
      expect(response.status).toBe(200);

      await rm(corruptedDir, { recursive: true, force: true });
    });

    test("handles non-existent config directory", async () => {
      const nonExistentDir = join(tmpdir(), "nonexistent-dir-123456789");
      const nonExistentApp = createPromptRoutes(nonExistentDir);

      const response = await nonExistentApp.request("/");
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        prompts: Array<{ isBuiltin: boolean }>;
      };
      expect(data.prompts).toBeDefined();

      // Should have only builtin templates
      const allBuiltin = data.prompts.every((p) => p.isBuiltin);
      expect(allBuiltin).toBe(true);
    });
  });
});
