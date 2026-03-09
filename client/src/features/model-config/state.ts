export interface LatestActionDefaultsRequestGuard {
  issue(scopeKey: string | null): number;
  isCurrent(requestToken: number): boolean;
  invalidate(): void;
}

export function createLatestActionDefaultsRequestGuard(): LatestActionDefaultsRequestGuard {
  let latestRequestToken = 0;

  return {
    issue(): number {
      latestRequestToken += 1;
      return latestRequestToken;
    },
    isCurrent(requestToken: number): boolean {
      return requestToken === latestRequestToken;
    },
    invalidate(): void {
      latestRequestToken += 1;
    },
  };
}
