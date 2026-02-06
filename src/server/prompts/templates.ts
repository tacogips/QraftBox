/**
 * Built-in Prompt Templates
 *
 * Provides default built-in templates for commit, push, and PR operations.
 * These templates are embedded in the application and always available.
 */

import type {
  PromptTemplate,
  PromptContent,
  PromptCategory,
} from "../../types/prompt-config";
import { createPromptTemplate } from "../../types/prompt-config";

/**
 * Built-in template definitions
 * Each template includes its metadata and content
 */
interface BuiltinTemplateDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: PromptCategory;
  readonly isDefault: boolean;
  readonly content: string;
}

/**
 * Default commit prompt template
 */
const BUILTIN_COMMIT_DEFAULT: BuiltinTemplateDefinition = {
  id: "commit",
  name: "Standard Commit",
  description: "Standard commit message with context",
  category: "commit",
  isDefault: true,
  content: `---
name: Standard Commit
description: Standard commit message with context
version: "1.0.0"
author: aynd
variables:
  - name: stagedFiles
    description: List of staged files
    required: true
  - name: stagedDiff
    description: Staged diff content
    required: true
  - name: branchName
    description: Current branch name
    required: false
  - name: recentCommits
    description: Recent commit history
    required: false
---

You are a professional software developer creating a git commit message.

## Staged Changes

### Files
{{#each stagedFiles}}
- [{{status}}] {{path}} (+{{additions}} -{{deletions}})
{{/each}}

### Diff
\`\`\`
{{stagedDiff}}
\`\`\`

{{#if branchName}}
## Context
Branch: {{branchName}}
{{/if}}

{{#if recentCommits}}
## Recent Commits
{{recentCommits}}
{{/if}}

## Instructions

Analyze the staged changes and create a commit message that:

1. Summarizes the changes concisely in the first line (50-72 chars)
2. Provides additional context in the body if needed
3. Focuses on the "why" rather than the "what"
4. Uses imperative mood (e.g., "Add feature" not "Added feature")

Return ONLY the commit message, no explanations or additional text.`,
};

/**
 * Conventional commits template
 */
const BUILTIN_COMMIT_CONVENTIONAL: BuiltinTemplateDefinition = {
  id: "commit-conventional",
  name: "Conventional Commits",
  description: "Commit message following Conventional Commits format",
  category: "commit",
  isDefault: false,
  content: `---
name: Conventional Commits
description: Commit message following Conventional Commits format
version: "1.0.0"
author: aynd
variables:
  - name: stagedFiles
    description: List of staged files
    required: true
  - name: stagedDiff
    description: Staged diff content
    required: true
  - name: branchName
    description: Current branch name
    required: false
---

You are a professional software developer creating a git commit message.

## Staged Changes

### Files
{{#each stagedFiles}}
- [{{status}}] {{path}} (+{{additions}} -{{deletions}})
{{/each}}

### Diff
\`\`\`
{{stagedDiff}}
\`\`\`

{{#if branchName}}
Branch: {{branchName}}
{{/if}}

## Instructions

Analyze the staged changes and create a commit message following Conventional Commits format:

**Format**: \`<type>[optional scope]: <description>\`

**Types**:
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style (formatting, no logic change)
- refactor: Code refactoring
- test: Test changes
- chore: Build, dependencies, or tooling

**Example**:
\`\`\`
feat(auth): add OAuth2 login support

Implement OAuth2 authentication flow with Google and GitHub providers.
Includes token refresh and session management.
\`\`\`

Return ONLY the commit message in conventional commits format.`,
};

/**
 * Detailed commit template
 */
