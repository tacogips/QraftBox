/**
 * Prompt Template Loader
 *
 * Loads prompt templates from config directory, parses frontmatter,
 * and manages default prompt selections.
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  PromptTemplate,
  PromptContent,
  PromptCategory,
  PromptFrontmatter,
} from "../../types/prompt-config";
import {
  createPromptTemplate,
  validatePromptCategory,
} from "../../types/prompt-config";

/**
 * Default config directory for prompts
 */
const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "qraftbox", "prompts");

/**
 * Default prompt selections for each category
 */
interface DefaultPromptsConfig {
  readonly commit?: string | undefined;
  readonly push?: string | undefined;
  readonly pr?: string | undefined;
}

const HARDCODED_DEFAULT_PROMPT_IDS: Readonly<Record<PromptCategory, string>> = {
  commit: "commit",
  push: "push",
  pr: "pr",
};

/**
 * Get the defaults config file path
 * Can be overridden for testing via environment variable
 */
function getDefaultsConfigFilePath(): string {
  const testPath = process.env["QRAFTBOX_TEST_CONFIG_DIR"];
  if (testPath !== undefined) {
    return join(testPath, "defaults.json");
  }
  return join(homedir(), ".config", "qraftbox", "defaults.json");
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * Extracts YAML content between --- markers and parses it.
 *
 * @param content - Markdown content with frontmatter
 * @returns Parsed frontmatter and template content
 */
function parseFrontmatter(content: string): {
  frontmatter: PromptFrontmatter;
  template: string;
} {
  const lines = content.split("\n");

  // Check if content starts with frontmatter delimiter
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

  // Extract frontmatter lines (excluding delimiters)
  const frontmatterLines = lines.slice(1, closingIndex);
  const frontmatterYaml = frontmatterLines.join("\n");

  // Extract template content (after closing delimiter)
  const templateLines = lines.slice(closingIndex + 1);
  const template = templateLines.join("\n").trim();

  // Parse YAML frontmatter
  let frontmatterData: unknown;
  try {
    frontmatterData = parseYaml(frontmatterYaml);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(`Failed to parse YAML frontmatter: ${errorMessage}`);
  }

  // Validate frontmatter structure
  if (typeof frontmatterData !== "object" || frontmatterData === null) {
    throw new Error("Frontmatter must be an object");
  }

  const data = frontmatterData as Record<string, unknown>;

  // Extract name (required)
  if (typeof data["name"] !== "string") {
    throw new Error("Frontmatter must include 'name' field");
  }

  const frontmatter: PromptFrontmatter = {
    name: data["name"],
    description:
      typeof data["description"] === "string" ? data["description"] : undefined,
    author: typeof data["author"] === "string" ? data["author"] : undefined,
    version: typeof data["version"] === "string" ? data["version"] : undefined,
    variables: Array.isArray(data["variables"])
      ? data["variables"].map((v: unknown) => {
          if (typeof v !== "object" || v === null) {
            throw new Error("Variable must be an object");
          }
          const variable = v as Record<string, unknown>;
          if (typeof variable["name"] !== "string") {
            throw new Error("Variable must have 'name' field");
          }
          if (typeof variable["description"] !== "string") {
            throw new Error("Variable must have 'description' field");
          }
          if (typeof variable["required"] !== "boolean") {
            throw new Error("Variable must have 'required' field");
          }
          return {
            name: variable["name"],
            description: variable["description"],
            required: variable["required"],
            default:
              typeof variable["default"] === "string"
                ? variable["default"]
                : undefined,
          };
        })
      : undefined,
  };

  return { frontmatter, template };
}

/**
 * Simple YAML parser for frontmatter
 *
 * Handles basic YAML structures needed for frontmatter.
 * Supports: strings, booleans, arrays, objects, multiline strings
 *
 * @param yaml - YAML string to parse
 * @returns Parsed object
 */
function parseYaml(yaml: string): unknown {
  const lines = yaml.split("\n");
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let inMultiline = false;
  let multilineContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) {
      if (inMultiline) {
        multilineContent.push("");
      }
      continue;
    }

    // Handle array items with "-"
    if (line.match(/^\s*-\s*$/)) {
      // Array item without value - create new object
      if (currentArray !== null) {
        const obj: Record<string, unknown> = {};
        currentArray.push(obj);
      }
      continue;
    }

    // Handle array items with "- key: value"
    if (trimmed.startsWith("- ")) {
      const value = trimmed.substring(2).trim();

      if (currentArray !== null) {
        // Check if this is an object in array
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

    // Handle nested object properties in arrays (indented with 4+ spaces)
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
        // Empty value might indicate array or object
        currentKey = key;
        currentArray = [];
        result[key] = currentArray;
      } else if (value === "|" || value === ">") {
        // Multiline string
        currentKey = key;
        inMultiline = true;
        multilineContent = [];
      } else {
        result[key] = parseValue(value);
        currentKey = key;
        currentArray = null;
      }
      continue;
    }

    // Handle multiline content
    if (inMultiline && currentKey !== null) {
      if (line.startsWith("  ")) {
        multilineContent.push(line.substring(2));
      } else {
        // End of multiline
        result[currentKey] = multilineContent.join("\n");
        inMultiline = false;
        multilineContent = [];
        currentKey = null;
      }
    }
  }

  // Finalize any remaining multiline
  if (inMultiline && currentKey !== null) {
    result[currentKey] = multilineContent.join("\n");
  }

  return result;
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
 * Extract category from filename
 *
 * Filename format: {category}[-variant].md
 * Examples: commit.md, commit-conventional.md, pr.md
 *
 * @param filename - Template filename
 * @returns Category if valid, undefined otherwise
 */
