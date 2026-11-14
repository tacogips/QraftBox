export type SessionStatus = "running" | "queued" | "failed" | "awaiting_input";

interface SessionStatusMeta {
  readonly label: string;
  readonly badgeClass: string;
}

const STATUS_META: Readonly<Record<SessionStatus, SessionStatusMeta>> = {
  running: {
    label: "Running",
    badgeClass: "bg-accent-muted text-accent-fg",
  },
  queued: {
    label: "Queued",
    badgeClass: "bg-attention-muted text-attention-fg",
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-danger-emphasis/15 text-danger-fg",
  },
  awaiting_input: {
    label: "Waiting for input",
    badgeClass: "bg-bg-tertiary text-text-secondary",
  },
};

interface SessionStatusInput {
  readonly hasRunningTask: boolean;
  readonly hasQueuedTask: boolean;
  readonly hasFailedTask?: boolean;
}

export function deriveSessionStatus(
  statusInput: SessionStatusInput,
): SessionStatus {
  if (statusInput.hasRunningTask) {
    return "running";
  }
  if (statusInput.hasQueuedTask) {
    return "queued";
  }
  if (statusInput.hasFailedTask) {
    return "failed";
  }
  return "awaiting_input";
}

export function getSessionStatusMeta(status: SessionStatus): SessionStatusMeta {
  return STATUS_META[status];
}

export function defaultLatestActivity(status: SessionStatus): string {
  if (status === "running") {
    return "Assistant is generating a response";
  }
  if (status === "queued") {
    return "Prompt is queued for processing";
  }
  if (status === "failed") {
    return "Prompt failed";
  }
  return "Waiting for next user input";
}
