export function applyCommitSearchDraft(searchDraftQuery: string): string {
  return searchDraftQuery.trim();
}

export function buildAppliedCommitSearchQuery(
  appliedSearchQuery: string,
): string | undefined {
  return appliedSearchQuery.length > 0 ? appliedSearchQuery : undefined;
}
