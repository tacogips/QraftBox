import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../logger.js";

const logger = createLogger("ProjectRegistry");

/**
 * Manages URL-safe project slugs with persistent storage.
 * Each project directory gets a persistent, URL-safe slug stored in SQLite.
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

  /**
   * Get all registered project absolute paths as a Set.
   *
   * @returns Promise resolving to read-only set of absolute paths
   */
  getAllPaths(): Promise<ReadonlySet<string>>;
}

/**
 * Options for creating a project registry
 */
export interface ProjectRegistryOptions {
  /**
   * Path to the SQLite database file. Defaults to ~/.local/QraftBox/project-registry.db
   */
  readonly dbPath?: string;

  /**
   * Path to projects.json for migration. Defaults to ~/.local/QraftBox/projects.json
   */
  readonly jsonMigrationPath?: string;
}

/**
 * Data structure from legacy projects.json
 */
interface LegacyProjectRegistryData {
  readonly projects: Record<string, string>; // slug -> absolute path
}

/**
 * Default database path
 */
export function defaultProjectRegistryDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "project-registry.db");
}

/**
 * Default JSON migration path
 */
function defaultJsonMigrationPath(): string {
  return join(homedir(), ".local", "QraftBox", "projects.json");
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
 * Migrate legacy projects.json to SQLite (synchronous)
 *
 * @param db - SQLite database instance
 * @param jsonPath - Path to legacy projects.json file
 */
function migrateLegacyJson(db: Database, jsonPath: string): void {
  if (!existsSync(jsonPath)) {
    return; // No legacy file to migrate
  }

  try {
    const content = readFileSync(jsonPath, "utf-8");
    const data = JSON.parse(content) as unknown;

    // Validate structure
    if (
      typeof data === "object" &&
      data !== null &&
      "projects" in data &&
      typeof data.projects === "object"
    ) {
      const legacyData = data as LegacyProjectRegistryData;
      const entries = Object.entries(legacyData.projects);

      if (entries.length === 0) {
        logger.info("Legacy projects.json is empty, skipping migration");
        return;
      }

      // Bulk insert in transaction
      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO registered_projects (slug, path) VALUES (?, ?)",
      );

      db.transaction(() => {
        for (const [slug, projectPath] of entries) {
          insertStmt.run(slug, projectPath);
        }
      })();

      logger.info("Migrated legacy projects.json to SQLite", {
        migratedCount: entries.length,
        jsonPath,
      });
    }
  } catch (error) {
    logger.warn("Failed to migrate legacy projects.json", { jsonPath });
  }
}

/**
 * Internal implementation of ProjectRegistry
 */
class ProjectRegistryImpl implements ProjectRegistry {
  private readonly db: Database;
  private readonly stmtGetByPath: ReturnType<Database["prepare"]>;
  private readonly stmtGetBySlug: ReturnType<Database["prepare"]>;
  private readonly stmtGetAllSlugs: ReturnType<Database["prepare"]>;
  private readonly stmtInsert: ReturnType<Database["prepare"]>;
  private readonly stmtDelete: ReturnType<Database["prepare"]>;
  private readonly stmtGetAllProjects: ReturnType<Database["prepare"]>;
  private readonly stmtGetAllPaths: ReturnType<Database["prepare"]>;

  constructor(db: Database) {
    this.db = db;

    // Prepare all statements upfront
    this.stmtGetByPath = db.prepare(
      "SELECT slug FROM registered_projects WHERE path = ?",
    );

    this.stmtGetBySlug = db.prepare(
      "SELECT path FROM registered_projects WHERE slug = ?",
    );

    this.stmtGetAllSlugs = db.prepare("SELECT slug FROM registered_projects");

    this.stmtInsert = db.prepare(
      "INSERT INTO registered_projects (slug, path) VALUES (?, ?)",
    );

    this.stmtDelete = db.prepare(
      "DELETE FROM registered_projects WHERE slug = ?",
    );

    this.stmtGetAllProjects = db.prepare(
      "SELECT slug, path FROM registered_projects",
    );

    this.stmtGetAllPaths = db.prepare("SELECT path FROM registered_projects");
  }

  async getOrCreateSlug(absolutePath: string): Promise<string> {
    // Check if this path already has a slug
    const existingRow = this.stmtGetByPath.get(absolutePath) as
      | { slug: string }
      | undefined
      | null;

    if (existingRow !== undefined && existingRow !== null) {
      return existingRow.slug;
    }

    // Generate new slug
    const baseSlug = generateSlug(absolutePath);

    // Get all existing slugs to find unique one
    const existingSlugRows = this.stmtGetAllSlugs.all() as Array<{
      slug: string;
    }>;
    const existingSlugs = new Set(existingSlugRows.map((row) => row.slug));
    const uniqueSlug = findUniqueSlug(baseSlug, existingSlugs);

    // Insert atomically (transaction ensures read-check-insert atomicity)
    this.db.transaction(() => {
      this.stmtInsert.run(uniqueSlug, absolutePath);
    })();

    logger.debug("Created new slug", { slug: uniqueSlug, path: absolutePath });
    return uniqueSlug;
  }

  async resolveSlug(slug: string): Promise<string | undefined> {
    const row = this.stmtGetBySlug.get(slug) as
      | { path: string }
      | undefined
      | null;

    if (row === undefined || row === null) {
      return undefined;
    }

    return row.path;
  }

  async removeSlug(slug: string): Promise<void> {
    this.stmtDelete.run(slug);
    logger.debug("Removed slug", { slug });
  }

  async getAllProjects(): Promise<ReadonlyMap<string, string>> {
    const rows = this.stmtGetAllProjects.all() as Array<{
      slug: string;
      path: string;
    }>;
    return new Map(rows.map((row) => [row.slug, row.path]));
  }

  async getAllPaths(): Promise<ReadonlySet<string>> {
    const rows = this.stmtGetAllPaths.all() as Array<{ path: string }>;
    return new Set(rows.map((row) => row.path));
  }
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
  const dbPath = options?.dbPath ?? defaultProjectRegistryDbPath();
  const jsonMigrationPath =
    options?.jsonMigrationPath ?? defaultJsonMigrationPath();

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  // Open database
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_projects (
      slug TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_registered_projects_path
    ON registered_projects(path)
  `);

  // Migrate legacy JSON if exists
  migrateLegacyJson(db, jsonMigrationPath);

  logger.info("Project registry initialized", { dbPath });

  return new ProjectRegistryImpl(db);
}

/**
 * Create an in-memory project registry for testing.
 *
 * @returns ProjectRegistry instance backed by in-memory database
 */
export function createInMemoryProjectRegistry(): ProjectRegistry {
  const db = new Database(":memory:");

  // Enable WAL mode
  db.exec("PRAGMA journal_mode=WAL");

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_projects (
      slug TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_registered_projects_path
    ON registered_projects(path)
  `);

  logger.debug("In-memory project registry initialized");

  return new ProjectRegistryImpl(db);
}
