import { describe, test, expect } from "bun:test";
import {
  createPromptTemplate,
  createPromptVariable,
  createStagedFile,
  validatePromptCategory,
  validatePromptId,
  validatePromptName,
  validateVariableName,
  validateStagedFileStatus,
  validatePromptFrontmatter,
  isBuiltinTemplate,
  isDefaultTemplate,
  filterTemplatesByCategory,
  findDefaultTemplate,
  findTemplateById,
  getRequiredVariables,
  getOptionalVariables,
  calculateStagedChanges,
  groupFilesByStatus,
  type PromptTemplate,
  type PromptCategory,
  type PromptFrontmatter,
  type StagedFile,
  type StagedFileStatus,
} from "./prompt-config";

describe("createPromptTemplate", () => {
  test("creates template with all fields", () => {
    const template = createPromptTemplate(
      "commit-default",
      "Default Commit",
      "Default commit message template",
      "/path/to/template.md",
      "commit",
      true,
      true,
    );

    expect(template.id).toBe("commit-default");
    expect(template.name).toBe("Default Commit");
    expect(template.description).toBe("Default commit message template");
    expect(template.path).toBe("/path/to/template.md");
    expect(template.category).toBe("commit");
    expect(template.isBuiltin).toBe(true);
    expect(template.isDefault).toBe(true);
  });

  test("creates user template", () => {
    const template = createPromptTemplate(
      "custom-commit",
      "My Custom Template",
      "Custom template",
      "/home/user/.config/qraftbox/prompts/custom.md",
      "commit",
      false,
      false,
    );

    expect(template.isBuiltin).toBe(false);
    expect(template.isDefault).toBe(false);
  });
});

describe("createPromptVariable", () => {
  test("creates required variable without default", () => {
    const variable = createPromptVariable(
      "staged_files",
      "List of staged files",
      true,
    );

    expect(variable.name).toBe("staged_files");
    expect(variable.description).toBe("List of staged files");
    expect(variable.required).toBe(true);
    expect(variable.default).toBeUndefined();
  });

  test("creates optional variable with default", () => {
    const variable = createPromptVariable(
      "commit_style",
      "Style of commit message",
      false,
      "conventional",
    );

    expect(variable.name).toBe("commit_style");
    expect(variable.required).toBe(false);
    expect(variable.default).toBe("conventional");
  });
});

describe("createStagedFile", () => {
  test("creates staged file with all fields", () => {
    const file = createStagedFile("src/feature.ts", "M", 50, 10);

    expect(file.path).toBe("src/feature.ts");
    expect(file.status).toBe("M");
    expect(file.additions).toBe(50);
    expect(file.deletions).toBe(10);
  });

  test("creates added file", () => {
    const file = createStagedFile("src/new.ts", "A", 100, 0);

    expect(file.status).toBe("A");
    expect(file.additions).toBe(100);
    expect(file.deletions).toBe(0);
  });

  test("creates deleted file", () => {
    const file = createStagedFile("src/old.ts", "D", 0, 75);

    expect(file.status).toBe("D");
    expect(file.additions).toBe(0);
    expect(file.deletions).toBe(75);
  });
});

describe("validatePromptCategory", () => {
  test("accepts valid categories", () => {
    expect(validatePromptCategory("commit").valid).toBe(true);
    expect(validatePromptCategory("push").valid).toBe(true);
    expect(validatePromptCategory("pr").valid).toBe(true);
  });

  test("rejects invalid category", () => {
    const result = validatePromptCategory("invalid");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Invalid category: must be one of commit, push, pr",
    );
  });

  test("rejects empty category", () => {
    const result = validatePromptCategory("");
    expect(result.valid).toBe(false);
  });
});

