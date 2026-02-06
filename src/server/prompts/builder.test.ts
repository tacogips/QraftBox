import { describe, test, expect } from "bun:test";
import {
  buildPrompt,
  extractVariables,
  validateVariables,
  type ValidationResult,
} from "./builder";

describe("buildPrompt - simple variable substitution", () => {
  test("replaces simple variables", () => {
    const template = "Hello, {{name}}! You are {{age}} years old.";
    const variables = { name: "Alice", age: 30 };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Hello, Alice! You are 30 years old.");
  });

  test("handles missing variables gracefully", () => {
    const template = "Hello, {{name}}! Your email is {{email}}.";
    const variables = { name: "Bob" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Hello, Bob! Your email is .");
  });

  test("handles undefined variables", () => {
    const template = "Value: {{value}}";
    const variables = { value: undefined };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Value: ");
  });

  test("handles null variables", () => {
    const template = "Value: {{value}}";
    const variables = { value: null };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Value: ");
  });

  test("converts numbers to strings", () => {
    const template = "Count: {{count}}, Price: {{price}}";
    const variables = { count: 42, price: 99.99 };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Count: 42, Price: 99.99");
  });

  test("converts booleans to strings", () => {
    const template = "Active: {{active}}, Verified: {{verified}}";
    const variables = { active: true, verified: false };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Active: true, Verified: false");
  });

  test("handles multiple occurrences of same variable", () => {
    const template = "{{name}} said: Hello, {{name}}!";
    const variables = { name: "Charlie" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Charlie said: Hello, Charlie!");
  });

  test("handles empty template", () => {
    const template = "";
    const variables = { name: "Alice" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("handles template with no variables", () => {
    const template = "This is a plain text template.";
    const variables = { name: "Alice" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("This is a plain text template.");
  });

  test("stringifies arrays as JSON", () => {
    const template = "Items: {{items}}";
    const variables = { items: ["apple", "banana", "cherry"] };

    const result = buildPrompt(template, variables);

    expect(result).toContain('"apple"');
    expect(result).toContain('"banana"');
    expect(result).toContain('"cherry"');
  });

  test("stringifies objects as JSON", () => {
    const template = "Config: {{config}}";
    const variables = { config: { debug: true, timeout: 5000 } };

    const result = buildPrompt(template, variables);

    expect(result).toContain('"debug"');
    expect(result).toContain("true");
    expect(result).toContain('"timeout"');
    expect(result).toContain("5000");
  });
});

describe("buildPrompt - {{#each}} blocks", () => {
  test("iterates over array of objects", () => {
    const template =
      "Files:\n{{#each files}}  - {{path}} ({{status}})\n{{/each}}";
    const variables = {
      files: [
        { path: "src/main.ts", status: "M" },
        { path: "src/utils.ts", status: "A" },
        { path: "README.md", status: "M" },
      ],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe(
      "Files:\n" +
        "  - src/main.ts (M)\n" +
        "  - src/utils.ts (A)\n" +
        "  - README.md (M)\n",
    );
  });

  test("iterates over array of primitives", () => {
    const template = "Tags: {{#each tags}}{{.}}, {{/each}}";
    const variables = { tags: ["typescript", "bun", "testing"] };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Tags: typescript, bun, testing, ");
  });

  test("handles empty array", () => {
    const template = "Files:\n{{#each files}}  - {{path}}\n{{/each}}Done";
    const variables = { files: [] };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Files:\nDone");
  });

  test("handles undefined array variable", () => {
    const template = "Files:\n{{#each files}}  - {{path}}\n{{/each}}Done";
    const variables = {};

    const result = buildPrompt(template, variables);

    expect(result).toBe("Files:\nDone");
  });

  test("handles null array variable", () => {
    const template = "Files:\n{{#each files}}  - {{path}}\n{{/each}}Done";
    const variables = { files: null };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Files:\nDone");
  });

  test("handles non-array value", () => {
    const template = "Files:\n{{#each files}}  - {{path}}\n{{/each}}Done";
    const variables = { files: "not-an-array" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Files:\nDone");
  });

  test("supports @index in each block", () => {
    const template = "{{#each items}}{{@index}}. {{name}}\n{{/each}}";
    const variables = {
      items: [{ name: "First" }, { name: "Second" }, { name: "Third" }],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe("0. First\n1. Second\n2. Third\n");
  });

  test("handles nested properties in each block", () => {
    const template = "{{#each commits}}Commit {{hash}}: {{message}}\n{{/each}}";
    const variables = {
      commits: [
        { hash: "abc123", message: "Initial commit" },
        { hash: "def456", message: "Add feature" },
      ],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe(
      "Commit abc123: Initial commit\n" + "Commit def456: Add feature\n",
    );
  });

  test("handles multiple each blocks", () => {
    const template =
      "Modified:\n{{#each modified}}  - {{.}}\n{{/each}}\n" +
      "Added:\n{{#each added}}  - {{.}}\n{{/each}}";
    const variables = {
      modified: ["file1.ts", "file2.ts"],
      added: ["file3.ts"],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe(
      "Modified:\n  - file1.ts\n  - file2.ts\n\n" + "Added:\n  - file3.ts\n",
    );
  });
});

describe("buildPrompt - {{#if}} blocks", () => {
  test("includes content when condition is truthy", () => {
    const template = "{{#if hasChanges}}You have pending changes.{{/if}}";
    const variables = { hasChanges: true };

    const result = buildPrompt(template, variables);

    expect(result).toBe("You have pending changes.");
  });

  test("excludes content when condition is falsy", () => {
    const template = "{{#if hasChanges}}You have pending changes.{{/if}}";
    const variables = { hasChanges: false };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats undefined as falsy", () => {
    const template = "{{#if value}}Value exists{{/if}}";
    const variables = {};

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats null as falsy", () => {
    const template = "{{#if value}}Value exists{{/if}}";
    const variables = { value: null };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats empty string as falsy", () => {
    const template = "{{#if text}}Text: {{text}}{{/if}}";
    const variables = { text: "" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats zero as falsy", () => {
    const template = "{{#if count}}Count: {{count}}{{/if}}";
    const variables = { count: 0 };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats empty array as falsy", () => {
    const template = "{{#if items}}Items exist{{/if}}";
    const variables = { items: [] };

    const result = buildPrompt(template, variables);

    expect(result).toBe("");
  });

  test("treats non-empty array as truthy", () => {
    const template = "{{#if items}}Items exist{{/if}}";
    const variables = { items: ["item1"] };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Items exist");
  });

  test("treats non-zero number as truthy", () => {
    const template = "{{#if count}}Count: {{count}}{{/if}}";
    const variables = { count: 5 };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Count: 5");
  });

  test("treats non-empty string as truthy", () => {
    const template = "{{#if name}}Hello, {{name}}!{{/if}}";
    const variables = { name: "Alice" };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Hello, Alice!");
  });

  test("handles multiple if blocks", () => {
    const template =
      "{{#if hasModified}}Modified files exist\n{{/if}}" +
      "{{#if hasAdded}}Added files exist\n{{/if}}" +
      "{{#if hasDeleted}}Deleted files exist{{/if}}";
    const variables = {
      hasModified: true,
      hasAdded: false,
      hasDeleted: true,
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe("Modified files exist\nDeleted files exist");
  });
});

describe("buildPrompt - combined features", () => {
  test("combines simple variables, each, and if", () => {
    const template =
      "# Commit Message\n\n" +
      "Author: {{author}}\n" +
      "{{#if branch}}Branch: {{branch}}\n{{/if}}\n" +
      "Changed files:\n" +
      "{{#each files}}  - {{path}} (+{{additions}}/-{{deletions}})\n{{/each}}";

    const variables = {
      author: "Alice",
      branch: "feature/new-ui",
      files: [
        { path: "src/ui.ts", additions: 120, deletions: 30 },
        { path: "src/styles.css", additions: 45, deletions: 5 },
      ],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe(
      "# Commit Message\n\n" +
        "Author: Alice\n" +
        "Branch: feature/new-ui\n\n" +
        "Changed files:\n" +
        "  - src/ui.ts (+120/-30)\n" +
        "  - src/styles.css (+45/-5)\n",
    );
  });

  test("handles nested conditionals and loops", () => {
    const template =
      "{{#if hasChanges}}" +
      "Changes detected:\n" +
      "{{#each changes}}  - {{type}}: {{file}}\n{{/each}}" +
      "{{/if}}";

    const variables = {
      hasChanges: true,
      changes: [
        { type: "Modified", file: "main.ts" },
        { type: "Added", file: "utils.ts" },
      ],
    };

    const result = buildPrompt(template, variables);

    expect(result).toBe(
      "Changes detected:\n" +
        "  - Modified: main.ts\n" +
        "  - Added: utils.ts\n",
    );
  });

  test("handles real-world commit template", () => {
    const template =
      "Generate a commit message for the following changes:\n\n" +
      "Staged files ({{filesChanged}}):\n" +
      "{{#each stagedFiles}}  {{status}} {{path}} (+{{additions}}/-{{deletions}})\n{{/each}}\n" +
      "{{#if diff}}Diff summary:\n{{diff}}\n{{/if}}" +
      "Provide a clear, concise commit message.";

    const variables = {
      filesChanged: 3,
      stagedFiles: [
        { status: "M", path: "src/main.ts", additions: 50, deletions: 10 },
        { status: "A", path: "src/new.ts", additions: 100, deletions: 0 },
        { status: "D", path: "src/old.ts", additions: 0, deletions: 75 },
      ],
      diff: "Added new feature module and removed deprecated code",
    };

    const result = buildPrompt(template, variables);

    expect(result).toContain("Staged files (3):");
    expect(result).toContain("M src/main.ts (+50/-10)");
    expect(result).toContain("A src/new.ts (+100/-0)");
    expect(result).toContain("D src/old.ts (+0/-75)");
    expect(result).toContain("Diff summary:");
    expect(result).toContain("Added new feature module");
  });
});

describe("extractVariables", () => {
  test("extracts simple variables", () => {
    const template = "Hello, {{name}}! You are {{age}} years old.";

    const variables = extractVariables(template);

    expect(variables).toEqual(["age", "name"]);
  });

  test("extracts variables from each blocks", () => {
    const template = "{{#each items}}  - {{name}}\n{{/each}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["items", "name"]);
  });

  test("extracts variables from if blocks", () => {
    const template = "{{#if condition}}Content{{/if}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["condition"]);
  });

  test("extracts unique variables", () => {
    const template = "{{name}} said: Hello, {{name}}! Age: {{age}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["age", "name"]);
  });

  test("excludes special variables like @index", () => {
    const template = "{{#each items}}{{@index}}. {{name}}{{/each}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["items", "name"]);
    expect(variables).not.toContain("@index");
  });

  test("returns empty array for template with no variables", () => {
    const template = "This is a plain text template.";

    const variables = extractVariables(template);

    expect(variables).toEqual([]);
  });

  test("handles complex template", () => {
    const template =
      "Author: {{author}}\n" +
      "{{#if branch}}Branch: {{branch}}\n{{/if}}" +
      "Files:\n{{#each files}}  - {{path}}\n{{/each}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["author", "branch", "files", "path"]);
  });

  test("returns sorted variable names", () => {
    const template = "{{zebra}} {{apple}} {{monkey}}";

    const variables = extractVariables(template);

    expect(variables).toEqual(["apple", "monkey", "zebra"]);
  });
});

describe("validateVariables", () => {
  test("validates when all variables are provided", () => {
    const template = "Hello, {{name}}! You are {{age}} years old.";
    const variables = { name: "Alice", age: 30 };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("detects missing variables", () => {
    const template = "Hello, {{name}}! Your email is {{email}}.";
    const variables = { name: "Bob" };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(false);
    expect(result.missingVariables).toEqual(["email"]);
    expect(result.errors).toEqual(["Missing required variable: email"]);
  });

  test("detects multiple missing variables", () => {
    const template = "{{first}} {{second}} {{third}}";
    const variables = { second: "value" };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(false);
    expect(result.missingVariables).toEqual(["first", "third"]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain("Missing required variable: first");
    expect(result.errors).toContain("Missing required variable: third");
  });

  test("validates complex template with each and if", () => {
    const template =
      "Author: {{author}}\n" +
      "{{#if branch}}Branch: {{branch}}\n{{/if}}" +
      "Files:\n{{#each files}}  - {{path}}\n{{/each}}";

    const variables = {
      author: "Alice",
      branch: "main",
      files: [{ path: "src/main.ts" }],
    };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("detects missing variables in complex template", () => {
    const template =
      "Author: {{author}}\n" +
      "{{#if branch}}Branch: {{branch}}\n{{/if}}" +
      "Files:\n{{#each files}}  - {{path}}\n{{/each}}";

    const variables = {
      author: "Alice",
      // Missing: branch, files
      // Note: path is not required at top level as it's a property of items in files array
    };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(false);
    expect(result.missingVariables).toContain("branch");
    expect(result.missingVariables).toContain("files");
    // path is NOT expected to be in missingVariables as it's inside {{#each}} block
    expect(result.missingVariables).not.toContain("path");
    expect(result.missingVariables).toHaveLength(2);
  });

  test("validates when extra variables are provided", () => {
    const template = "Hello, {{name}}!";
    const variables = { name: "Alice", age: 30, email: "alice@example.com" };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });

  test("validates empty template", () => {
    const template = "";
    const variables = { name: "Alice" };

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });

  test("validates template with no variables", () => {
    const template = "This is a plain text template.";
    const variables = {};

    const result = validateVariables(template, variables);

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });
});

describe("ValidationResult type", () => {
  test("has correct structure", () => {
    const result: ValidationResult = {
      valid: true,
      missingVariables: [],
      errors: [],
    };

    expect(result.valid).toBe(true);
    expect(Array.isArray(result.missingVariables)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test("handles validation failure", () => {
    const result: ValidationResult = {
      valid: false,
      missingVariables: ["name", "email"],
      errors: [
        "Missing required variable: name",
        "Missing required variable: email",
      ],
    };

    expect(result.valid).toBe(false);
    expect(result.missingVariables).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
  });
});
