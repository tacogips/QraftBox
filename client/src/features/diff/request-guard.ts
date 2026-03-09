export interface DiffRequestToken {
  readonly requestId: number;
  readonly contextId: string;
}

export interface LatestDiffRequestGuard {
  issue(contextId: string): DiffRequestToken;
  isCurrent(token: DiffRequestToken): boolean;
  invalidate(): void;
}

export function createLatestDiffRequestGuard(): LatestDiffRequestGuard {
  let latestRequestId = 0;

  return {
    issue(contextId: string): DiffRequestToken {
      latestRequestId += 1;
      return {
        requestId: latestRequestId,
        contextId,
      };
    },
    isCurrent(token: DiffRequestToken): boolean {
      return token.requestId === latestRequestId;
    },
    invalidate(): void {
      latestRequestId += 1;
    },
  };
}