describe("validatePromptId", () => {
  test("accepts valid IDs", () => {
    expect(validatePromptId("commit-default").valid).toBe(true);
    expect(validatePromptId("commit_conventional").valid).toBe(true);
    expect(validatePromptId("pr-detailed-v2").valid).toBe(true);
    expect(validatePromptId("MyCustomTemplate").valid).toBe(true);
    expect(validatePromptId("template123").valid).toBe(true);
  });

  test("rejects empty ID", () => {
    const result = validatePromptId("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt ID cannot be empty");
  });

  test("rejects ID with only whitespace", () => {
    const result = validatePromptId("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt ID cannot be empty");
  });

  test("rejects ID with invalid characters", () => {
    expect(validatePromptId("commit@default").valid).toBe(false);
    expect(validatePromptId("commit default").valid).toBe(false);
    expect(validatePromptId("commit.default").valid).toBe(false);
    expect(validatePromptId("commit/default").valid).toBe(false);
  });

  test("rejects ID exceeding 100 characters", () => {
    const longId = "a".repeat(101);
    const result = validatePromptId(longId);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt ID must not exceed 100 characters");
  });

  test("accepts ID at 100 characters", () => {
    const id = "a".repeat(100);
    expect(validatePromptId(id).valid).toBe(true);
  });
});

describe("validatePromptName", () => {
  test("accepts valid names", () => {
    expect(validatePromptName("Default Commit Template").valid).toBe(true);
    expect(validatePromptName("My Custom Template").valid).toBe(true);
    expect(validatePromptName("PR Template v2.0").valid).toBe(true);
  });

  test("rejects empty name", () => {
    const result = validatePromptName("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt name cannot be empty");
  });

  test("rejects name with only whitespace", () => {
    const result = validatePromptName("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt name cannot be empty");
  });

  test("rejects name exceeding 200 characters", () => {
    const longName = "a".repeat(201);
    const result = validatePromptName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt name must not exceed 200 characters");
  });

  test("accepts name at 200 characters", () => {
    const name = "a".repeat(200);
    expect(validatePromptName(name).valid).toBe(true);
  });
});

describe("validateVariableName", () => {
  test("accepts valid variable names", () => {
    expect(validateVariableName("staged_files").valid).toBe(true);
    expect(validateVariableName("commitMessage").valid).toBe(true);
    expect(validateVariableName("_private").valid).toBe(true);
    expect(validateVariableName("VAR123").valid).toBe(true);
    expect(validateVariableName("var_name_123").valid).toBe(true);
  });

  test("rejects empty name", () => {
    const result = validateVariableName("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Variable name cannot be empty");
  });

  test("rejects name with only whitespace", () => {
    const result = validateVariableName("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Variable name cannot be empty");
  });

  test("rejects name starting with digit", () => {
    const result = validateVariableName("123var");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("must start with a letter or underscore");
  });

  test("rejects name with invalid characters", () => {
    expect(validateVariableName("var-name").valid).toBe(false);
    expect(validateVariableName("var.name").valid).toBe(false);
    expect(validateVariableName("var name").valid).toBe(false);
    expect(validateVariableName("var@name").valid).toBe(false);
  });

  test("rejects name exceeding 50 characters", () => {
    const longName = "a".repeat(51);
    const result = validateVariableName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Variable name must not exceed 50 characters");
  });

  test("accepts name at 50 characters", () => {
    const name = "a".repeat(50);
    expect(validateVariableName(name).valid).toBe(true);
  });
});

describe("validateStagedFileStatus", () => {
  test("accepts valid statuses", () => {
    expect(validateStagedFileStatus("A").valid).toBe(true);
    expect(validateStagedFileStatus("M").valid).toBe(true);
    expect(validateStagedFileStatus("D").valid).toBe(true);
    expect(validateStagedFileStatus("R").valid).toBe(true);
  });

  test("rejects invalid status", () => {
    const result = validateStagedFileStatus("X");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid status: must be one of A, M, D, R");
  });

  test("rejects empty status", () => {
    const result = validateStagedFileStatus("");
    expect(result.valid).toBe(false);
  });

  test("rejects lowercase status", () => {
    expect(validateStagedFileStatus("a").valid).toBe(false);
    expect(validateStagedFileStatus("m").valid).toBe(false);
  });
});

