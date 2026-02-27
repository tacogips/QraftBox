/**
 * System Prompt Management for Git Actions
 *
 * Manages system prompt files stored in ~/.config/qraftbox/prompt/.
 * These files contain instructions sent to Claude Code agent for git operations.
 * Users can customize them by editing the files directly.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * System prompt name type
 */
export type SystemPromptName = "commit" | "create-pr";

const DEPRECATED_COMMIT_PROMPT =
  "You are the commit agent. Summarize staged changes clearly.";

const DEFAULT_SYSTEM_PROMPTS: Readonly<Record<SystemPromptName, string>> = {
  commit: `You are a specialized commit generation agent.
Your task is to analyze current repository changes and COMPLETE a real git commit.

Critical requirements:
- Execute git commands directly.
- Do not only output a proposed commit message.
- The task is complete only when a new commit is created (HEAD changes).
- Never ask for confirmation.
- Never include AI attribution or co-author lines.

Workflow:
1) Validate repository state
- Run: git status --porcelain=v1
- If there are no changes to commit, report that clearly and stop.
- If merge conflicts exist, report and stop.

2) Analyze changes
- Run: git status
- Run: git diff HEAD
- Inspect modified files as needed to understand intent.
- Collect key technical points and user-facing impact.

3) Pre-commit hygiene
- Remove ignored build/scratch artifacts when safe.
- Check diff for obvious secret patterns (tokens/keys/passwords) and machine-specific private paths.
- If found, redact/remove before commit.

4) Stage changes
- Run: git add -A
- Verify staged set with: git diff --cached --name-status

5) Generate commit message (required format)
- Conventional commit title: <type>: <description>
- Body sections:
  1. Primary Changes and Intent
  2. Key Technical Concepts
  3. Files and Code Sections
  4. Problem Solving
  5. Impact
  6. Unresolved TODOs (use checkbox list; if none, write "- [ ] None")

6) Execute commit
- Run: git commit -m "<title>" -m "<body>"
- If commit fails, fix actionable issues and retry.

7) Verify success (mandatory)
- Run: git rev-parse HEAD
- Run: git log -1 --pretty=format:%s%n%n%b
- Ensure the latest commit matches the intended title/body.

Output rules:
- Keep output concise.
- Report commit hash and final commit message.
- Do not leave the repository in a partially staged ambiguous state.`,
  "create-pr": `You are a specialized pull request generation agent.
Create or update the GitHub PR for the current branch with a clear, accurate title and body.

Critical requirements:
- Execute required git/gh commands directly.
- Do not output only a draft without applying it.
- Never ask for confirmation.
- Never include AI attribution.

Workflow:
1) Collect context
- Run: git status --short
- Run: git log --oneline -n 20
- Run: gh pr status || true

2) Determine action
- If PR for current branch exists: update it.
- If not: create a new PR.

3) Generate PR content
- Title: concise and specific.
- Body must include:
  - ## Summary
  - ## Changes
  - ## Testing
  - ## Notes (optional)
- Mention key files/components changed.

4) Apply via GitHub CLI
- Create: gh pr create ...
- Update: gh pr edit ...

5) Verify
- Run: gh pr view --json url,title,body,state
- Output PR URL and final title.`,
};

/**
 * Get the system prompt configuration directory path
 *
 * @returns Directory path: ~/.config/qraftbox/prompt/
 */
export function getSystemPromptDir(): string {
  return join(homedir(), ".config", "qraftbox", "prompt");
}

function getLegacySystemPromptDir(): string {
  return join(homedir(), ".config", "qraftbox", "system-prompt");
}

/**
 * Get the file path for a specific system prompt
 *
 * @param name - System prompt name
 * @returns Full file path to the prompt file
 */
function getSystemPromptPath(name: SystemPromptName): string {
  const filename = name === "commit" ? "commit.md" : "create-pr.md";
  return join(getSystemPromptDir(), filename);
}

function getLegacySystemPromptPath(name: SystemPromptName): string {
  const filename = name === "commit" ? "commit.md" : "create-pr.md";
  return join(getLegacySystemPromptDir(), filename);
}

/**
 * Resolve the current system prompt file path with legacy fallback.
 *
 * @param name - System prompt name
 * @returns Existing prompt file path if found, null otherwise
 */
export function resolveSystemPromptPath(name: SystemPromptName): string | null {
  const primaryPath = getSystemPromptPath(name);
  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  const legacyPath = getLegacySystemPromptPath(name);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return null;
}

/**
 * Load default content from agent file
 *
 * Uses built-in defaults embedded in the application.
 *
 * @param name - System prompt name
 * @returns Default content for the system prompt
 */
async function loadDefaultContent(name: SystemPromptName): Promise<string> {
  return DEFAULT_SYSTEM_PROMPTS[name];
}

