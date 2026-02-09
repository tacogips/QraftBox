/**
 * System Information Types
 *
 * Types for system information including git and Claude Code version information.
 */

/**
 * Version information for a system component
 *
 * Contains either a successfully retrieved version string or an error message.
 */
export interface VersionInfo {
  readonly version: string | null;
  readonly error: string | null;
}

/**
 * System information including versions of installed tools
 */
export interface SystemInfo {
  readonly git: VersionInfo;
  readonly claudeCode: VersionInfo;
}