function extractCategoryFromFilename(
  filename: string,
): PromptCategory | undefined {
  if (!filename.endsWith(".md")) {
    return undefined;
  }

  const nameWithoutExt = filename.substring(0, filename.length - 3);
  const parts = nameWithoutExt.split("-");
  const category = parts[0];

  if (category === undefined) {
    return undefined;
  }

  const validation = validatePromptCategory(category);
  if (!validation.valid) {
    return undefined;
  }

  return category as PromptCategory;
}

/**
 * Generate template ID from filename
 *
 * @param filename - Template filename
 * @returns Template ID
 */
function generateTemplateId(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/**
 * Load default prompts configuration from disk
 *
 * @returns Default prompts config
 */
async function loadDefaultsConfig(): Promise<DefaultPromptsConfig> {
  const configFile = getDefaultsConfigFilePath();
  try {
    const content = await readFile(configFile, "utf-8");
    const data = JSON.parse(content) as unknown;

    if (typeof data !== "object" || data === null) {
      return {};
    }

    const config = data as Record<string, unknown>;
    return {
      commit:
        typeof config["commit"] === "string" ? config["commit"] : undefined,
      push: typeof config["push"] === "string" ? config["push"] : undefined,
      pr: typeof config["pr"] === "string" ? config["pr"] : undefined,
    };
  } catch {
    // File doesn't exist or is invalid, return empty config
    return {};
  }
}

/**
 * Save default prompts configuration to disk
 *
 * @param config - Default prompts config to save
 */
async function saveDefaultsConfig(config: DefaultPromptsConfig): Promise<void> {
  const configFile = getDefaultsConfigFilePath();
  const configDir = join(configFile, "..");

  // Ensure config directory exists
  try {
    await mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  await writeFile(configFile, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Ensure default prompt config exists with hardcoded defaults.
 *
 * When defaults.json is missing or partially configured, missing categories are
 * written with built-in defaults (commit/push/pr).
 */
export async function ensureDefaultPromptConfig(): Promise<
  Readonly<Record<PromptCategory, string>>
> {
  const current = await loadDefaultsConfig();
  const next: Record<PromptCategory, string> = {
    commit: current.commit ?? HARDCODED_DEFAULT_PROMPT_IDS.commit,
    push: current.push ?? HARDCODED_DEFAULT_PROMPT_IDS.push,
    pr: current.pr ?? HARDCODED_DEFAULT_PROMPT_IDS.pr,
  };

  if (
    current.commit !== next.commit ||
    current.push !== next.push ||
    current.pr !== next.pr
  ) {
    await saveDefaultsConfig(next);
  }

  return next;
}

/**
 * Load all prompt templates from a directory
 *
 * @param configDir - Directory path to load templates from (defaults to ~/.config/qraftbox/prompts/)
 * @returns Array of prompt templates
 */
export async function loadPrompts(
  configDir?: string | undefined,
): Promise<PromptTemplate[]> {
  const dir = configDir ?? DEFAULT_CONFIG_DIR;

  // Check if directory exists
  try {
    const stats = await stat(dir);
    if (!stats.isDirectory()) {
      return [];
    }
  } catch {
    // Directory doesn't exist
    return [];
  }

  // Read all files in directory
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(`Failed to read prompts directory: ${errorMessage}`);
  }

  // Filter for .md files
  const mdFiles = entries.filter((entry) => entry.endsWith(".md"));

  // Load defaults config
  const defaultsConfig = await loadDefaultsConfig();

  // Load each template
  const templates: PromptTemplate[] = [];

  for (const filename of mdFiles) {
    const filePath = join(dir, filename);

    // Extract category from filename
    const category = extractCategoryFromFilename(filename);
    if (category === undefined) {
      continue; // Skip files that don't match category pattern
    }

    // Generate template ID
    const id = generateTemplateId(filename);

    // Read file content to get name and description from frontmatter
    let content;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue; // Skip files that can't be read
    }

    // Parse frontmatter to get metadata
    let frontmatter;
    try {
      const parsed = parseFrontmatter(content);
      frontmatter = parsed.frontmatter;
    } catch {
      continue; // Skip files with invalid frontmatter
    }

    // Determine if this is the default for its category
    const isDefault = defaultsConfig[category] === id;

    // Create template
    const template = createPromptTemplate(
      id,
      frontmatter.name,
      frontmatter.description ?? "",
      filePath,
      category,
      false, // User templates are not builtin
      isDefault,
    );

    templates.push(template);
  }

  return templates;
}

/**
 * Load prompt template content from disk
 *
 * @param template - Template to load content for
 * @returns Prompt content with template and frontmatter
 */
export async function loadPromptContent(
  template: PromptTemplate,
): Promise<PromptContent> {
  let content;
  try {
    content = await readFile(template.path, "utf-8");
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(`Failed to read template file: ${errorMessage}`);
  }

  // Parse frontmatter and template
  try {
    const parsed = parseFrontmatter(content);
    return {
      template: parsed.template,
      frontmatter: parsed.frontmatter,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    throw new Error(`Failed to parse template: ${errorMessage}`);
  }
}

/**
 * Get the default prompt ID for a category
 *
 * @param category - Prompt category
 * @returns Default prompt ID if set, null otherwise
 */
export async function getDefaultPromptId(
  category: PromptCategory,
): Promise<string | null> {
  const config = await ensureDefaultPromptConfig();
  return config[category] ?? null;
}

/**
 * Set the default prompt ID for a category
 *
 * @param category - Prompt category
 * @param id - Template ID to set as default
 */
export async function setDefaultPromptId(
  category: PromptCategory,
  id: string,
): Promise<void> {
  const config = await ensureDefaultPromptConfig();

  const newConfig: DefaultPromptsConfig = {
    ...config,
    [category]: id,
  };

  await saveDefaultsConfig(newConfig);
}
