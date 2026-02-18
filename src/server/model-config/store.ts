import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { CLIConfig } from "../../types/index.js";
import type {
  ModelConfigState,
  ModelOperation,
  ModelProfile,
  ModelVendor,
  NewModelProfileInput,
  OperationModelBindings,
  ResolvedModelProfile,
  UpdateModelProfileInput,
  UpdateOperationModelBindingsInput,
} from "../../types/model-config.js";
import { createLogger } from "../logger.js";

const logger = createLogger("ModelConfigStore");

export interface ModelConfigStore {
  listProfiles(): readonly ModelProfile[];
  createProfile(input: NewModelProfileInput): ModelProfile;
  updateProfile(id: string, input: UpdateModelProfileInput): ModelProfile;
  deleteProfile(id: string): boolean;
  getOperationBindings(): OperationModelBindings;
  updateOperationBindings(
    input: UpdateOperationModelBindingsInput,
  ): OperationModelBindings;
  getState(): ModelConfigState;
  resolveForOperation(
    operation: ModelOperation,
    explicitProfileId?: string | undefined,
  ): ResolvedModelProfile;
}

export interface ModelConfigStoreOptions {
  readonly dbPath?: string | undefined;
  readonly seedFromCliConfig?:
    | Pick<CLIConfig, "assistantModel" | "assistantAdditionalArgs">
    | undefined;
}

export function defaultModelConfigDbPath(): string {
  return join(homedir(), ".local", "QraftBox", "model-config.db");
}

