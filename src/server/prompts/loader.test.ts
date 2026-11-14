/**
 * Tests for Prompt Template Loader
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadPrompts,
  loadPromptContent,
  getDefaultPromptId,
  setDefaultPromptId,
} from "./loader";
import type { PromptTemplate } from "../../types/prompt-config";

/**
 * Test fixture directory setup
 */
async function setupTestDir(): Promise<string> {
  const testDir = join(tmpdir(), `qraftbox-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Cleanup test directory
 */
async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

/**
 * Create a test prompt template file
 */
async function createTestTemplate(
  dir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  template: string,
): Promise<void> {
  const yamlLines: string[] = [];

  // Convert frontmatter to YAML
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string") {
      yamlLines.push(`${key}: ${value}`);
    } else if (typeof value === "boolean") {
      yamlLines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          yamlLines.push(`  -`);
          for (const [itemKey, itemValue] of Object.entries(item)) {
            yamlLines.push(`    ${itemKey}: ${itemValue}`);
          }
        } else {
          yamlLines.push(`  - ${item}`);
        }
      }
    }
  }

  const content = `---
${yamlLines.join("\n")}
---

${template}`;

  await writeFile(join(dir, filename), content, "utf-8");
}

describe("loadPrompts", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }
    await cleanupTestDir(testDir);
  });

  test("should return empty array for non-existent directory", async () => {
    const nonExistentDir = join(testDir, "does-not-exist");
    const templates = await loadPrompts(nonExistentDir);
    expect(templates).toEqual([]);
  });

  test("should return empty array for empty directory", async () => {
    const templates = await loadPrompts(testDir);
    expect(templates).toEqual([]);
  });

  test("should load single commit template", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Default Commit",
        description: "Default commit message template",
      },
      "Generate a commit message for: {{files}}",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);

    const template = templates[0];
    expect(template).toBeDefined();
    if (template !== undefined) {
      expect(template.id).toBe("commit");
      expect(template.name).toBe("Default Commit");
      expect(template.description).toBe("Default commit message template");
      expect(template.category).toBe("commit");
      expect(template.isBuiltin).toBe(false);
      expect(template.path).toBe(join(testDir, "commit.md"));
    }
  });

  test("should load multiple templates from different categories", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Commit Template" },
      "Commit: {{message}}",
    );

    await createTestTemplate(
      testDir,
      "push.md",
      { name: "Push Template" },
      "Push: {{branch}}",
    );

    await createTestTemplate(
      testDir,
      "pr.md",
      { name: "PR Template" },
      "PR: {{title}}",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(3);

    const categories = templates.map((t) => t.category).sort();
    expect(categories).toEqual(["commit", "pr", "push"]);
  });

  test("should load template variants with same category", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Default Commit" },
      "Default commit",
    );

    await createTestTemplate(
      testDir,
      "commit-conventional.md",
      { name: "Conventional Commit" },
      "Conventional commit",
    );

    await createTestTemplate(
      testDir,
      "commit-detailed.md",
      { name: "Detailed Commit" },
      "Detailed commit",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(3);

    const commitTemplates = templates.filter((t) => t.category === "commit");
    expect(commitTemplates).toHaveLength(3);

    const ids = commitTemplates.map((t) => t.id).sort();
    expect(ids).toEqual(["commit", "commit-conventional", "commit-detailed"]);
  });

  test("should skip non-markdown files", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Commit" },
      "Template",
    );

    await writeFile(join(testDir, "readme.txt"), "Not a template", "utf-8");
    await writeFile(join(testDir, "config.json"), "{}", "utf-8");

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
  });

  test("should skip files without valid category", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Valid" },
      "Template",
    );

    await createTestTemplate(
      testDir,
      "invalid.md",
      { name: "Invalid" },
      "Template",
    );

    await createTestTemplate(
      testDir,
      "unknown-category.md",
      { name: "Unknown" },
      "Template",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.id).toBe("commit");
  });

  test("should skip files with invalid frontmatter", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Valid" },
      "Template",
    );

    // File without frontmatter
    await writeFile(join(testDir, "push.md"), "No frontmatter here", "utf-8");

    // File with missing name
    await writeFile(
      join(testDir, "pr.md"),
      "---\ndescription: Missing name\n---\nTemplate",
      "utf-8",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.id).toBe("commit");
  });

  test("should parse frontmatter with all optional fields", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Full Template",
        description: "A complete template",
        author: "Test Author",
        version: "1.0.0",
      },
      "Template content",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);

    const template = templates[0];
    expect(template).toBeDefined();
    if (template !== undefined) {
      expect(template.name).toBe("Full Template");
      expect(template.description).toBe("A complete template");
    }
  });

  test("should parse frontmatter with variables", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Template with Variables",
        variables: [
          {
            name: "message",
            description: "Commit message",
            required: true,
          },
          {
            name: "author",
            description: "Commit author",
            required: false,
            default: "Unknown",
          },
        ],
      },
      "Message: {{message}}, Author: {{author}}",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
  });

  test("should mark template as default when set in config", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Default" },
      "Template",
    );

    await createTestTemplate(
      testDir,
      "commit-custom.md",
      { name: "Custom" },
      "Custom template",
    );

    // Set default
    await setDefaultPromptId("commit", "commit-custom");

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(2);

    const defaultTemplate = templates.find((t) => t.isDefault);
    expect(defaultTemplate).toBeDefined();
    if (defaultTemplate !== undefined) {
      expect(defaultTemplate.id).toBe("commit-custom");
    }

    const nonDefaultTemplate = templates.find((t) => !t.isDefault);
    expect(nonDefaultTemplate).toBeDefined();
    if (nonDefaultTemplate !== undefined) {
      expect(nonDefaultTemplate.id).toBe("commit");
    }
  });

  test("should use default config directory when not specified", async () => {
    // This test checks that the function doesn't throw
    // It will return empty array if ~/.config/qraftbox/prompts/ doesn't exist
    const templates = await loadPrompts();
    expect(Array.isArray(templates)).toBe(true);
  });
});

describe("loadPromptContent", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }
    await cleanupTestDir(testDir);
  });

  test("should load template content and frontmatter", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Test Template",
        description: "Test description",
      },
      "Generate commit message for:\n{{files}}",
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);

      expect(content.frontmatter.name).toBe("Test Template");
      expect(content.frontmatter.description).toBe("Test description");
      expect(content.template).toContain("Generate commit message for:");
      expect(content.template).toContain("{{files}}");
    }
  });

  test("should load template with variables", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Variable Template",
        variables: [
          {
            name: "files",
            description: "List of files",
            required: true,
          },
          {
            name: "diff",
            description: "Diff content",
            required: false,
            default: "",
          },
        ],
      },
      "Files: {{files}}\nDiff: {{diff}}",
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);

      expect(content.frontmatter.variables).toBeDefined();
      expect(content.frontmatter.variables).toHaveLength(2);

      const variables = content.frontmatter.variables;
      if (variables !== undefined) {
        const filesVar = variables[0];
        expect(filesVar).toBeDefined();
        if (filesVar !== undefined) {
          expect(filesVar.name).toBe("files");
          expect(filesVar.required).toBe(true);
        }

        const diffVar = variables[1];
        expect(diffVar).toBeDefined();
        if (diffVar !== undefined) {
          expect(diffVar.name).toBe("diff");
          expect(diffVar.required).toBe(false);
          expect(diffVar.default).toBe("");
        }
      }
    }
  });

  test("should throw error for non-existent file", async () => {
    const fakeTemplate: PromptTemplate = {
      id: "fake",
      name: "Fake",
      description: "",
      path: join(testDir, "does-not-exist.md"),
      category: "commit",
      isBuiltin: false,
      isDefault: false,
    };

    await expect(loadPromptContent(fakeTemplate)).rejects.toThrow(
      "Failed to read template file",
    );
  });

  test("should throw error for invalid frontmatter", async () => {
    await writeFile(
      join(testDir, "invalid.md"),
      "Not valid frontmatter",
      "utf-8",
    );

    const invalidTemplate: PromptTemplate = {
      id: "invalid",
      name: "Invalid",
      description: "",
      path: join(testDir, "invalid.md"),
      category: "commit",
      isBuiltin: false,
      isDefault: false,
    };

    await expect(loadPromptContent(invalidTemplate)).rejects.toThrow(
      "Invalid frontmatter",
    );
  });

  test("should parse multiline template content", async () => {
    const multilineTemplate = `Line 1
Line 2
Line 3

Line 5 with blank line above`;

    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Multiline" },
      multilineTemplate,
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);
      expect(content.template).toBe(multilineTemplate);
    }
  });
});

describe("getDefaultPromptId", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });

    // Override config directory for testing
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }

    await cleanupTestDir(testDir);
  });

  test("should return hardcoded default when no default is set", async () => {
    const defaultId = await getDefaultPromptId("commit");
    expect(defaultId).toBe("commit");
  });

  test("should return default ID when set", async () => {
    await setDefaultPromptId("commit", "commit-custom");
    const defaultId = await getDefaultPromptId("commit");
    expect(defaultId).toBe("commit-custom");
  });

  test("should return hardcoded default for category without explicit default", async () => {
    await setDefaultPromptId("commit", "commit-custom");

    const pushDefaultId = await getDefaultPromptId("push");
    expect(pushDefaultId).toBe("push");
  });

  test("should handle multiple categories", async () => {
    await setDefaultPromptId("commit", "commit-custom");
    await setDefaultPromptId("push", "push-safe");
    await setDefaultPromptId("pr", "pr-detailed");

    const commitId = await getDefaultPromptId("commit");
    const pushId = await getDefaultPromptId("push");
    const prId = await getDefaultPromptId("pr");

    expect(commitId).toBe("commit-custom");
    expect(pushId).toBe("push-safe");
    expect(prId).toBe("pr-detailed");
  });
});

describe("setDefaultPromptId", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });

    // Override config directory for testing
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }

    await cleanupTestDir(testDir);
  });

  test("should set default prompt ID", async () => {
    await setDefaultPromptId("commit", "commit-conventional");

    const defaultId = await getDefaultPromptId("commit");
    expect(defaultId).toBe("commit-conventional");
  });

  test("should overwrite existing default", async () => {
    await setDefaultPromptId("commit", "commit-default");
    await setDefaultPromptId("commit", "commit-custom");

    const defaultId = await getDefaultPromptId("commit");
    expect(defaultId).toBe("commit-custom");
  });

  test("should preserve other category defaults", async () => {
    await setDefaultPromptId("commit", "commit-custom");
    await setDefaultPromptId("push", "push-safe");
    await setDefaultPromptId("commit", "commit-new");

    const commitId = await getDefaultPromptId("commit");
    const pushId = await getDefaultPromptId("push");

    expect(commitId).toBe("commit-new");
    expect(pushId).toBe("push-safe");
  });

  test("should create config directory if it doesn't exist", async () => {
    // Remove config directory
    await rm(configDir, { recursive: true, force: true });

    await setDefaultPromptId("commit", "commit-custom");

    const defaultId = await getDefaultPromptId("commit");
    expect(defaultId).toBe("commit-custom");
  });

  test("should persist defaults across function calls", async () => {
    await setDefaultPromptId("commit", "commit-1");

    // Simulate app restart by calling get without set
    const defaultId1 = await getDefaultPromptId("commit");
    expect(defaultId1).toBe("commit-1");

    await setDefaultPromptId("push", "push-2");

    const defaultId2 = await getDefaultPromptId("commit");
    const pushId = await getDefaultPromptId("push");

    expect(defaultId2).toBe("commit-1");
    expect(pushId).toBe("push-2");
  });
});

describe("YAML parsing", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }
    await cleanupTestDir(testDir);
  });

  test("should parse boolean values", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Boolean Test",
        enabled: true,
        disabled: false,
      },
      "Template",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
  });

  test("should parse quoted strings", async () => {
    await writeFile(
      join(testDir, "commit.md"),
      '---\nname: "Quoted String"\n---\nTemplate',
      "utf-8",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
    expect(templates[0]?.name).toBe("Quoted String");
  });

  test("should handle empty arrays", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Empty Array",
        variables: [],
      },
      "Template",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
  });

  test("should handle nested objects in arrays", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Nested Objects",
        variables: [
          {
            name: "var1",
            description: "Variable 1",
            required: true,
          },
          {
            name: "var2",
            description: "Variable 2",
            required: false,
          },
        ],
      },
      "Template",
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);
      expect(content.frontmatter.variables).toBeDefined();
      expect(content.frontmatter.variables).toHaveLength(2);
    }
  });
});

describe("Edge cases", () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    testDir = await setupTestDir();
    configDir = join(testDir, ".config", "qraftbox");
    await mkdir(configDir, { recursive: true });
    originalEnv = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    process.env["QRAFTBOX_TEST_CONFIG_DIR"] = configDir;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env["QRAFTBOX_TEST_CONFIG_DIR"] = originalEnv;
    } else {
      delete process.env["QRAFTBOX_TEST_CONFIG_DIR"];
    }
    await cleanupTestDir(testDir);
  });

  test("should handle template with only frontmatter", async () => {
    await writeFile(
      join(testDir, "commit.md"),
      "---\nname: Empty Template\n---\n",
      "utf-8",
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);
      expect(content.template).toBe("");
    }
  });

  test("should handle template with whitespace in frontmatter", async () => {
    await writeFile(
      join(testDir, "commit.md"),
      "---\nname:   Whitespace Test   \n---\nTemplate",
      "utf-8",
    );

    const templates = await loadPrompts(testDir);
    expect(templates).toHaveLength(1);
  });

  test("should handle template with special characters", async () => {
    await createTestTemplate(
      testDir,
      "commit.md",
      {
        name: "Special: {{chars}} & more!",
      },
      "Template with special: {{variable}} & {{another}}",
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);
      expect(content.template).toContain("{{variable}}");
      expect(content.template).toContain("{{another}}");
    }
  });

  test("should handle very long template content", async () => {
    const longContent = "Line\n".repeat(1000).trimEnd();

    await createTestTemplate(
      testDir,
      "commit.md",
      { name: "Long Template" },
      longContent,
    );

    const templates = await loadPrompts(testDir);
    const template = templates[0];
    expect(template).toBeDefined();

    if (template !== undefined) {
      const content = await loadPromptContent(template);
      expect(content.template).toBe(longContent);
    }
  });
});