const BUILTIN_COMMIT_DETAILED: BuiltinTemplateDefinition = {
  id: "commit-detailed",
  name: "Detailed Commit",
  description: "Detailed commit message with bullet points",
  category: "commit",
  isDefault: false,
  content: `---
name: Detailed Commit
description: Detailed commit message with bullet points
version: "1.0.0"
author: aynd
variables:
  - name: stagedFiles
    description: List of staged files
    required: true
  - name: stagedDiff
    description: Staged diff content
    required: true
  - name: branchName
    description: Current branch name
    required: false
  - name: recentCommits
    description: Recent commit history
    required: false
---

You are a professional software developer creating a git commit message.

## Staged Changes

### Files
{{#each stagedFiles}}
- [{{status}}] {{path}} (+{{additions}} -{{deletions}})
{{/each}}

### Diff
\`\`\`
{{stagedDiff}}
\`\`\`

{{#if branchName}}
Branch: {{branchName}}
{{/if}}

{{#if recentCommits}}
## Recent Commits
{{recentCommits}}
{{/if}}

## Instructions

Analyze the staged changes and create a detailed commit message with:

1. **Summary line** (50-72 chars): Concise overview of changes
2. **Body with sections**:
   - **Changes**: Bullet points of what changed
   - **Motivation**: Why these changes were made
   - **Impact**: Effects on the codebase or users

**Format**:
\`\`\`
<Summary line>

Changes:
- <change 1>
- <change 2>

Motivation:
<why these changes were needed>

Impact:
<effects of these changes>
\`\`\`

Return ONLY the commit message.`,
};

/**
 * Minimal commit template
 */
const BUILTIN_COMMIT_MINIMAL: BuiltinTemplateDefinition = {
  id: "commit-minimal",
  name: "Minimal Commit",
  description: "Short one-line commit message",
  category: "commit",
  isDefault: false,
  content: `---
name: Minimal Commit
description: Short one-line commit message
version: "1.0.0"
author: aynd
variables:
  - name: stagedFiles
    description: List of staged files
    required: true
  - name: stagedDiff
    description: Staged diff content
    required: true
---

You are a professional software developer creating a git commit message.

## Staged Changes

### Files
{{#each stagedFiles}}
- [{{status}}] {{path}} (+{{additions}} -{{deletions}})
{{/each}}

### Diff
\`\`\`
{{stagedDiff}}
\`\`\`

## Instructions

Analyze the staged changes and create a SHORT, one-line commit message (50-72 chars).

Guidelines:
- Use imperative mood (e.g., "Add feature" not "Added feature")
- Be specific but concise
- Focus on the main change

Return ONLY the commit message (single line, no body).`,
};

/**
 * Default push prompt template
 */
const BUILTIN_PUSH_DEFAULT: BuiltinTemplateDefinition = {
  id: "push",
  name: "Standard Push",
  description: "Standard push verification prompt",
  category: "push",
  isDefault: true,
  content: `---
name: Standard Push
description: Standard push verification prompt
version: "1.0.0"
author: aynd
variables:
  - name: unpushedCommits
    description: List of commits to be pushed
    required: true
  - name: remoteName
    description: Remote repository name
    required: true
  - name: branchName
    description: Branch to push
    required: true
  - name: aheadBy
    description: Number of commits ahead
    required: false
  - name: behindBy
    description: Number of commits behind
    required: false
---

You are a professional developer reviewing changes before pushing to a remote repository.

## Push Information

Remote: {{remoteName}}
Branch: {{branchName}}
{{#if aheadBy}}
Ahead by: {{aheadBy}} commits
{{/if}}
{{#if behindBy}}
Behind by: {{behindBy}} commits
{{/if}}

## Commits to Push

{{unpushedCommits}}

## Instructions

Review the commits to be pushed and provide:

1. **Summary**: Brief overview of what will be pushed
2. **Safety Check**: Identify any potential issues:
   - Breaking changes
   - Sensitive data in commits
   - Large files
   - Work-in-progress commits
3. **Recommendation**: Should this push proceed? (YES/NO/CAUTION)

**Format**:
\`\`\`
Summary:
<brief overview>

Safety Check:
- <issue 1 or "No issues detected">
- <issue 2>

Recommendation: <YES|NO|CAUTION>
Reason: <brief explanation>
\`\`\`

Return ONLY the analysis.`,
};

/**
 * Force push template
 */
