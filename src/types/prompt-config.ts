/**
 * Prompt Template Types for AI-powered git operations
 *
 * This module defines types for the shared prompt template system used
 * across commit, push, and PR operations with AI assistance.
 */

/**
 * Prompt category types for different git operations
 */
export type PromptCategory = "commit" | "push" | "pr";

/**
 * Template information for a prompt
 *
 * Represents a single prompt template with its metadata and location.
 */
export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly isBuiltin: boolean;
  readonly isDefault: boolean;
  readonly category: PromptCategory;
}

/**
 * Frontmatter metadata for a prompt template
 *
 * Parsed from the YAML frontmatter section of the prompt markdown file.
 */
export interface PromptFrontmatter {
  readonly name: string;
  readonly description?: string | undefined;
  readonly author?: string | undefined;
  readonly version?: string | undefined;
  readonly variables?: readonly PromptVariable[] | undefined;
}

/**
 * Variable definition in prompt frontmatter
 *
 * Describes a template variable that can be substituted when rendering.
 */
export interface PromptVariable {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string | undefined;
}

/**
 * Complete prompt content including template and metadata
 */
export interface PromptContent {
  readonly template: string;
  readonly frontmatter: PromptFrontmatter;
}

/**
 * File change status for staged files
 * - 'A': Added
 * - 'M': Modified
 * - 'D': Deleted
 * - 'R': Renamed
 */
export type StagedFileStatus = "A" | "M" | "D" | "R";

/**
 * Information about a staged file in git
 */
export interface StagedFile {
  readonly path: string;
  readonly status: StagedFileStatus;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * Validation result type
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string | undefined;
}

/**
 * Create a prompt template instance
 *
 * @param id - Unique identifier for the template
 * @param name - Display name
 * @param description - Template description
 * @param path - File path to the template
 * @param category - Category of prompt (commit, push, pr)
 * @param isBuiltin - Whether this is a built-in template
 * @param isDefault - Whether this is the default template for its category
 * @returns A new prompt template
 */
export function createPromptTemplate(
  id: string,
  name: string,
  description: string,
  path: string,
  category: PromptCategory,
  isBuiltin: boolean,
  isDefault: boolean,
): PromptTemplate {
  return {
    id,
    name,
    description,
    path,
    isBuiltin,
    isDefault,
    category,
  };
}

/**
 * Create a prompt variable definition
 *
 * @param name - Variable name (used in template as {{name}})
 * @param description - Human-readable description
 * @param required - Whether this variable must be provided
 * @param defaultValue - Default value if not provided (optional)
 * @returns A new prompt variable definition
 */
export function createPromptVariable(
  name: string,
  description: string,
  required: boolean,
  defaultValue?: string | undefined,
): PromptVariable {
  return {
    name,
    description,
    required,
    default: defaultValue,
  };
}

/**
 * Create a staged file instance
 *
 * @param path - File path relative to repository root
 * @param status - File change status
 * @param additions - Number of lines added
 * @param deletions - Number of lines deleted
 * @returns A new staged file
 */
export function createStagedFile(
  path: string,
  status: StagedFileStatus,
  additions: number,
  deletions: number,
): StagedFile {
  return {
    path,
    status,
    additions,
    deletions,
  };
}

/**
 * Validate prompt category
 *
 * @param category - Category to validate
 * @returns Validation result
 */
