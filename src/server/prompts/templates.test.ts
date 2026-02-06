/**
 * Unit tests for built-in prompt templates
 */

import { describe, test, expect } from "bun:test";
import {
  getBuiltinTemplates,
  getBuiltinTemplateContent,
  isBuiltinTemplateId,
  getDefaultTemplateId,
} from "./templates";

describe("getBuiltinTemplates", () => {
  test("returns all built-in templates", () => {
    const templates = getBuiltinTemplates();

    expect(templates.length).toBe(8);
    expect(templates.every((t) => t.isBuiltin)).toBe(true);
  });

  test("includes commit templates", () => {
    const templates = getBuiltinTemplates();
    const commitTemplates = templates.filter((t) => t.category === "commit");

    expect(commitTemplates.length).toBe(4);
    expect(commitTemplates.map((t) => t.id)).toContain("commit");
    expect(commitTemplates.map((t) => t.id)).toContain("commit-conventional");
    expect(commitTemplates.map((t) => t.id)).toContain("commit-detailed");
    expect(commitTemplates.map((t) => t.id)).toContain("commit-minimal");
  });

  test("includes push templates", () => {
    const templates = getBuiltinTemplates();
    const pushTemplates = templates.filter((t) => t.category === "push");

    expect(pushTemplates.length).toBe(2);
    expect(pushTemplates.map((t) => t.id)).toContain("push");
    expect(pushTemplates.map((t) => t.id)).toContain("push-force");
  });

  test("includes PR templates", () => {
    const templates = getBuiltinTemplates();
    const prTemplates = templates.filter((t) => t.category === "pr");

    expect(prTemplates.length).toBe(2);
    expect(prTemplates.map((t) => t.id)).toContain("pr");
    expect(prTemplates.map((t) => t.id)).toContain("pr-detailed");
  });

  test("marks default templates correctly", () => {
    const templates = getBuiltinTemplates();

    const commitDefault = templates.find(
      (t) => t.category === "commit" && t.isDefault,
    );
    const pushDefault = templates.find(
      (t) => t.category === "push" && t.isDefault,
    );
    const prDefault = templates.find((t) => t.category === "pr" && t.isDefault);

    expect(commitDefault?.id).toBe("commit");
    expect(pushDefault?.id).toBe("push");
    expect(prDefault?.id).toBe("pr");
  });

  test("has virtual paths for all templates", () => {
    const templates = getBuiltinTemplates();

    templates.forEach((t) => {
      expect(t.path).toBe(`builtin:${t.id}`);
    });
  });
});

describe("getBuiltinTemplateContent", () => {
  test("returns content for commit template", () => {
    const content = getBuiltinTemplateContent("commit");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Standard Commit");
    expect(content.frontmatter.variables).toBeTruthy();
  });

  test("returns content for commit-conventional template", () => {
    const content = getBuiltinTemplateContent("commit-conventional");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Conventional Commits");
  });

  test("returns content for commit-detailed template", () => {
    const content = getBuiltinTemplateContent("commit-detailed");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Detailed Commit");
  });

  test("returns content for commit-minimal template", () => {
    const content = getBuiltinTemplateContent("commit-minimal");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Minimal Commit");
  });

  test("returns content for push template", () => {
    const content = getBuiltinTemplateContent("push");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Standard Push");
  });

  test("returns content for push-force template", () => {
    const content = getBuiltinTemplateContent("push-force");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Force Push with Warnings");
  });

  test("returns content for pr template", () => {
    const content = getBuiltinTemplateContent("pr");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Standard PR");
  });

  test("returns content for pr-detailed template", () => {
    const content = getBuiltinTemplateContent("pr-detailed");

    expect(content.template).toBeTruthy();
    expect(content.frontmatter.name).toBe("Detailed PR");
  });

  test("throws error for unknown template ID", () => {
    expect(() => getBuiltinTemplateContent("unknown")).toThrow(
      "Built-in template not found: unknown",
    );
  });

  test("parses frontmatter correctly", () => {
    const content = getBuiltinTemplateContent("commit");

    expect(content.frontmatter.name).toBe("Standard Commit");
    expect(content.frontmatter.description).toBe(
      "Standard commit message with context",
    );
    expect(content.frontmatter.version).toBe("1.0.0");
    expect(content.frontmatter.author).toBe("aynd");
  });

  test("parses variables from frontmatter", () => {
    const content = getBuiltinTemplateContent("commit");
    const variables = content.frontmatter.variables;

    expect(variables).toBeTruthy();
    expect(variables?.length).toBeGreaterThan(0);

    const stagedFilesVar = variables?.find((v) => v.name === "stagedFiles");
    expect(stagedFilesVar).toBeTruthy();
    expect(stagedFilesVar?.required).toBe(true);
    expect(stagedFilesVar?.description).toBe("List of staged files");
  });

  test("template content does not include frontmatter", () => {
    const content = getBuiltinTemplateContent("commit");

    expect(content.template).not.toContain("---");
    expect(content.template).toContain(
      "You are a professional software developer",
    );
  });
});