const BUILTIN_PUSH_FORCE: BuiltinTemplateDefinition = {
  id: "push-force",
  name: "Force Push with Warnings",
  description: "Force push with safety warnings",
  category: "push",
  isDefault: false,
  content: `---
name: Force Push with Warnings
description: Force push with safety warnings
version: "1.0.0"
author: aynd
variables:
  - name: unpushedCommits
    description: List of commits to be pushed
    required: true
  - name: remoteName
    description: Remote repository name
    required: true
  - name: branchName
    description: Branch to push
    required: true
  - name: aheadBy
    description: Number of commits ahead
    required: false
  - name: behindBy
    description: Number of commits behind
    required: false
---

You are a professional developer reviewing a FORCE PUSH operation.

## WARNING: Force Push Detected

Remote: {{remoteName}}
Branch: {{branchName}}
{{#if aheadBy}}
Ahead by: {{aheadBy}} commits
{{/if}}
{{#if behindBy}}
Behind by: {{behindBy}} commits (WILL BE OVERWRITTEN)
{{/if}}

## Commits to Force Push

{{unpushedCommits}}

## Instructions

Analyze this force push and provide:

1. **Impact Assessment**: What will be overwritten/lost?
2. **Risk Level**: LOW/MEDIUM/HIGH/CRITICAL
3. **Safety Checks**:
   - Is this a shared branch?
   - Will this affect other developers?
   - Are there alternative approaches?
4. **Recommendation**: Should this force push proceed?

**CRITICAL WARNINGS**:
- Force pushing to main/master is DANGEROUS
- Force pushing to shared branches can break team workflow
- Consider \`--force-with-lease\` instead

**Format**:
\`\`\`
Impact Assessment:
<what will be affected>

Risk Level: <LOW|MEDIUM|HIGH|CRITICAL>

Safety Checks:
- Shared branch: <YES|NO>
- Affects others: <YES|NO>
- Alternatives: <list or "None">

Recommendation: <PROCEED|ABORT|USE_FORCE_WITH_LEASE>
Reason: <brief explanation>
\`\`\`

Return ONLY the analysis.`,
};

/**
 * Default PR prompt template
 */
const BUILTIN_PR_DEFAULT: BuiltinTemplateDefinition = {
  id: "pr",
  name: "Standard PR",
  description: "Standard pull request description",
  category: "pr",
  isDefault: true,
  content: `---
name: Standard PR
description: Standard pull request description
version: "1.0.0"
author: aynd
variables:
  - name: prTitle
    description: PR title
    required: false
  - name: baseBranch
    description: Base branch
    required: true
  - name: headBranch
    description: Head branch
    required: true
  - name: commits
    description: List of commits in this PR
    required: true
---

You are a professional developer creating a pull request.

## PR Information

{{#if prTitle}}
Title: {{prTitle}}
{{/if}}
Base Branch: {{baseBranch}}
Head Branch: {{headBranch}}

## Commits in this PR

{{commits}}

## Instructions

Create a pull request description with:

1. **Summary** (2-3 sentences): What does this PR do?
2. **Changes**: Bullet points of key changes
3. **Testing**: How to test these changes
4. **Notes**: Any important information for reviewers

{{#if prTitle}}
Use the provided title, or suggest a better one if needed.
{{else}}
Suggest a clear, concise PR title.
{{/if}}

**Format**:
\`\`\`
{{#unless prTitle}}
Title: <suggested title>

{{/unless}}
## Summary
<2-3 sentence overview>

## Changes
- <change 1>
- <change 2>

## Testing
- <test step 1>
- <test step 2>

## Notes
<any important information or context>
\`\`\`

Return ONLY the PR description.`,
};

/**
 * Detailed PR template
 */
