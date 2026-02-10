/**
 * File-based Prompt Store
 *
 * Manages local prompt storage as JSON files in ~/.local/QraftBox/prompts/.
 * Each prompt is stored as {id}.json.
 */

import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  PromptStore,
  LocalPrompt,
  CreateLocalPromptRequest,
  LocalPromptListOptions,
  LocalPromptListResponse,
  LocalPromptUpdate,
} from "../../types/local-prompt";
import {
  DEFAULT_PROMPTS_DIR,
  generatePromptId,
  generateBasicDescription,
} from "../../types/local-prompt";

/**
 * Check if a filesystem error is a "not found" error
 */
function isNotFoundError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code: string }).code === "ENOENT";
  }
  return false;
}

/**
 * Create a file-based PromptStore
 *
 * @param storageDir - Directory to store prompt JSON files (defaults to ~/.local/QraftBox/prompts/)
 * @returns PromptStore implementation
 */
export function createPromptStore(storageDir?: string): PromptStore {
  const dir = storageDir ?? DEFAULT_PROMPTS_DIR;
  let dirEnsured = false;

  async function ensureDir(): Promise<void> {
    if (dirEnsured) {
      return;
    }
    await mkdir(dir, { recursive: true });
    dirEnsured = true;
  }

  function filePath(id: string): string {
    return join(dir, `${id}.json`);
  }

  return {
    async create(request: CreateLocalPromptRequest): Promise<LocalPrompt> {
      await ensureDir();

      const now = new Date().toISOString();
      const id = generatePromptId();
      const description = generateBasicDescription(request.prompt);

      const prompt: LocalPrompt = {
        id,
        prompt: request.prompt,
        description,
        context: request.context,
        projectPath: request.projectPath,
        status: "pending",
        sessionId: null,
        createdAt: now,
        updatedAt: now,
        error: null,
      };

      await writeFile(filePath(id), JSON.stringify(prompt, null, 2), "utf-8");
      return prompt;
    },

    async get(id: string): Promise<LocalPrompt | null> {
      try {
        const content = await readFile(filePath(id), "utf-8");
        return JSON.parse(content) as LocalPrompt;
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return null;
        }
        throw e;
      }
    },

    async list(
      options?: LocalPromptListOptions,
    ): Promise<LocalPromptListResponse> {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return { prompts: [], total: 0 };
        }
        throw e;
      }

      const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));

      // Read and parse all prompt files
      const prompts: LocalPrompt[] = [];
      for (const filename of jsonFiles) {
        try {
          const content = await readFile(join(dir, filename), "utf-8");
          const prompt = JSON.parse(content) as LocalPrompt;
          prompts.push(prompt);
        } catch {
          // Skip files that cannot be read or parsed
          continue;
        }
      }

      // Apply filters
      let filtered = prompts;

      if (options?.status !== undefined) {
        filtered = filtered.filter((p) => p.status === options.status);
      }

      if (options?.search !== undefined && options.search.length > 0) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.prompt.toLowerCase().includes(searchLower) ||
            p.description.toLowerCase().includes(searchLower),
        );
      }

      // Sort by createdAt descending (newest first)
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const total = filtered.length;

      // Apply pagination
      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return { prompts: paginated, total };
    },

    async update(id: string, updates: LocalPromptUpdate): Promise<LocalPrompt> {
      const content = await readFile(filePath(id), "utf-8");
      const existing = JSON.parse(content) as LocalPrompt;

      const updated: LocalPrompt = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await writeFile(filePath(id), JSON.stringify(updated, null, 2), "utf-8");
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      try {
        await unlink(filePath(id));
        return true;
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return false;
        }
        throw e;
      }
    },

    async recoverInterrupted(): Promise<number> {
      await ensureDir();

      // Read all prompts
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch (e: unknown) {
        if (isNotFoundError(e)) {
          return 0;
        }
        throw e;
      }

      const jsonFiles = entries.filter((entry) => entry.endsWith(".json"));
      let count = 0;

      for (const filename of jsonFiles) {
        try {
          const content = await readFile(join(dir, filename), "utf-8");
          const prompt = JSON.parse(content) as LocalPrompt;

          if (
            prompt.status === "dispatching" ||
            prompt.status === "dispatched"
          ) {
            const updated: LocalPrompt = {
              ...prompt,
              status: "pending",
              sessionId: null,
              error: "Interrupted by server restart",
              updatedAt: new Date().toISOString(),
            };
            await writeFile(
              join(dir, filename),
              JSON.stringify(updated, null, 2),
              "utf-8",
            );
            count++;
          }
        } catch {
          // Skip files that cannot be read or parsed
          continue;
        }
      }

      return count;
    },
  };
}
