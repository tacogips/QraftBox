# Prompt System Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-ai-commit.md
**Phase**: 7
**Created**: 2026-02-04
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-ai-commit.md

### Summary
Shared prompt template system for AI-powered git operations (commit, push, PR). Includes prompt loading, template parsing, and variable substitution.

### Scope
**Included**: Prompt types, prompt loader, prompt builder, default templates, prompt API routes
**Excluded**: Individual git operation execution (separate plans)

---

## Modules

### 1. Prompt Types

#### src/types/prompt-config.ts

**Status**: COMPLETED

```typescript
export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly isBuiltin: boolean;
  readonly isDefault: boolean;
  readonly category: PromptCategory;
}

export type PromptCategory = 'commit' | 'push' | 'pr';

export interface PromptContent {
  readonly template: string;
  readonly frontmatter: PromptFrontmatter;
}

export interface PromptFrontmatter {
  readonly name: string;
  readonly description?: string;
  readonly author?: string;
  readonly version?: string;
  readonly variables?: readonly PromptVariable[];
}

export interface PromptVariable {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string;
}

export interface StagedFile {
  readonly path: string;
  readonly status: 'A' | 'M' | 'D' | 'R';
  readonly additions: number;
  readonly deletions: number;
}
```

**Checklist**:
- [x] Define PromptTemplate interface
- [x] Define PromptCategory type
- [x] Define PromptContent interface
- [x] Define PromptFrontmatter interface
- [x] Define PromptVariable interface
- [x] Define StagedFile interface
- [x] Export all types
- [x] Unit tests

### 2. Prompt Loader

#### src/server/prompts/loader.ts

**Status**: NOT_STARTED

```typescript
interface PromptLoader {
  loadPrompts(category?: PromptCategory): Promise<PromptTemplate[]>;
  loadPromptContent(id: string): Promise<PromptContent>;
  getDefaultPromptId(category: PromptCategory): Promise<string>;
  setDefaultPromptId(category: PromptCategory, id: string): Promise<void>;
  watchPrompts(onChange: () => void): () => void;
}

function createPromptLoader(configDir: string): PromptLoader;
```

**Checklist**:
- [ ] Implement loadPrompts()
- [ ] Implement loadPromptContent()
- [ ] Implement getDefaultPromptId()
- [ ] Implement setDefaultPromptId()
- [ ] Implement watchPrompts()
- [ ] Parse frontmatter from markdown
- [ ] Handle builtin vs user prompts
- [ ] Unit tests

### 3. Prompt Builder

#### src/server/prompts/builder.ts

**Status**: NOT_STARTED

```typescript
interface PromptBuilder {
  buildPrompt<T extends Record<string, unknown>>(
    template: PromptContent,
    context: T
  ): string;
  extractVariables(template: string): PromptVariable[];
  validateVariables(
    template: PromptContent,
    variables: Record<string, string>
  ): ValidationResult;
}

interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

function createPromptBuilder(): PromptBuilder;
```

**Checklist**:
- [ ] Implement buildPrompt() with Handlebars-style templating
- [ ] Implement extractVariables()
- [ ] Implement validateVariables()
- [ ] Support {{variable}} syntax
- [ ] Support {{#each}} blocks
- [ ] Support {{#if}} conditionals
- [ ] Unit tests

### 4. Default Prompt Templates

#### ~/.config/aynd/default-prompts/

**Status**: NOT_STARTED

**Files to create**:
- commit.md (default commit prompt)
- commit-conventional.md (conventional commits)
- commit-detailed.md (detailed message)
- commit-minimal.md (minimal message)
- push.md (default push prompt)
- push-force.md (force push with safety)
- pr.md (default PR prompt)
- pr-detailed.md (detailed PR)
- README.md (prompt authoring guide)

**Checklist**:
- [ ] Create commit.md template
- [ ] Create commit-conventional.md template
- [ ] Create commit-detailed.md template
- [ ] Create commit-minimal.md template
- [ ] Create push.md template
- [ ] Create push-force.md template
- [ ] Create pr.md template
- [ ] Create pr-detailed.md template
- [ ] Create README.md guide
- [ ] Copy templates on first run

### 5. Prompt API Routes

#### src/server/routes/prompts.ts

**Status**: NOT_STARTED

```typescript
// GET /api/prompts - List available prompt templates
// GET /api/prompts/:id - Get prompt template content
// GET /api/prompts/default/:category - Get default prompt for category
// PUT /api/prompts/default/:category - Set default prompt for category
function createPromptRoutes(loader: PromptLoader): Hono;
```

**Checklist**:
- [ ] Implement GET /api/prompts
- [ ] Implement GET /api/prompts/:id
- [ ] Implement GET /api/prompts/default/:category
- [ ] Implement PUT /api/prompts/default/:category
- [ ] Mount routes in index.ts
- [ ] Unit tests

### 6. Staged Files Detection

#### src/server/git/staged.ts

**Status**: COMPLETED

```typescript
function getStagedFiles(cwd: string): Promise<StagedFile[]>;
function getStagedDiff(cwd: string): Promise<string>;
function hasStagedChanges(cwd: string): Promise<boolean>;
```

**Checklist**:
- [x] Implement getStagedFiles()
- [x] Implement getStagedDiff()
- [x] Implement hasStagedChanges()
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Prompt Types | `src/types/prompt-config.ts` | COMPLETED | 73 pass |
| Prompt Loader | `src/server/prompts/loader.ts` | NOT_STARTED | - |
| Prompt Builder | `src/server/prompts/builder.ts` | NOT_STARTED | - |
| Default Templates | `~/.config/aynd/default-prompts/` | NOT_STARTED | - |
| Prompt Routes | `src/server/routes/prompts.ts` | NOT_STARTED | - |
| Staged Files | `src/server/git/staged.ts` | COMPLETED | 20 pass |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Prompt System | Phase 6 (Multi-Directory) | Ready |
| Prompt System | 12-ai-integration | Completed |

## Completion Criteria

- [ ] Can load prompt templates from config dir
- [ ] Can parse frontmatter metadata
- [ ] Can render templates with variables
- [ ] Default templates are installed
- [ ] API routes work
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-04 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation. This is the foundation for 19-ai-commit, 20-ai-push, 22-ai-pr.

### Session: 2026-02-04 (TASK-006: Staged Files)
**Tasks Completed**: TASK-006 - Staged Files Detection (src/server/git/staged.ts)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented getStagedFiles, getStagedDiff, hasStagedChanges with 20 comprehensive unit tests. All tests pass, typecheck passes.

### Session: 2026-02-04 (TASK-001: Prompt Types)
**Tasks Completed**: TASK-001 - Prompt Types (src/types/prompt-config.ts)
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Implemented all type definitions (PromptTemplate, PromptCategory, PromptContent, PromptFrontmatter, PromptVariable, StagedFile) with comprehensive validation functions and utility functions. Created 73 unit tests covering all functionality. All tests pass, typecheck passes.

## Related Plans

- **Depends On**: 17-multi-directory-workspace.md, 12-ai-integration.md
- **Required By**: 19-ai-commit.md, 20-ai-push.md, 22-ai-pr.md
