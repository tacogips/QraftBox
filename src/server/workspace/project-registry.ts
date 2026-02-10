import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Data structure stored in projects.json
 */
interface ProjectRegistryData {
  readonly projects: Record<string, string>; // slug -> absolute path
}

/**
 * Manages URL-safe project slugs with persistent storage.
 * Each project directory gets a persistent, URL-safe slug stored in ~/.local/QraftBox/projects.json.
 */
export interface ProjectRegistry {
  /**
   * Get or create a slug for a path. If path already has a slug, return it.
   * If collision occurs, append incrementing suffix (e.g., qraftbox-a1b2c3-2).
   *
   * @param absolutePath - Absolute filesystem path to the project directory
   * @returns Promise resolving to URL-safe slug
   */
  getOrCreateSlug(absolutePath: string): Promise<string>;

  /**
   * Resolve a slug back to an absolute path.
   *
   * @param slug - URL-safe project slug
   * @returns Promise resolving to absolute path, or undefined if not found
   */
  resolveSlug(slug: string): Promise<string | undefined>;

  /**
   * Remove a slug mapping from the registry.
   *
   * @param slug - URL-safe project slug to remove
   * @returns Promise that resolves when removal is complete
   */
  removeSlug(slug: string): Promise<void>;

  /**
   * Get all registered projects.
   *
   * @returns Promise resolving to read-only map of slug -> absolute path
   */
  getAllProjects(): Promise<ReadonlyMap<string, string>>;
}

/**
 * In-memory cache of registry data
 */
interface RegistryCache {
  data: ProjectRegistryData | null;
  reverseIndex: Map<string, string> | null; // path -> slug
}

/**
 * Options for creating a project registry
 */
export interface ProjectRegistryOptions {
  /**
   * Base directory for registry storage. Defaults to ~/.local/QraftBox
   * Mainly for testing purposes.
   */
  readonly baseDir?: string;
}

/**
 * Get the path to the projects.json file.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Absolute path to projects.json
 */
function getRegistryFilePath(baseDir?: string): string {
  const dir = baseDir ?? join(homedir(), ".local", "QraftBox");
  return join(dir, "projects.json");
}

/**
 * Ensure the registry directory exists.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Promise that resolves when directory is created
 */
async function ensureRegistryDir(baseDir?: string): Promise<void> {
  const dir = baseDir ?? join(homedir(), ".local", "QraftBox");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Generate a URL-safe slug from an absolute path.
 * Takes the basename, lowercases it, replaces non-alphanumeric with hyphens,
 * and appends first 6 chars of hash of the full path.
 *
 * @param absolutePath - Absolute filesystem path
 * @returns URL-safe slug (e.g., "qraftbox-a1b2c3")
 */
function generateSlug(absolutePath: string): string {
  // Get last directory segment (basename)
  const base = basename(absolutePath);

  // Lowercase and replace non-alphanumeric with hyphens
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

  // Generate hash using Bun's built-in hash
  const hash = Bun.hash(absolutePath).toString(16).slice(0, 6);

  return `${sanitized}-${hash}`;
}

/**
 * Find a unique slug by appending incrementing suffix if collision occurs.
 *
 * @param baseSlug - Base slug that may collide
 * @param existingSlugs - Set of existing slugs
 * @returns Unique slug with suffix if needed
 */
function findUniqueSlug(baseSlug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix++;
  }

  return `${baseSlug}-${suffix}`;
}

/**
 * Read registry data from disk.
 *
 * @param baseDir - Base directory override (for testing)
 * @returns Promise resolving to registry data
 */
async function readRegistry(baseDir?: string): Promise<ProjectRegistryData> {
  const filePath = getRegistryFilePath(baseDir);

  if (!existsSync(filePath)) {
    return { projects: {} };
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as unknown;

    // Validate structure
    if (
      typeof data === "object" &&
      data !== null &&
      "projects" in data &&
      typeof data.projects === "object"
    ) {
      return data as ProjectRegistryData;
    }

    // Invalid format, return empty
    return { projects: {} };
  } catch (error) {
    // Failed to read or parse, return empty
    return { projects: {} };
  }
}

/**
 * Write registry data to disk.
 *
 * @param data - Registry data to write
 * @param baseDir - Base directory override (for testing)
 * @returns Promise that resolves when write is complete
 */
async function writeRegistry(
  data: ProjectRegistryData,
  baseDir?: string,
): Promise<void> {
  await ensureRegistryDir(baseDir);
  const filePath = getRegistryFilePath(baseDir);
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Build a reverse index (path -> slug) from registry data.
 *
 * @param data - Registry data
 * @returns Map of absolute path -> slug
 */
function buildReverseIndex(data: ProjectRegistryData): Map<string, string> {
  const reverseIndex = new Map<string, string>();
  for (const [slug, path] of Object.entries(data.projects)) {
    reverseIndex.set(path, slug);
  }
  return reverseIndex;
}

/**
 * Create a project registry instance.
 *
 * @param options - Registry options
 * @returns ProjectRegistry implementation
 */
export function createProjectRegistry(
  options?: ProjectRegistryOptions,
): ProjectRegistry {
  const baseDir = options?.baseDir;
  const cache: RegistryCache = {
    data: null,
    reverseIndex: null,
  };

  /**
   * Load registry data into cache if not already loaded.
   *
   * @returns Promise that resolves when cache is populated
   */
  async function ensureLoaded(): Promise<void> {
    if (cache.data === null) {
      cache.data = await readRegistry(baseDir);
      cache.reverseIndex = buildReverseIndex(cache.data);
    }
  }

  return {
    async getOrCreateSlug(absolutePath: string): Promise<string> {
      await ensureLoaded();

      // Check if this path already has a slug
      const existingSlug = cache.reverseIndex?.get(absolutePath);
      if (existingSlug !== undefined) {
        return existingSlug;
      }

      // Generate new slug
      const baseSlug = generateSlug(absolutePath);
      const existingSlugs = new Set(Object.keys(cache.data?.projects ?? {}));
      const uniqueSlug = findUniqueSlug(baseSlug, existingSlugs);

      // Update cache and persist
      if (cache.data !== null && cache.reverseIndex !== null) {
        const newProjects = {
          ...cache.data.projects,
          [uniqueSlug]: absolutePath,
        };
        cache.data = { projects: newProjects };
        cache.reverseIndex.set(absolutePath, uniqueSlug);
        await writeRegistry(cache.data, baseDir);
      }

      return uniqueSlug;
    },

    async resolveSlug(slug: string): Promise<string | undefined> {
      await ensureLoaded();
      const path = cache.data?.projects[slug];
      return path ?? undefined;
    },

    async removeSlug(slug: string): Promise<void> {
      await ensureLoaded();

      if (cache.data === null || cache.reverseIndex === null) {
        return;
      }

      const path = cache.data.projects[slug];
      if (path === undefined) {
        return;
      }

      // Remove from cache and persist
      const newProjects = { ...cache.data.projects };
      delete newProjects[slug];
      cache.data = { projects: newProjects };
      cache.reverseIndex.delete(path);
      await writeRegistry(cache.data, baseDir);
    },

    async getAllProjects(): Promise<ReadonlyMap<string, string>> {
      await ensureLoaded();
      const entries = Object.entries(cache.data?.projects ?? {});
      return new Map(entries);
    },
  };
}
