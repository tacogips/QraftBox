# GitHub Integration Implementation Plan

**Status**: Ready
**Design Reference**: design-docs/specs/design-ai-commit.md
**Phase**: 8
**Created**: 2026-02-04
**Last Updated**: 2026-02-04

---

## Design Document Reference

**Source**: design-docs/specs/design-ai-commit.md

### Summary
GitHub integration using @octokit/rest for API operations. Includes authentication detection (GITHUB_TOKEN, gh auth), Octokit client factory, and GitHub service.

### Scope
**Included**: GitHub types, auth detection, Octokit client, GitHub service, auth API routes
**Excluded**: PR operations (separate plan)

---

## Modules

### 1. GitHub Types

#### src/types/github.ts

**Status**: COMPLETED

```typescript
export interface GitHubUser {
  readonly login: string;
  readonly name: string;
  readonly email: string;
  readonly avatarUrl: string;
}

export interface GitHubAuthStatus {
  readonly authenticated: boolean;
  readonly method: 'env' | 'gh-cli' | 'none';
  readonly user: GitHubUser | null;
  readonly ghCliAvailable: boolean;
}

export interface RepoInfo {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly htmlUrl: string;
}

export interface Label {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

export interface Collaborator {
  readonly login: string;
  readonly avatarUrl: string;
  readonly permissions: CollaboratorPermissions;
}

export interface CollaboratorPermissions {
  readonly admin: boolean;
  readonly push: boolean;
  readonly pull: boolean;
}

export interface BranchComparison {
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly status: 'ahead' | 'behind' | 'diverged' | 'identical';
  readonly commits: readonly CommitInfo[];
}
```

**Checklist**:
- [x] Define GitHubUser interface
- [x] Define GitHubAuthStatus interface
- [x] Define RepoInfo interface
- [x] Define Label interface
- [x] Define Collaborator interface
- [x] Define BranchComparison interface
- [x] Export all types
- [x] Unit tests

### 2. GitHub Auth

#### src/server/github/auth.ts

**Status**: COMPLETED

```typescript
interface GitHubAuth {
  getToken(): Promise<string | null>;
  isAuthenticated(): Promise<boolean>;
  getAuthMethod(): Promise<'env' | 'gh-cli' | 'none'>;
  getUser(): Promise<GitHubUser | null>;
}

function createGitHubAuth(): GitHubAuth;
```

**Checklist**:
- [x] Check GITHUB_TOKEN env var
- [x] Check GH_TOKEN env var
- [x] Check gh auth token command
- [x] Implement getToken()
- [x] Implement isAuthenticated()
- [x] Implement getAuthMethod()
- [x] Implement getUser()
- [x] Unit tests

### 3. Octokit Client Factory

#### src/server/github/client.ts

**Status**: COMPLETED

```typescript
import { Octokit } from '@octokit/rest';

function createOctokitClient(token?: string): Octokit;
function getAuthenticatedClient(): Promise<Octokit>;
```

**Checklist**:
- [x] Add @octokit/rest dependency
- [x] Implement createOctokitClient()
- [x] Implement getAuthenticatedClient()
- [x] Handle unauthenticated client
- [x] Unit tests

### 4. GitHub Service

#### src/server/github/service.ts

**Status**: COMPLETED

```typescript
interface GitHubService {
  getClient(): Promise<Octokit>;
  isAuthenticated(): Promise<boolean>;
  getAuthMethod(): Promise<'env' | 'gh-cli' | 'none'>;
  getUser(): Promise<GitHubUser | null>;

  getRepo(owner: string, repo: string): Promise<RepoInfo>;
  getDefaultBranch(owner: string, repo: string): Promise<string>;
  getBranches(owner: string, repo: string): Promise<string[]>;
  getLabels(owner: string, repo: string): Promise<Label[]>;
  getCollaborators(owner: string, repo: string): Promise<Collaborator[]>;
  compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison>;
}

function createGitHubService(auth: GitHubAuth): GitHubService;
```