const BUILTIN_PR_DETAILED: BuiltinTemplateDefinition = {
  id: "pr-detailed",
  name: "Detailed PR",
  description: "Detailed pull request with comprehensive sections",
  category: "pr",
  isDefault: false,
  content: `---
name: Detailed PR
description: Detailed pull request with comprehensive sections
version: "1.0.0"
author: aynd
variables:
  - name: prTitle
    description: PR title
    required: false
  - name: baseBranch
    description: Base branch
    required: true
  - name: headBranch
    description: Head branch
    required: true
  - name: commits
    description: List of commits in this PR
    required: true
---

You are a professional developer creating a comprehensive pull request.

## PR Information

{{#if prTitle}}
Title: {{prTitle}}
{{/if}}
Base Branch: {{baseBranch}}
Head Branch: {{headBranch}}

## Commits in this PR

{{commits}}

## Instructions

Create a comprehensive pull request description with these sections:

1. **Summary**: What and why (2-3 sentences)
2. **Changes**: Detailed breakdown of changes
3. **Technical Details**: Implementation approach, design decisions
4. **Testing**: Test plan and validation steps
5. **Breaking Changes**: Any breaking changes (or "None")
6. **Dependencies**: New dependencies or requirements (or "None")
7. **Reviewer Notes**: Important areas to focus on during review

{{#if prTitle}}
Use the provided title, or suggest a better one if needed.
{{else}}
Suggest a clear, descriptive PR title.
{{/if}}

**Format**:
\`\`\`
{{#unless prTitle}}
Title: <suggested title>

{{/unless}}
## Summary
<what and why>

## Changes
- <detailed change 1>
- <detailed change 2>

## Technical Details
<implementation approach and design decisions>

## Testing
### Test Plan
- <test scenario 1>
- <test scenario 2>

### Validation
- <how to verify the changes work>

## Breaking Changes
<list or "None">

## Dependencies
<new dependencies or "None">

## Reviewer Notes
<important areas to focus on during review>
\`\`\`

Return ONLY the PR description.`,
};

/**
 * All built-in template definitions
 */
const BUILTIN_TEMPLATES: readonly BuiltinTemplateDefinition[] = [
  // Commit templates
  BUILTIN_COMMIT_DEFAULT,
  BUILTIN_COMMIT_CONVENTIONAL,
  BUILTIN_COMMIT_DETAILED,
  BUILTIN_COMMIT_MINIMAL,
  // Push templates
  BUILTIN_PUSH_DEFAULT,
  BUILTIN_PUSH_FORCE,
  // PR templates
  BUILTIN_PR_DEFAULT,
  BUILTIN_PR_DETAILED,
];

/**
 * Get all built-in prompt templates
 *
 * Returns metadata for all built-in templates without loading their content.
 * All built-in templates are marked as isBuiltin=true and have a virtual path.
 *
 * @returns Array of built-in prompt templates
 */
export function getBuiltinTemplates(): PromptTemplate[] {
  return BUILTIN_TEMPLATES.map((def) =>
    createPromptTemplate(
      def.id,
      def.name,
      def.description,
      `builtin:${def.id}`, // Virtual path for builtin templates
      def.category,
      true, // isBuiltin
      def.isDefault,
    ),
  );
}

/**
 * Get content for a built-in template by ID
 *
 * Parses the template content and extracts frontmatter and template body.
 *
 * @param id - Built-in template ID
 * @returns Prompt content if found
 * @throws Error if template ID is not found or content is invalid
 */
export function getBuiltinTemplateContent(id: string): PromptContent {
  const def = BUILTIN_TEMPLATES.find((t) => t.id === id);

  if (def === undefined) {
    throw new Error(`Built-in template not found: ${id}`);
  }

  // Parse frontmatter from content
  const parsed = parseFrontmatter(def.content);

  return {
    template: parsed.template,
    frontmatter: parsed.frontmatter,
  };
}

/**
 * Parse frontmatter from template content
 *
 * Extracts YAML frontmatter and template body from markdown content.
 * This is a simplified version for built-in templates.
 *
 * @param content - Template content with frontmatter
 * @returns Parsed frontmatter and template
 */
