export const VITE_ALLOWED_HOSTS_ENV_VAR = "QRAFTBOX_VITE_ALLOWED_HOSTS";

export type ResolvedViteAllowedHosts = true | readonly string[] | undefined;

function normalizeAllowedHostEntries(
  configuredHosts: string,
): readonly string[] {
  const allowedHosts = configuredHosts
    .split(",")
    .map((hostEntry) => hostEntry.trim())
    .filter((hostEntry) => hostEntry.length > 0);

  return [...new Set(allowedHosts)];
}

export function resolveViteAllowedHosts(
  configuredHosts: string | undefined = process.env[VITE_ALLOWED_HOSTS_ENV_VAR],
): ResolvedViteAllowedHosts {
  const trimmedConfiguredHosts = configuredHosts?.trim();
  if (
    trimmedConfiguredHosts === undefined ||
    trimmedConfiguredHosts.length === 0
  ) {
    return undefined;
  }

  const normalizedConfiguredHosts = trimmedConfiguredHosts.toLowerCase();
  if (
    normalizedConfiguredHosts === "true" ||
    normalizedConfiguredHosts === "all" ||
    normalizedConfiguredHosts === "*"
  ) {
    return true;
  }

  const allowedHosts = normalizeAllowedHostEntries(trimmedConfiguredHosts);
  return allowedHosts.length > 0 ? allowedHosts : undefined;
}
