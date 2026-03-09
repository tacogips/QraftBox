import type { AppScreen } from "../../../../client-shared/src/contracts/navigation";

export function ownsDiffAndFilesContext(screen: AppScreen | string): boolean {
  return screen === "files" || screen === "ai-session";
}