function isDeprecatedCommitPrompt(content: string): boolean {
  return content.trim() === DEPRECATED_COMMIT_PROMPT;
}

/**
 * Ensure system prompt directory and default files exist
 *
 * Creates the directory and default files if they don't exist.
 * Called on app startup.
 *
 * Default files:
 * - commit.md - Built-in default commit prompt
 * - create-pr.md - Built-in default PR prompt
 */
export async function ensureSystemPromptFiles(): Promise<void> {
  const dir = getSystemPromptDir();
  const legacyDir = getLegacySystemPromptDir();

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  if (!existsSync(legacyDir)) {
    await mkdir(legacyDir, { recursive: true });
  }

  // Ensure commit.md exists
  const commitPath = getSystemPromptPath("commit");
  if (!existsSync(commitPath)) {
    const legacyCommitPath = getLegacySystemPromptPath("commit");
    if (existsSync(legacyCommitPath)) {
      const legacyContent = await readFile(legacyCommitPath, "utf-8");
      await writeFile(commitPath, legacyContent, "utf-8");
    } else {
      const defaultContent = await loadDefaultContent("commit");
      await writeFile(commitPath, defaultContent, "utf-8");
    }
  }
  const existingCommitContent = await readFile(commitPath, "utf-8");
  if (isDeprecatedCommitPrompt(existingCommitContent)) {
    const defaultContent = await loadDefaultContent("commit");
    await writeFile(commitPath, defaultContent, "utf-8");
  }

  // Ensure create-pr.md exists
  const prPath = getSystemPromptPath("create-pr");
  if (!existsSync(prPath)) {
    const legacyPrPath = getLegacySystemPromptPath("create-pr");
    if (existsSync(legacyPrPath)) {
      const legacyContent = await readFile(legacyPrPath, "utf-8");
      await writeFile(prPath, legacyContent, "utf-8");
    } else {
      const defaultContent = await loadDefaultContent("create-pr");
      await writeFile(prPath, defaultContent, "utf-8");
    }
  }
}

/**
 * Load system prompt content from disk
 *
 * Reads and returns the content of the named system prompt file.
 *
 * @param name - System prompt name ("commit" | "create-pr")
 * @returns System prompt content
 * @throws Error if file doesn't exist or cannot be read
 */
export async function loadSystemPrompt(
  name: SystemPromptName,
): Promise<string> {
  const resolvedPath = resolveSystemPromptPath(name);
  if (resolvedPath === null) {
    const filePath = getSystemPromptPath(name);
    const legacyPath = getLegacySystemPromptPath(name);
    throw new Error(
      `System prompt file not found: ${filePath} (legacy fallback: ${legacyPath})`,
    );
  }

  try {
    return await readFile(resolvedPath, "utf-8");
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(`Failed to read system prompt file: ${errorMessage}`);
  }
}

/**
 * Save system prompt content to disk.
 *
 * @param name - System prompt name ("commit" | "create-pr")
 * @param content - Prompt content to save
 */
export async function saveSystemPrompt(
  name: SystemPromptName,
  content: string,
): Promise<void> {
  const next = content.trim();
  if (next.length === 0) {
    throw new Error("Prompt content is required");
  }

  await ensureSystemPromptFiles();
  const path = getSystemPromptPath(name);
  await writeFile(path, `${next}\n`, "utf-8");
}

/**
 * Wrap content in qraftbox-system-prompt XML tags
 *
 * @param content - Content to wrap
 * @returns Content wrapped in XML tags
 */
export function wrapSystemPrompt(content: string): string {
  return `<qraftbox-system-prompt>
${content}
</qraftbox-system-prompt>`;
}

function buildLanguageInstruction(outputLanguage: string): string {
  const language =
    outputLanguage.trim().length > 0 ? outputLanguage : "English";
  return `<qraftbox-output-language>
Write all user-facing output in ${language}.
Do not translate code blocks, command names, file paths, or identifiers unless explicitly requested.
</qraftbox-output-language>`;
}

/**
 * Build complete prompt with system prompt and custom context
 *
 * Loads the system prompt, wraps it in tags, and appends customCtx if provided.
 *
 * @param systemPromptName - System prompt name ("commit" | "create-pr")
 * @param customCtx - Optional custom context to append after system prompt
 * @returns Complete prompt string
 */
export async function buildPrompt(
  systemPromptName: SystemPromptName,
  customCtx?: string | undefined,
  outputLanguage = "English",
): Promise<string> {
  const systemPromptContent = await loadSystemPrompt(systemPromptName);
  const wrappedSystemPrompt = wrapSystemPrompt(systemPromptContent);
  const languageInstruction = buildLanguageInstruction(outputLanguage);

  if (customCtx !== undefined && customCtx.trim().length > 0) {
    return `${wrappedSystemPrompt}

${languageInstruction}

${customCtx}`;
  }

  return `${wrappedSystemPrompt}

${languageInstruction}`;
}