interface ProfileRow {
  readonly id: string;
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly model: string;
  readonly arguments_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface BindingRow {
  readonly git_commit_profile_id: string | null;
  readonly git_pr_profile_id: string | null;
  readonly ai_default_profile_id: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toProfile(row: ProfileRow): ModelProfile {
  let parsedArgs: string[] = [];
  try {
    const raw = JSON.parse(row.arguments_json) as unknown;
    if (Array.isArray(raw)) {
      parsedArgs = raw.filter((v): v is string => typeof v === "string");
    }
  } catch {
    parsedArgs = [];
  }

  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    model: row.model,
    arguments: parsedArgs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeArguments(args: readonly string[]): string[] {
  return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
}

function generateProfileId(): string {
  return `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function validateVendor(vendor: string): vendor is ModelVendor {
  return vendor === "anthropics" || vendor === "openai";
}

class ModelConfigStoreImpl implements ModelConfigStore {
  private readonly stmtListProfiles: ReturnType<Database["prepare"]>;
  private readonly stmtGetProfile: ReturnType<Database["prepare"]>;
  private readonly stmtInsertProfile: ReturnType<Database["prepare"]>;
  private readonly stmtUpdateProfile: ReturnType<Database["prepare"]>;
  private readonly stmtDeleteProfile: ReturnType<Database["prepare"]>;
  private readonly stmtGetBindings: ReturnType<Database["prepare"]>;
  private readonly stmtUpsertBindings: ReturnType<Database["prepare"]>;
  private readonly stmtClearBindingsForProfile: ReturnType<Database["prepare"]>;

  constructor(
    db: Database,
    seedFromCliConfig:
      | Pick<CLIConfig, "assistantModel" | "assistantAdditionalArgs">
      | undefined,
  ) {
    this.stmtListProfiles = db.prepare(`
      SELECT id, name, vendor, model, arguments_json, created_at, updated_at
      FROM model_profiles
      ORDER BY name COLLATE NOCASE ASC
    `);

    this.stmtGetProfile = db.prepare(`
      SELECT id, name, vendor, model, arguments_json, created_at, updated_at
      FROM model_profiles
      WHERE id = ?
      LIMIT 1
    `);

    this.stmtInsertProfile = db.prepare(`
      INSERT INTO model_profiles (id, name, vendor, model, arguments_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateProfile = db.prepare(`
      UPDATE model_profiles
      SET name = ?, vendor = ?, model = ?, arguments_json = ?, updated_at = ?
      WHERE id = ?
    `);

    this.stmtDeleteProfile = db.prepare(`
      DELETE FROM model_profiles WHERE id = ?
    `);

    this.stmtGetBindings = db.prepare(`
      SELECT git_commit_profile_id, git_pr_profile_id, ai_default_profile_id
      FROM model_operation_bindings
      WHERE id = 1
      LIMIT 1
    `);

    this.stmtUpsertBindings = db.prepare(`
      INSERT INTO model_operation_bindings (id, git_commit_profile_id, git_pr_profile_id, ai_default_profile_id, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        git_commit_profile_id = excluded.git_commit_profile_id,
        git_pr_profile_id = excluded.git_pr_profile_id,
        ai_default_profile_id = excluded.ai_default_profile_id,
        updated_at = excluded.updated_at
    `);

    this.stmtClearBindingsForProfile = db.prepare(`
      UPDATE model_operation_bindings
      SET
        git_commit_profile_id = CASE WHEN git_commit_profile_id = ? THEN NULL ELSE git_commit_profile_id END,
        git_pr_profile_id = CASE WHEN git_pr_profile_id = ? THEN NULL ELSE git_pr_profile_id END,
        ai_default_profile_id = CASE WHEN ai_default_profile_id = ? THEN NULL ELSE ai_default_profile_id END,
        updated_at = ?
      WHERE id = 1
    `);

    this.seedDefaults(seedFromCliConfig);
  }

  private seedDefaults(
    seedFromCliConfig:
      | Pick<CLIConfig, "assistantModel" | "assistantAdditionalArgs">
      | undefined,
  ): void {
    const profiles = this.listProfiles();
    const currentBindings = this.getOperationBindings();

    if (profiles.length === 0) {
      const args =
        (seedFromCliConfig?.assistantAdditionalArgs.length ?? 0) !== 0
          ? [...(seedFromCliConfig?.assistantAdditionalArgs ?? [])]
          : [];

      const created = this.createProfile({
        name: "Anthropic Default",
        vendor: "anthropics",
        model: seedFromCliConfig?.assistantModel ?? "claude-opus-4-6",
        arguments: args,
      });

      this.updateOperationBindings({
        gitCommitProfileId: created.id,
        gitPrProfileId: created.id,
        aiDefaultProfileId: created.id,
      });
      return;
    }

    const fallbackProfileId = profiles[0]?.id ?? null;
    if (fallbackProfileId === null) {
      return;
    }

    let nextGitCommitProfileId: string | null | undefined;
    let nextGitPrProfileId: string | null | undefined;
    let nextAiDefaultProfileId: string | null | undefined;
    let changed = false;

    if (currentBindings.gitCommitProfileId === null) {
      nextGitCommitProfileId = fallbackProfileId;
      changed = true;
    }
    if (currentBindings.gitPrProfileId === null) {
      nextGitPrProfileId = fallbackProfileId;
      changed = true;
    }
    if (currentBindings.aiDefaultProfileId === null) {
      nextAiDefaultProfileId = fallbackProfileId;
      changed = true;
    }

    if (changed) {
      this.updateOperationBindings({
        ...(nextGitCommitProfileId !== undefined && {
          gitCommitProfileId: nextGitCommitProfileId,
        }),
        ...(nextGitPrProfileId !== undefined && {
          gitPrProfileId: nextGitPrProfileId,
        }),
        ...(nextAiDefaultProfileId !== undefined && {
          aiDefaultProfileId: nextAiDefaultProfileId,
        }),
      });
    }
  }

  private getProfileOrThrow(id: string): ModelProfile {
    const row = this.stmtGetProfile.get(id) as ProfileRow | undefined | null;
    if (row === undefined || row === null) {
      throw new Error(`Model profile not found: ${id}`);
    }
    return toProfile(row);
  }

  private assertProfileExists(profileId: string | null): void {
    if (profileId === null) return;
    this.getProfileOrThrow(profileId);
  }

  listProfiles(): readonly ModelProfile[] {
    const rows = this.stmtListProfiles.all() as ProfileRow[];
    return rows.map(toProfile);
  }

  createProfile(input: NewModelProfileInput): ModelProfile {
    const name = input.name.trim();
    const model = input.model.trim();
    const args = normalizeArguments(input.arguments);

    if (name.length === 0) {
      throw new Error("Profile name is required");
    }
    if (!validateVendor(input.vendor)) {
      throw new Error("Invalid vendor");
    }
    if (model.length === 0) {
      throw new Error("Model is required");
    }

    const id = generateProfileId();
    const ts = nowIso();
    this.stmtInsertProfile.run(
      id,
      name,
      input.vendor,
      model,
      JSON.stringify(args),
      ts,
      ts,
    );

    return this.getProfileOrThrow(id);
  }

  updateProfile(id: string, input: UpdateModelProfileInput): ModelProfile {
    const current = this.getProfileOrThrow(id);

    const name = (input.name ?? current.name).trim();
    const vendor = input.vendor ?? current.vendor;
    const model = (input.model ?? current.model).trim();
    const args = normalizeArguments(input.arguments ?? current.arguments);

    if (name.length === 0) {
      throw new Error("Profile name is required");
    }
    if (!validateVendor(vendor)) {
      throw new Error("Invalid vendor");
    }
    if (model.length === 0) {
      throw new Error("Model is required");
    }

    this.stmtUpdateProfile.run(
      name,
      vendor,
      model,
      JSON.stringify(args),
      nowIso(),
      id,
    );

    return this.getProfileOrThrow(id);
  }

  deleteProfile(id: string): boolean {
    const result = this.stmtDeleteProfile.run(id);
    if (result.changes === 0) {
      return false;
    }

    this.stmtClearBindingsForProfile.run(id, id, id, nowIso());

    const profiles = this.listProfiles();
    const fallbackId = profiles[0]?.id ?? null;
    if (fallbackId !== null) {
      const bindings = this.getOperationBindings();
      this.updateOperationBindings({
        gitCommitProfileId: bindings.gitCommitProfileId ?? fallbackId,
        gitPrProfileId: bindings.gitPrProfileId ?? fallbackId,
        aiDefaultProfileId: bindings.aiDefaultProfileId ?? fallbackId,
      });
    }

    return true;
  }

  getOperationBindings(): OperationModelBindings {
    const row = this.stmtGetBindings.get() as BindingRow | undefined | null;
    if (row === undefined || row === null) {
      const defaultBindings: OperationModelBindings = {
        gitCommitProfileId: null,
        gitPrProfileId: null,
        aiDefaultProfileId: null,
      };

      this.stmtUpsertBindings.run(null, null, null, nowIso());
      return defaultBindings;
    }

    return {
      gitCommitProfileId: row.git_commit_profile_id,
      gitPrProfileId: row.git_pr_profile_id,
      aiDefaultProfileId: row.ai_default_profile_id,
    };
  }

  updateOperationBindings(
    input: UpdateOperationModelBindingsInput,
  ): OperationModelBindings {
    const current = this.getOperationBindings();

    const next: OperationModelBindings = {
      gitCommitProfileId:
        input.gitCommitProfileId !== undefined
          ? input.gitCommitProfileId
          : current.gitCommitProfileId,
      gitPrProfileId:
        input.gitPrProfileId !== undefined
          ? input.gitPrProfileId
          : current.gitPrProfileId,
      aiDefaultProfileId:
        input.aiDefaultProfileId !== undefined
          ? input.aiDefaultProfileId
          : current.aiDefaultProfileId,
    };

    this.assertProfileExists(next.gitCommitProfileId);
    this.assertProfileExists(next.gitPrProfileId);
    this.assertProfileExists(next.aiDefaultProfileId);

    this.stmtUpsertBindings.run(
      next.gitCommitProfileId,
      next.gitPrProfileId,
      next.aiDefaultProfileId,
      nowIso(),
    );

    return this.getOperationBindings();
  }

  getState(): ModelConfigState {
    return {
      profiles: this.listProfiles(),
      operationBindings: this.getOperationBindings(),
    };
  }

  resolveForOperation(
    operation: ModelOperation,
    explicitProfileId?: string | undefined,
  ): ResolvedModelProfile {
    const profileId =
      explicitProfileId !== undefined && explicitProfileId.trim().length > 0
        ? explicitProfileId
        : (() => {
            const bindings = this.getOperationBindings();
            switch (operation) {
              case "git_commit":
                return bindings.gitCommitProfileId;
              case "git_pr":
                return bindings.gitPrProfileId;
              case "ai_ask":
                return bindings.aiDefaultProfileId;
            }
          })();

    if (profileId === null || profileId === undefined) {
      throw new Error(
        `No model profile configured for operation: ${operation}`,
      );
    }

    const profile = this.getProfileOrThrow(profileId);
    return {
      profileId: profile.id,
      name: profile.name,
      vendor: profile.vendor,
      model: profile.model,
      arguments: [...profile.arguments],
    };
  }
}

export function createModelConfigStore(
  options?: ModelConfigStoreOptions,
): ModelConfigStore {
  const dbPath = options?.dbPath ?? defaultModelConfigDbPath();

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vendor TEXT NOT NULL,
      model TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS model_operation_bindings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      git_commit_profile_id TEXT,
      git_pr_profile_id TEXT,
      ai_default_profile_id TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_profiles_name
    ON model_profiles(name COLLATE NOCASE)
  `);

  logger.info("Model config store initialized", { dbPath });

  return new ModelConfigStoreImpl(db, options?.seedFromCliConfig);
}