describe("isBuiltinTemplateId", () => {
  test("returns true for commit template", () => {
    expect(isBuiltinTemplateId("commit")).toBe(true);
  });

  test("returns true for commit-conventional template", () => {
    expect(isBuiltinTemplateId("commit-conventional")).toBe(true);
  });

  test("returns true for commit-detailed template", () => {
    expect(isBuiltinTemplateId("commit-detailed")).toBe(true);
  });

  test("returns true for commit-minimal template", () => {
    expect(isBuiltinTemplateId("commit-minimal")).toBe(true);
  });

  test("returns true for push template", () => {
    expect(isBuiltinTemplateId("push")).toBe(true);
  });

  test("returns true for push-force template", () => {
    expect(isBuiltinTemplateId("push-force")).toBe(true);
  });

  test("returns true for pr template", () => {
    expect(isBuiltinTemplateId("pr")).toBe(true);
  });

  test("returns true for pr-detailed template", () => {
    expect(isBuiltinTemplateId("pr-detailed")).toBe(true);
  });

  test("returns false for unknown template", () => {
    expect(isBuiltinTemplateId("unknown")).toBe(false);
    expect(isBuiltinTemplateId("custom-commit")).toBe(false);
    expect(isBuiltinTemplateId("")).toBe(false);
  });
});

describe("getDefaultTemplateId", () => {
  test("returns default commit template ID", () => {
    const id = getDefaultTemplateId("commit");
    expect(id).toBe("commit");
  });

  test("returns default push template ID", () => {
    const id = getDefaultTemplateId("push");
    expect(id).toBe("push");
  });

  test("returns default PR template ID", () => {
    const id = getDefaultTemplateId("pr");
    expect(id).toBe("pr");
  });
});

describe("Template content validation", () => {
  test("all commit templates have required variables", () => {
    const commitIds = [
      "commit",
      "commit-conventional",
      "commit-detailed",
      "commit-minimal",
    ];

    commitIds.forEach((id) => {
      const content = getBuiltinTemplateContent(id);
      const variables = content.frontmatter.variables;

      expect(variables).toBeTruthy();
      expect(variables?.some((v) => v.name === "stagedFiles")).toBe(true);
      expect(variables?.some((v) => v.name === "stagedDiff")).toBe(true);
    });
  });

  test("all push templates have required variables", () => {
    const pushIds = ["push", "push-force"];

    pushIds.forEach((id) => {
      const content = getBuiltinTemplateContent(id);
      const variables = content.frontmatter.variables;

      expect(variables).toBeTruthy();
      expect(variables?.some((v) => v.name === "unpushedCommits")).toBe(true);
      expect(variables?.some((v) => v.name === "remoteName")).toBe(true);
      expect(variables?.some((v) => v.name === "branchName")).toBe(true);
    });
  });

  test("all PR templates have required variables", () => {
    const prIds = ["pr", "pr-detailed"];

    prIds.forEach((id) => {
      const content = getBuiltinTemplateContent(id);
      const variables = content.frontmatter.variables;

      expect(variables).toBeTruthy();
      expect(variables?.some((v) => v.name === "baseBranch")).toBe(true);
      expect(variables?.some((v) => v.name === "headBranch")).toBe(true);
      expect(variables?.some((v) => v.name === "commits")).toBe(true);
    });
  });

  test("templates use Handlebars-style syntax", () => {
    const allIds = [
      "commit",
      "commit-conventional",
      "commit-detailed",
      "commit-minimal",
      "push",
      "push-force",
      "pr",
      "pr-detailed",
    ];

    allIds.forEach((id) => {
      const content = getBuiltinTemplateContent(id);

      // Check for {{variable}} syntax
      expect(content.template).toMatch(/\{\{[^}]+\}\}/);
    });
  });

  test("templates include proper instructions", () => {
    const allIds = [
      "commit",
      "commit-conventional",
      "commit-detailed",
      "commit-minimal",
      "push",
      "push-force",
      "pr",
      "pr-detailed",
    ];

    allIds.forEach((id) => {
      const content = getBuiltinTemplateContent(id);

      expect(
        content.template.toLowerCase().includes("instructions") ||
          content.template.toLowerCase().includes("analyze"),
      ).toBe(true);
    });
  });
});
