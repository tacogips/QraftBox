/**
 * Configuration module for qraftbox CLI
 *
 * This module provides configuration loading and validation for the CLI,
 * including default values and merging with user-provided overrides.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import type { CLIConfig, SyncMode, ValidationResult } from "../types/index";

/**
 * Default configuration constants
 *
 * These values are used when no overrides are provided.
 */
export interface ConfigDefaults {
  readonly PORT: number;
  readonly HOST: string;
  readonly OPEN: boolean;
  readonly WATCH: boolean;
  readonly SYNC_MODE: SyncMode;
  readonly AI: boolean;
  readonly PROMPT_MODEL: string;
  readonly ASSISTANT_MODEL: string;
  readonly ASSISTANT_ADDITIONAL_ARGS: readonly string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ConfigDefaults = {
  PORT: 7144,
  HOST: "localhost",
  OPEN: false,
  WATCH: true,
  SYNC_MODE: "manual",
  AI: true,
  PROMPT_MODEL: "claude-opus-4-6",
  ASSISTANT_MODEL: "claude-opus-4-6",
  ASSISTANT_ADDITIONAL_ARGS: ["--dangerously-skip-permissions"],
} as const;

/**
 * Load configuration by merging defaults with overrides
 *
 * Overrides take precedence over defaults. If no projectPath is provided,
 * defaults to the current working directory.
 *
 * @param overrides - Optional partial configuration to override defaults
 * @returns Complete CLI configuration
 */
export function loadConfig(overrides?: Partial<CLIConfig>): CLIConfig {
  const projectPath =
    overrides?.projectPath !== undefined
      ? path.resolve(overrides.projectPath)
      : path.resolve(process.cwd());

  return {
    port: overrides?.port ?? DEFAULT_CONFIG.PORT,
    host: overrides?.host ?? DEFAULT_CONFIG.HOST,
    open: overrides?.open ?? DEFAULT_CONFIG.OPEN,
    watch: overrides?.watch ?? DEFAULT_CONFIG.WATCH,
    syncMode: overrides?.syncMode ?? DEFAULT_CONFIG.SYNC_MODE,
    ai: overrides?.ai ?? DEFAULT_CONFIG.AI,
    projectPath,
    promptModel: overrides?.promptModel ?? DEFAULT_CONFIG.PROMPT_MODEL,
    assistantModel: overrides?.assistantModel ?? DEFAULT_CONFIG.ASSISTANT_MODEL,
    assistantAdditionalArgs:
      overrides?.assistantAdditionalArgs ??
      DEFAULT_CONFIG.ASSISTANT_ADDITIONAL_ARGS,
  };
}

/**
 * Validate CLI configuration
 *
 * Checks that port is in valid range, host is non-empty,
 * projectPath exists on filesystem, and syncMode is valid.
 *
 * @param config - Configuration to validate
 * @returns Validation result with error message if invalid
 */
export function validateConfig(config: CLIConfig): ValidationResult {
  // Validate port range
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    return {
      valid: false,
      error: "port must be an integer between 1 and 65535",
    };
  }

  // Validate host is non-empty
  if (!config.host || config.host.trim().length === 0) {
    return {
      valid: false,
      error: "host cannot be empty",
    };
  }

  // Validate projectPath exists
  if (!existsSync(config.projectPath)) {
    return {
      valid: false,
      error: `projectPath does not exist: ${config.projectPath}`,
    };
  }

  // Validate syncMode is one of the allowed values
  const validSyncModes: readonly SyncMode[] = [
    "manual",
    "auto-push",
    "auto-pull",
    "auto",
  ];
  if (!validSyncModes.includes(config.syncMode)) {
    return {
      valid: false,
      error: `syncMode must be one of: ${validSyncModes.join(", ")}`,
    };
  }

  return { valid: true };
}
