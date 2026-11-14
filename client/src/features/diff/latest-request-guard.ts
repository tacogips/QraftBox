export interface LatestRequestGuard {
  issue(): number;
  isCurrent(requestId: number): boolean;
  invalidate(): void;
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let latestRequestId = 0;

  return {
    issue(): number {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent(requestId: number): boolean {
      return requestId === latestRequestId;
    },
    invalidate(): void {
      latestRequestId += 1;
    },
  };
}