describe("validatePromptFrontmatter", () => {
  test("accepts valid frontmatter with all fields", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Default Commit Template",
      description: "A template for commit messages",
      author: "John Doe",
      version: "1.0.0",
      variables: [
        {
          name: "staged_files",
          description: "List of staged files",
          required: true,
        },
        {
          name: "branch_name",
          description: "Current branch name",
          required: false,
          default: "main",
        },
      ],
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("accepts minimal frontmatter with only name", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Simple Template",
    };

    expect(validatePromptFrontmatter(frontmatter).valid).toBe(true);
  });

  test("rejects empty name", () => {
    const frontmatter: PromptFrontmatter = {
      name: "",
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Prompt name cannot be empty");
  });

  test("rejects description exceeding 1000 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      description: "a".repeat(1001),
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Description must not exceed 1000 characters");
  });

  test("accepts description at 1000 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      description: "a".repeat(1000),
    };

    expect(validatePromptFrontmatter(frontmatter).valid).toBe(true);
  });

  test("rejects empty version", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      version: "   ",
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Version cannot be empty if provided");
  });

  test("rejects version exceeding 20 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      version: "1.0.0-beta-very-long-version",
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Version must not exceed 20 characters");
  });

  test("rejects empty author", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      author: "   ",
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Author cannot be empty if provided");
  });

  test("rejects author exceeding 100 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      author: "a".repeat(101),
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Author must not exceed 100 characters");
  });

  test("rejects invalid variable name", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        {
          name: "invalid-name",
          description: "Variable with invalid name",
          required: true,
        },
      ],
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("must start with a letter or underscore");
  });

  test("rejects variable description exceeding 500 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        {
          name: "var1",
          description: "a".repeat(501),
          required: true,
        },
      ],
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      'Variable "var1" description must not exceed 500 characters',
    );
  });

  test("rejects variable default exceeding 500 characters", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        {
          name: "var1",
          description: "Variable",
          required: false,
          default: "a".repeat(501),
        },
      ],
    };

    const result = validatePromptFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      'Variable "var1" default value must not exceed 500 characters',
    );
  });
});

describe("isBuiltinTemplate", () => {
  test("returns true for builtin template", () => {
    const template = createPromptTemplate(
      "commit-default",
      "Default",
      "Builtin template",
      "/path/to/template.md",
      "commit",
      true,
      true,
    );

    expect(isBuiltinTemplate(template)).toBe(true);
  });

  test("returns false for user template", () => {
    const template = createPromptTemplate(
      "custom",
      "Custom",
      "User template",
      "/path/to/custom.md",
      "commit",
      false,
      false,
    );

    expect(isBuiltinTemplate(template)).toBe(false);
  });
});

describe("isDefaultTemplate", () => {
  test("returns true for default template", () => {
    const template = createPromptTemplate(
      "commit-default",
      "Default",
      "Default template",
      "/path/to/template.md",
      "commit",
      true,
      true,
    );

    expect(isDefaultTemplate(template)).toBe(true);
  });

  test("returns false for non-default template", () => {
    const template = createPromptTemplate(
      "commit-detailed",
      "Detailed",
      "Detailed template",
      "/path/to/detailed.md",
      "commit",
      true,
      false,
    );

    expect(isDefaultTemplate(template)).toBe(false);
  });
});

describe("filterTemplatesByCategory", () => {
  const templates: PromptTemplate[] = [
    createPromptTemplate(
      "commit-default",
      "Default Commit",
      "Default",
      "/path/1.md",
      "commit",
      true,
      true,
    ),
    createPromptTemplate(
      "commit-detailed",
      "Detailed Commit",
      "Detailed",
      "/path/2.md",
      "commit",
      true,
      false,
    ),
    createPromptTemplate(
      "push-default",
      "Default Push",
      "Default",
      "/path/3.md",
      "push",
      true,
      true,
    ),
    createPromptTemplate(
      "pr-default",
      "Default PR",
      "Default",
      "/path/4.md",
      "pr",
      true,
      true,
    ),
  ];

  test("filters commit templates", () => {
    const commits = filterTemplatesByCategory(templates, "commit");
    expect(commits).toHaveLength(2);
    expect(commits.every((t) => t.category === "commit")).toBe(true);
  });

  test("filters push templates", () => {
    const pushes = filterTemplatesByCategory(templates, "push");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.id).toBe("push-default");
  });

  test("filters pr templates", () => {
    const prs = filterTemplatesByCategory(templates, "pr");
    expect(prs).toHaveLength(1);
    expect(prs[0]?.id).toBe("pr-default");
  });

  test("returns empty array for category with no templates", () => {
    const emptyTemplates: PromptTemplate[] = [];
    const result = filterTemplatesByCategory(emptyTemplates, "commit");
    expect(result).toHaveLength(0);
  });
});

