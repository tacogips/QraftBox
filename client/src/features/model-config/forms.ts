import type {
  ModelProfile,
  ModelVendor,
} from "../../../../src/types/model-config";

export function parseArgumentLines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function suggestModelId(vendor: ModelVendor): string {
  return vendor === "anthropics" ? "claude-opus-4-6" : "gpt-5.3-codex";
}

export function profileSummary(
  profileId: string | null,
  profiles: readonly ModelProfile[],
): string {
  if (profileId === null) {
    return "No profile selected";
  }

  const profile = profiles.find((item) => item.id === profileId);
  if (profile === undefined) {
    return "Selected profile is unavailable";
  }

  return `${profile.vendor} / ${profile.model}`;
}