**Checklist**:
- [x] Implement getClient()
- [x] Implement getRepo()
- [x] Implement getDefaultBranch()
- [x] Implement getBranches()
- [x] Implement getLabels()
- [x] Implement getCollaborators()
- [x] Implement compareBranches()
- [x] Unit tests

### 5. Repo URL Parser

#### src/server/github/url-parser.ts

**Status**: COMPLETED

```typescript
interface RepoIdentifier {
  readonly owner: string;
  readonly repo: string;
}

function parseGitRemoteUrl(url: string): RepoIdentifier | null;
function getRepoFromRemote(cwd: string, remote?: string): Promise<RepoIdentifier | null>;
```

**Checklist**:
- [x] Parse SSH URLs (git@github.com:owner/repo.git)
- [x] Parse HTTPS URLs (https://github.com/owner/repo.git)
- [x] Get repo from git remote
- [x] Unit tests

### 6. GitHub API Routes

#### src/server/routes/github.ts

**Status**: COMPLETED

```typescript
// GET /api/github/auth - Get GitHub auth status
// GET /api/github/user - Get authenticated user info
// GET /api/ctx/:id/github/repo - Get repo info for context
function createGitHubRoutes(service: GitHubService): Hono;
```

**Checklist**:
- [x] Implement GET /api/github/auth
- [x] Implement GET /api/github/user
- [x] Implement GET /api/ctx/:id/github/repo
- [ ] Mount routes in index.ts
- [x] Unit tests

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| GitHub Types | `src/types/github.ts` | COMPLETED | Pass |
| GitHub Auth | `src/server/github/auth.ts` | COMPLETED | Pass |
| Octokit Client | `src/server/github/client.ts` | COMPLETED | Pass |
| GitHub Service | `src/server/github/service.ts` | COMPLETED | Pass |
| URL Parser | `src/server/github/url-parser.ts` | COMPLETED | Pass |
| GitHub Routes | `src/server/routes/github.ts` | COMPLETED | Pass |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| GitHub Integration | 20-ai-push | Ready |
| GitHub Integration | @octokit/rest | NPM dependency |

## Completion Criteria

- [ ] Can detect GitHub authentication
- [ ] GITHUB_TOKEN and gh auth both work
- [ ] Octokit client works authenticated
- [ ] Can get repo info via API
- [ ] Can list labels and collaborators
- [ ] Type checking passes
- [ ] Unit tests passing

## Progress Log

### Session: 2026-02-05 19:45
**Tasks Completed**: TASK-006 (GitHub Routes)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented GitHub API routes in src/server/routes/github.ts
  - createGitHubRoutes() factory function with dependency injection
  - GET /api/github/auth - returns authentication status (authenticated, method, user, ghCliAvailable)
  - GET /api/github/user - returns authenticated user info (401 if not authenticated)
  - GET /api/ctx/:id/github/repo - returns repository info for context (uses parseGitRemoteUrl to extract owner/repo)
  - Proper error handling with HTTP status codes (200, 401, 404, 500)
  - Uses GitHubAuth, GitHubService, and ContextManager dependencies
  - Comprehensive JSDoc documentation
- Comprehensive unit tests in src/server/routes/github.test.ts
  - 14 tests covering all three endpoints
  - Auth status tests (env, gh-cli, none, errors)
  - User info tests (authenticated, unauthorized, errors)
  - Repo info tests (valid context, context not found, remote not configured, repo not found, service failures)
  - Integration tests for all endpoints
  - Dependency injection tests
  - All tests passing (14 tests, 38 expect() calls)
- Type checking passes
- Note: Routes need to be mounted in server index.ts (not part of this task)

### Session: 2026-02-05 18:30
**Tasks Completed**: TASK-004 (GitHub Service)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented GitHub Service in src/server/github/service.ts
  - createGitHubService() factory function with auth dependency injection
  - getClient() - returns authenticated Octokit instance or null
  - getRepo() - fetches repository info with proper type mapping
  - getDefaultBranch() - extracts default branch from repo info
  - getBranches() - lists all branches with pagination support
  - getLabels() - lists repository labels with pagination
  - getCollaborators() - lists collaborators with permissions mapping
  - compareBranches() - compares branches and maps commits to CommitInfo type
  - Comprehensive error handling (returns null/empty for API failures)
  - Client caching to avoid recreating Octokit instances
  - Full integration with existing types (RepoInfo, Label, Collaborator, BranchComparison)
- Comprehensive unit tests in src/server/github/service.test.ts
  - 23 tests covering authenticated/unauthenticated scenarios
  - Error handling tests (401, 404, network errors)
  - Type safety validation tests
  - All tests passing
- Type checking passes for new files
- Ready for GitHub API routes implementation (TASK-006)

### Session: 2026-02-05 17:33
**Tasks Completed**: TASK-003 (Octokit Client Factory)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented Octokit client factory in src/server/github/client.ts
  - createOctokitClient() function with auth dependency injection
  - Gets token from createGitHubAuth().getToken()
  - Returns Octokit instance if token available, null otherwise
  - getAuthenticatedClient() convenience function that throws if unauthenticated
  - Proper TypeScript strict mode compliance
  - Comprehensive JSDoc documentation
- Comprehensive unit tests in src/server/github/client.test.ts
  - 11 tests covering authenticated/unauthenticated scenarios
  - Mocked auth for testability
  - Integration tests for multiple auth methods
  - All tests passing (60 tests across all GitHub modules)
- Type checking passes for new files
- Ready for GitHub service implementation (TASK-004)

### Session: 2026-02-05 14:30
**Tasks Completed**: TASK-002 (GitHub Authentication)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented GitHub authentication module in src/server/github/auth.ts
  - Token detection with priority: GITHUB_TOKEN > GH_TOKEN > gh CLI
  - createGitHubAuth() factory function with testability support
  - getToken() - retrieves token from environment or gh CLI
  - isAuthenticated() - checks if valid token available
  - getAuthMethod() - returns authentication source
  - getUser() - fetches authenticated user info from GitHub API
  - Token caching to avoid repeated gh CLI invocations
  - Dependency injection support for testing (execAsync, fetch)
- Comprehensive unit tests in src/server/github/auth.test.ts
  - 23 tests covering all authentication scenarios
  - Mocking support for gh CLI and fetch API
  - Tests for env var priority, caching, error handling
  - All tests passing
- Type checking passes (pre-existing errors in worktree.ts unrelated)
- Implementation follows TypeScript strict mode requirements
- Ready for integration with Octokit client (TASK-003)

### Session: 2026-02-05 13:21
**Tasks Completed**: TASK-001 (GitHub Types), TASK-005 (URL Parser)
**Tasks In Progress**: None
**Blockers**: None
**Notes**:
- Implemented GitHub API types in src/types/github.ts
  - All interfaces defined per design specification
  - Proper readonly modifiers for immutability
  - Type-safe status discriminators (method, status)
  - Integration with existing CommitInfo type
- Implemented GitHub URL parser in src/server/github/url-parser.ts
  - SSH format support (git@github.com:owner/repo.git)
  - HTTPS format support (https://github.com/owner/repo.git)
  - URL validation and edge case handling
  - Git remote integration via child_process
- All unit tests passing (17 tests for types, 26 tests for URL parser)
- Type checking passes for new files
- Note: Pre-existing type errors in workspace.ts unrelated to this implementation

### Session: 2026-02-04 (Initial)
**Tasks Completed**: Plan created
**Tasks In Progress**: None
**Blockers**: None
**Notes**: Initial plan creation. Add @octokit/rest to package.json dependencies.

## Related Plans

- **Depends On**: 20-ai-push.md
- **Next**: 22-ai-pr.md