describe("findDefaultTemplate", () => {
  const templates: PromptTemplate[] = [
    createPromptTemplate(
      "commit-detailed",
      "Detailed Commit",
      "Detailed",
      "/path/1.md",
      "commit",
      true,
      false,
    ),
    createPromptTemplate(
      "commit-default",
      "Default Commit",
      "Default",
      "/path/2.md",
      "commit",
      true,
      true,
    ),
    createPromptTemplate(
      "push-default",
      "Default Push",
      "Default",
      "/path/3.md",
      "push",
      true,
      true,
    ),
  ];

  test("finds default template for category", () => {
    const defaultCommit = findDefaultTemplate(templates, "commit");
    expect(defaultCommit).toBeDefined();
    expect(defaultCommit?.id).toBe("commit-default");
    expect(defaultCommit?.isDefault).toBe(true);
  });

  test("returns undefined when no default exists", () => {
    const noDefaultTemplates: PromptTemplate[] = [
      createPromptTemplate(
        "commit-1",
        "Template 1",
        "Template",
        "/path/1.md",
        "commit",
        true,
        false,
      ),
      createPromptTemplate(
        "commit-2",
        "Template 2",
        "Template",
        "/path/2.md",
        "commit",
        true,
        false,
      ),
    ];

    const result = findDefaultTemplate(noDefaultTemplates, "commit");
    expect(result).toBeUndefined();
  });

  test("returns undefined for empty templates array", () => {
    const result = findDefaultTemplate([], "commit");
    expect(result).toBeUndefined();
  });
});

describe("findTemplateById", () => {
  const templates: PromptTemplate[] = [
    createPromptTemplate(
      "commit-default",
      "Default Commit",
      "Default",
      "/path/1.md",
      "commit",
      true,
      true,
    ),
    createPromptTemplate(
      "push-default",
      "Default Push",
      "Default",
      "/path/2.md",
      "push",
      true,
      true,
    ),
  ];

  test("finds template by ID", () => {
    const template = findTemplateById(templates, "commit-default");
    expect(template).toBeDefined();
    expect(template?.id).toBe("commit-default");
    expect(template?.name).toBe("Default Commit");
  });

  test("returns undefined for non-existent ID", () => {
    const template = findTemplateById(templates, "non-existent");
    expect(template).toBeUndefined();
  });

  test("returns undefined for empty templates array", () => {
    const template = findTemplateById([], "commit-default");
    expect(template).toBeUndefined();
  });
});

describe("getRequiredVariables", () => {
  test("extracts required variable names", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        { name: "var1", description: "Var 1", required: true },
        { name: "var2", description: "Var 2", required: false },
        { name: "var3", description: "Var 3", required: true },
      ],
    };

    const required = getRequiredVariables(frontmatter);
    expect(required).toEqual(["var1", "var3"]);
  });

  test("returns empty array when no variables defined", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
    };

    const required = getRequiredVariables(frontmatter);
    expect(required).toEqual([]);
  });

  test("returns empty array when all variables are optional", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        { name: "var1", description: "Var 1", required: false },
        { name: "var2", description: "Var 2", required: false },
      ],
    };

    const required = getRequiredVariables(frontmatter);
    expect(required).toEqual([]);
  });
});