function parseFrontmatter(content: string): PromptContent {
  const lines = content.split("\n");

  // Check for frontmatter delimiter
  if (lines[0] !== "---") {
    throw new Error("Invalid frontmatter: must start with ---");
  }

  // Find closing delimiter
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );

  if (closingIndex === -1) {
    throw new Error("Invalid frontmatter: missing closing ---");
  }

  // Extract frontmatter lines
  const frontmatterLines = lines.slice(1, closingIndex);
  const frontmatterYaml = frontmatterLines.join("\n");

  // Extract template content
  const templateLines = lines.slice(closingIndex + 1);
  const template = templateLines.join("\n").trim();

  // Parse YAML frontmatter
  const frontmatter = parseSimpleYaml(frontmatterYaml);

  return {
    template,
    frontmatter,
  };
}

/**
 * Parse simple YAML frontmatter
 *
 * Handles basic YAML structures for built-in templates.
 *
 * @param yaml - YAML string to parse
 * @returns Parsed frontmatter
 */
function parseSimpleYaml(yaml: string): PromptContent["frontmatter"] {
  const lines = yaml.split("\n");
  const result: Record<string, unknown> = {};
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      continue;
    }

    // Handle array items with "- name: value"
    if (trimmed.startsWith("- ")) {
      const value = trimmed.substring(2).trim();

      if (currentArray !== null) {
        if (value.includes(":")) {
          const [key, val] = value.split(":", 2).map((s) => s.trim());
          if (key !== undefined && val !== undefined) {
            const obj: Record<string, unknown> = { [key]: parseValue(val) };
            currentArray.push(obj);
          }
        } else {
          currentArray.push(parseValue(value));
        }
      }
      continue;
    }

    // Handle nested object properties in arrays
    if (
      line.match(/^\s{4,}/) &&
      currentArray !== null &&
      currentArray.length > 0
    ) {
      const keyValue = trimmed.split(":", 2);
      if (keyValue.length === 2) {
        const key = keyValue[0]?.trim();
        const value = keyValue[1]?.trim();
        if (key !== undefined && value !== undefined) {
          const lastItem = currentArray[currentArray.length - 1];
          if (typeof lastItem === "object" && lastItem !== null) {
            (lastItem as Record<string, unknown>)[key] = parseValue(value);
          }
        }
      }
      continue;
    }

    // Handle key-value pairs
    if (trimmed.includes(":")) {
      const colonIndex = trimmed.indexOf(":");
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value.length === 0) {
        // Empty value indicates array
        currentArray = [];
        result[key] = currentArray;
      } else {
        result[key] = parseValue(value);
        currentArray = null;
      }
    }
  }

  // Validate required fields
  if (typeof result["name"] !== "string") {
    throw new Error("Frontmatter must include 'name' field");
  }

  return {
    name: result["name"],
    description:
      typeof result["description"] === "string"
        ? result["description"]
        : undefined,
    author: typeof result["author"] === "string" ? result["author"] : undefined,
    version:
      typeof result["version"] === "string" ? result["version"] : undefined,
    variables: Array.isArray(result["variables"])
      ? result["variables"].map((v: unknown) => {
          if (typeof v !== "object" || v === null) {
            throw new Error("Variable must be an object");
          }
          const variable = v as Record<string, unknown>;
          return {
            name: String(variable["name"] ?? ""),
            description: String(variable["description"] ?? ""),
            required: Boolean(variable["required"]),
            default:
              typeof variable["default"] === "string"
                ? variable["default"]
                : undefined,
          };
        })
      : undefined,
  };
}

/**
 * Parse a YAML value
 *
 * @param value - Value string to parse
 * @returns Parsed value
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number.parseFloat(value);
  }

  // String (remove quotes if present)
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.substring(1, value.length - 1);
  }

  // Plain string
  return value;
}

/**
 * Check if a template ID refers to a built-in template
 *
 * @param id - Template ID to check
 * @returns True if the ID refers to a built-in template
 */
export function isBuiltinTemplateId(id: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === id);
}

/**
 * Get default template ID for a category
 *
 * @param category - Prompt category
 * @returns Default template ID for the category, or null if not found
 */
export function getDefaultTemplateId(category: PromptCategory): string | null {
  const template = BUILTIN_TEMPLATES.find(
    (t) => t.category === category && t.isDefault,
  );
  return template ? template.id : null;
}