export function validatePromptCategory(category: string): ValidationResult {
  const validCategories: readonly PromptCategory[] = ["commit", "push", "pr"];

  if (!validCategories.includes(category as PromptCategory)) {
    return {
      valid: false,
      error: `Invalid category: must be one of ${validCategories.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate prompt template ID
 *
 * @param id - Template ID to validate
 * @returns Validation result
 */
export function validatePromptId(id: string): ValidationResult {
  if (!id || id.trim().length === 0) {
    return {
      valid: false,
      error: "Prompt ID cannot be empty",
    };
  }

  // Template IDs should be alphanumeric with hyphens and underscores
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  if (!idRegex.test(id)) {
    return {
      valid: false,
      error:
        "Prompt ID must contain only alphanumeric characters, hyphens, and underscores",
    };
  }

  if (id.length > 100) {
    return {
      valid: false,
      error: "Prompt ID must not exceed 100 characters",
    };
  }

  return { valid: true };
}

/**
 * Validate prompt template name
 *
 * @param name - Template name to validate
 * @returns Validation result
 */
export function validatePromptName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      valid: false,
      error: "Prompt name cannot be empty",
    };
  }

  if (name.length > 200) {
    return {
      valid: false,
      error: "Prompt name must not exceed 200 characters",
    };
  }

  return { valid: true };
}

/**
 * Validate variable name
 *
 * @param name - Variable name to validate
 * @returns Validation result
 */
export function validateVariableName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      valid: false,
      error: "Variable name cannot be empty",
    };
  }

  // Variable names should be valid identifiers (alphanumeric and underscore)
  const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!nameRegex.test(name)) {
    return {
      valid: false,
      error:
        "Variable name must start with a letter or underscore and contain only alphanumeric characters and underscores",
    };
  }

  if (name.length > 50) {
    return {
      valid: false,
      error: "Variable name must not exceed 50 characters",
    };
  }

  return { valid: true };
}

/**
 * Validate staged file status
 *
 * @param status - Status to validate
 * @returns Validation result
 */
export function validateStagedFileStatus(status: string): ValidationResult {
  const validStatuses: readonly StagedFileStatus[] = ["A", "M", "D", "R"];

  if (!validStatuses.includes(status as StagedFileStatus)) {
    return {
      valid: false,
      error: `Invalid status: must be one of ${validStatuses.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate prompt frontmatter
 *
 * @param frontmatter - Frontmatter to validate
 * @returns Validation result
 */
export function validatePromptFrontmatter(
  frontmatter: PromptFrontmatter,
): ValidationResult {
  // Validate required name field
  const nameValidation = validatePromptName(frontmatter.name);
  if (!nameValidation.valid) {
    return nameValidation;
  }

  // Validate description if present
  if (frontmatter.description !== undefined) {
    if (frontmatter.description.length > 1000) {
      return {
        valid: false,
        error: "Description must not exceed 1000 characters",
      };
    }
  }

  // Validate version if present
  if (frontmatter.version !== undefined) {
    if (frontmatter.version.trim().length === 0) {
      return {
        valid: false,
        error: "Version cannot be empty if provided",
      };
    }
    if (frontmatter.version.length > 20) {
      return {
        valid: false,
        error: "Version must not exceed 20 characters",
      };
    }
  }

  // Validate author if present
  if (frontmatter.author !== undefined) {
    if (frontmatter.author.trim().length === 0) {
      return {
        valid: false,
        error: "Author cannot be empty if provided",
      };
    }
    if (frontmatter.author.length > 100) {
      return {
        valid: false,
        error: "Author must not exceed 100 characters",
      };
    }
  }

  // Validate variables if present
  if (frontmatter.variables !== undefined) {
    for (const variable of frontmatter.variables) {
      const varNameValidation = validateVariableName(variable.name);
      if (!varNameValidation.valid) {
        return varNameValidation;
      }

      if (variable.description.length > 500) {
        return {
          valid: false,
          error: `Variable "${variable.name}" description must not exceed 500 characters`,
        };
      }

      if (variable.default !== undefined && variable.default.length > 500) {
        return {
          valid: false,
          error: `Variable "${variable.name}" default value must not exceed 500 characters`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Check if a template is builtin
 *
 * @param template - Template to check
 * @returns True if builtin, false otherwise
 */
export function isBuiltinTemplate(template: PromptTemplate): boolean {
  return template.isBuiltin;
}

/**
 * Check if a template is the default for its category
 *
 * @param template - Template to check
 * @returns True if default, false otherwise
 */
export function isDefaultTemplate(template: PromptTemplate): boolean {
  return template.isDefault;
}

/**
 * Filter templates by category
 *
 * @param templates - Templates to filter
 * @param category - Category to filter by
 * @returns Templates matching the category
 */
export function filterTemplatesByCategory(
  templates: readonly PromptTemplate[],
  category: PromptCategory,
): readonly PromptTemplate[] {
  return templates.filter((template) => template.category === category);
}

/**
 * Find the default template for a category
 *
 * @param templates - Templates to search
 * @param category - Category to find default for
 * @returns Default template if found, undefined otherwise
 */
export function findDefaultTemplate(
  templates: readonly PromptTemplate[],
  category: PromptCategory,
): PromptTemplate | undefined {
  const categoryTemplates = filterTemplatesByCategory(templates, category);
  return categoryTemplates.find((template) => template.isDefault);
}

/**
 * Find a template by ID
 *
 * @param templates - Templates to search
 * @param id - Template ID to find
 * @returns Template if found, undefined otherwise
 */
export function findTemplateById(
  templates: readonly PromptTemplate[],
  id: string,
): PromptTemplate | undefined {
  return templates.find((template) => template.id === id);
}

/**
 * Get required variables from frontmatter
 *
 * @param frontmatter - Frontmatter to extract from
 * @returns Array of required variable names
 */
export function getRequiredVariables(
  frontmatter: PromptFrontmatter,
): readonly string[] {
  if (frontmatter.variables === undefined) {
    return [];
  }

  return frontmatter.variables.filter((v) => v.required).map((v) => v.name);
}

/**
 * Get optional variables from frontmatter
 *
 * @param frontmatter - Frontmatter to extract from
 * @returns Array of optional variable names
 */
export function getOptionalVariables(
  frontmatter: PromptFrontmatter,
): readonly string[] {
  if (frontmatter.variables === undefined) {
    return [];
  }

  return frontmatter.variables.filter((v) => !v.required).map((v) => v.name);
}

/**
 * Calculate total changes from staged files
 *
 * @param files - Staged files
 * @returns Object with total additions and deletions
 */
export function calculateStagedChanges(files: readonly StagedFile[]): {
  readonly additions: number;
  readonly deletions: number;
  readonly filesChanged: number;
} {
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return {
    additions,
    deletions,
    filesChanged: files.length,
  };
}

/**
 * Group staged files by status
 *
 * @param files - Staged files to group
 * @returns Object mapping status to files
 */
export function groupFilesByStatus(
  files: readonly StagedFile[],
): Record<StagedFileStatus, readonly StagedFile[]> {
  const grouped: Record<StagedFileStatus, StagedFile[]> = {
    A: [],
    M: [],
    D: [],
    R: [],
  };

  for (const file of files) {
    const statusFiles = grouped[file.status];
    if (statusFiles !== undefined) {
      statusFiles.push(file);
    }
  }

  return grouped;
}