describe("getOptionalVariables", () => {
  test("extracts optional variable names", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        { name: "var1", description: "Var 1", required: true },
        { name: "var2", description: "Var 2", required: false },
        { name: "var3", description: "Var 3", required: false },
      ],
    };

    const optional = getOptionalVariables(frontmatter);
    expect(optional).toEqual(["var2", "var3"]);
  });

  test("returns empty array when no variables defined", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
    };

    const optional = getOptionalVariables(frontmatter);
    expect(optional).toEqual([]);
  });

  test("returns empty array when all variables are required", () => {
    const frontmatter: PromptFrontmatter = {
      name: "Template",
      variables: [
        { name: "var1", description: "Var 1", required: true },
        { name: "var2", description: "Var 2", required: true },
      ],
    };

    const optional = getOptionalVariables(frontmatter);
    expect(optional).toEqual([]);
  });
});

describe("calculateStagedChanges", () => {
  test("calculates totals from staged files", () => {
    const files: StagedFile[] = [
      createStagedFile("file1.ts", "M", 50, 10),
      createStagedFile("file2.ts", "A", 100, 0),
      createStagedFile("file3.ts", "D", 0, 75),
      createStagedFile("file4.ts", "M", 25, 5),
    ];

    const stats = calculateStagedChanges(files);
    expect(stats.additions).toBe(175);
    expect(stats.deletions).toBe(90);
    expect(stats.filesChanged).toBe(4);
  });

  test("returns zero for empty files array", () => {
    const stats = calculateStagedChanges([]);
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
    expect(stats.filesChanged).toBe(0);
  });

  test("handles single file", () => {
    const files: StagedFile[] = [createStagedFile("file.ts", "M", 10, 5)];
    const stats = calculateStagedChanges(files);
    expect(stats.additions).toBe(10);
    expect(stats.deletions).toBe(5);
    expect(stats.filesChanged).toBe(1);
  });
});

describe("groupFilesByStatus", () => {
  test("groups files by status", () => {
    const files: StagedFile[] = [
      createStagedFile("file1.ts", "M", 50, 10),
      createStagedFile("file2.ts", "A", 100, 0),
      createStagedFile("file3.ts", "D", 0, 75),
      createStagedFile("file4.ts", "M", 25, 5),
      createStagedFile("file5.ts", "R", 10, 10),
      createStagedFile("file6.ts", "A", 50, 0),
    ];

    const grouped = groupFilesByStatus(files);

    expect(grouped["M"]).toHaveLength(2);
    expect(grouped["A"]).toHaveLength(2);
    expect(grouped["D"]).toHaveLength(1);
    expect(grouped["R"]).toHaveLength(1);

    expect(grouped["M"]?.[0]?.path).toBe("file1.ts");
    expect(grouped["M"]?.[1]?.path).toBe("file4.ts");
  });

  test("returns empty arrays for statuses with no files", () => {
    const files: StagedFile[] = [createStagedFile("file.ts", "M", 10, 5)];

    const grouped = groupFilesByStatus(files);

    expect(grouped["M"]).toHaveLength(1);
    expect(grouped["A"]).toHaveLength(0);
    expect(grouped["D"]).toHaveLength(0);
    expect(grouped["R"]).toHaveLength(0);
  });

  test("handles empty files array", () => {
    const grouped = groupFilesByStatus([]);

    expect(grouped["M"]).toHaveLength(0);
    expect(grouped["A"]).toHaveLength(0);
    expect(grouped["D"]).toHaveLength(0);
    expect(grouped["R"]).toHaveLength(0);
  });
});

describe("Type definitions", () => {
  test("PromptTemplate type structure", () => {
    const template: PromptTemplate = {
      id: "commit-default",
      name: "Default Commit",
      description: "Default template",
      path: "/path/to/template.md",
      isBuiltin: true,
      isDefault: true,
      category: "commit",
    };
    expect(template).toBeDefined();
  });

  test("PromptCategory type validation", () => {
    const categories: PromptCategory[] = ["commit", "push", "pr"];
    categories.forEach((category) => {
      expect(validatePromptCategory(category).valid).toBe(true);
    });
  });

  test("StagedFileStatus type validation", () => {
    const statuses: StagedFileStatus[] = ["A", "M", "D", "R"];
    statuses.forEach((status) => {
      const file: StagedFile = createStagedFile("test.ts", status, 0, 0);
      expect(file.status).toBe(status);
    });
  });
});
