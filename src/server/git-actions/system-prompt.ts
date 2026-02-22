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
 * Get the source agent file path for default content
 *
 * @param name - System prompt name
 * @returns Full path to the agent .md file
 */
function getSourceAgentPath(name: SystemPromptName): string {
  const filename = name === "commit" ? "git-commit.md" : "git-pr.md";
  return join(process.cwd(), ".claude", "agents", filename);
}

/**
 * Strip YAML frontmatter from agent file content
 *
 * Removes everything up to and including the second "---" line.
 *
 * @param content - Full agent file content with YAML frontmatter
 * @returns Content with frontmatter removed
 */
function stripFrontmatter(content: string): string {
  const lines = content.split("\n");

  // Find the first "---"
  const firstDashIndex = lines.findIndex((line) => line.trim() === "---");
  if (firstDashIndex === -1) {
    // No frontmatter found, return as is
    return content;
  }

  // Find the second "---" after the first
  const secondDashIndex = lines.findIndex(
    (line, index) => index > firstDashIndex && line.trim() === "---",
  );
  if (secondDashIndex === -1) {
    // No closing frontmatter delimiter found, return as is
    return content;
  }

  // Return everything after the second "---", trimmed
  return lines
    .slice(secondDashIndex + 1)
    .join("\n")
    .trim();
}

/**
 * Load default content from agent file
 *
 * Reads the agent .md file and strips YAML frontmatter.
 *
 * @param name - System prompt name
 * @returns Default content for the system prompt
 */
async function loadDefaultContent(name: SystemPromptName): Promise<string> {
  const agentPath = getSourceAgentPath(name);

  try {
    const fullContent = await readFile(agentPath, "utf-8");
    return stripFrontmatter(fullContent);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(
      `Failed to read default agent file ${agentPath}: ${errorMessage}`,
    );
  }
}

/**
 * Ensure system prompt directory and default files exist
 *
 * Creates the directory and default files if they don't exist.
 * Called on app startup.
 *
 * Default files:
 * - commit.md - Content from .claude/agents/git-commit.md (after YAML frontmatter)
 * - create-pr.md - Content from .claude/agents/git-pr.md (after YAML frontmatter)
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
