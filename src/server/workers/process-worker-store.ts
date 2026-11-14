import type {
  ProcessWorkerChannel,
  ProcessWorkerCommandSummary,
  ProcessWorkerDetail,
  ProcessWorkerLogChunk,
  ProcessWorkerSource,
  ProcessWorkerStatus,
  ProcessWorkerSummary,
} from "../../../client-shared/src/api/workers.js";
import type { GitOperationPhase } from "../../../client-shared/src/api/git-actions.js";

const MAX_WORKERS = 50;
const MAX_WORKER_LOG_CHUNKS = 2_000;
const MAX_WORKER_LOG_CHARS = 500_000;

interface MutableWorkerCommand extends ProcessWorkerCommandSummary {
  status: ProcessWorkerStatus;
  completedAt?: string | undefined;
  exitCode?: number | undefined;
}

interface MutableWorkerRecord {
  id: string;
  title: string;
  projectPath: string;
  phase: GitOperationPhase;
  source: ProcessWorkerSource;
  status: ProcessWorkerStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | undefined;
  error?: string | undefined;
  commandSummary: string;
  outputPreview: string;
  canCancel: boolean;
  commands: MutableWorkerCommand[];
  logs: ProcessWorkerLogChunk[];
  logCharCount: number;
  nextLogId: number;
  nextCommandId: number;
}

export interface ProcessWorkerStore {
  createWorker(params: {
    readonly workerId: string;
    readonly title: string;
    readonly projectPath: string;
    readonly phase: GitOperationPhase;
    readonly source: ProcessWorkerSource;
    readonly canCancel: boolean;
  }): void;
  recordCommandStart(
    workerId: string,
    params: {
      readonly commandText: string;
      readonly cwd: string;
    },
  ): string | null;
  recordCommandOutput(
    workerId: string,
    params: {
      readonly commandId?: string | undefined;
      readonly channel: ProcessWorkerChannel;
      readonly text: string;
    },
  ): void;
  recordCommandExit(
    workerId: string,
    params: {
      readonly commandId: string;
      readonly exitCode: number;
      readonly status: ProcessWorkerStatus;
    },
  ): void;
  completeWorker(
    workerId: string,
    params: {
      readonly status: Exclude<ProcessWorkerStatus, "running">;
      readonly error?: string | undefined;
      readonly canCancel?: boolean | undefined;
    },
  ): void;
  listWorkers(params?: {
    readonly projectPath?: string | undefined;
  }): readonly ProcessWorkerSummary[];
  getWorker(workerId: string): ProcessWorkerDetail | null;
  clear(): void;
}

function createWorkerSummary(
  workerRecord: MutableWorkerRecord,
): ProcessWorkerSummary {
  const workerSummary: ProcessWorkerSummary = {
    id: workerRecord.id,
    title: workerRecord.title,
    projectPath: workerRecord.projectPath,
    phase: workerRecord.phase,
    source: workerRecord.source,
    status: workerRecord.status,
    createdAt: workerRecord.createdAt,
    updatedAt: workerRecord.updatedAt,
    commandSummary: workerRecord.commandSummary,
    outputPreview: workerRecord.outputPreview,
    canCancel: workerRecord.canCancel,
  };

  if (
    workerRecord.completedAt !== undefined &&
    workerRecord.error !== undefined
  ) {
    return {
      ...workerSummary,
      completedAt: workerRecord.completedAt,
      error: workerRecord.error,
    };
  }
  if (workerRecord.completedAt !== undefined) {
    return {
      ...workerSummary,
      completedAt: workerRecord.completedAt,
    };
  }
  if (workerRecord.error !== undefined) {
    return {
      ...workerSummary,
      error: workerRecord.error,
    };
  }

  return workerSummary;
}

function updateWorkerTimestamp(workerRecord: MutableWorkerRecord): void {
  workerRecord.updatedAt = new Date().toISOString();
}

function trimWorkerLogs(workerRecord: MutableWorkerRecord): void {
  while (
    workerRecord.logs.length > MAX_WORKER_LOG_CHUNKS ||
    workerRecord.logCharCount > MAX_WORKER_LOG_CHARS
  ) {
    const removedLog = workerRecord.logs.shift();
    if (removedLog === undefined) {
      break;
    }
    workerRecord.logCharCount = Math.max(
      0,
      workerRecord.logCharCount - removedLog.text.length,
    );
  }
}

function clearCompletedWorkerOverflow(
  workersById: Map<string, MutableWorkerRecord>,
  workerOrder: string[],
): void {
  while (workerOrder.length > MAX_WORKERS) {
    const removableWorkerIndex = workerOrder.findIndex((workerId) => {
      const workerRecord = workersById.get(workerId);
      return workerRecord?.status !== "running";
    });
    if (removableWorkerIndex === -1) {
      break;
    }
    const removableWorkerId = workerOrder.splice(removableWorkerIndex, 1)[0];
    if (removableWorkerId !== undefined) {
      workersById.delete(removableWorkerId);
    }
  }
}

export function createProcessWorkerStore(): ProcessWorkerStore {
  const workersById = new Map<string, MutableWorkerRecord>();
  const workerOrder: string[] = [];

  return {
    createWorker(params): void {
      const now = new Date().toISOString();
      const existingWorkerRecord = workersById.get(params.workerId);
      if (existingWorkerRecord !== undefined) {
        const existingWorkerIndex = workerOrder.indexOf(params.workerId);
        if (existingWorkerIndex !== -1) {
          workerOrder.splice(existingWorkerIndex, 1);
        }
      }

      workersById.set(params.workerId, {
        id: params.workerId,
        title: params.title,
        projectPath: params.projectPath,
        phase: params.phase,
        source: params.source,
        status: "running",
        createdAt: now,
        updatedAt: now,
        commandSummary: "",
        outputPreview: "",
        canCancel: params.canCancel,
        commands: [],
        logs: [],
        logCharCount: 0,
        nextLogId: 1,
        nextCommandId: 1,
      });
      workerOrder.unshift(params.workerId);
      clearCompletedWorkerOverflow(workersById, workerOrder);
    },
    recordCommandStart(workerId, params): string | null {
      const workerRecord = workersById.get(workerId);
      if (workerRecord === undefined) {
        return null;
      }
      const commandId = `cmd-${workerRecord.nextCommandId}`;
      workerRecord.nextCommandId += 1;
      workerRecord.commands.push({
        id: commandId,
        commandText: params.commandText,
        cwd: params.cwd,
        status: "running",
        startedAt: new Date().toISOString(),
      });
      workerRecord.commandSummary = params.commandText;
      updateWorkerTimestamp(workerRecord);
      return commandId;
    },
    recordCommandOutput(workerId, params): void {
      const workerRecord = workersById.get(workerId);
      if (workerRecord === undefined || params.text.length === 0) {
        return;
      }
      workerRecord.logs.push({
        id: workerRecord.nextLogId,
        channel: params.channel,
        text: params.text,
        timestamp: new Date().toISOString(),
        ...(params.commandId !== undefined
          ? { commandId: params.commandId }
          : {}),
      });
      workerRecord.nextLogId += 1;
      workerRecord.logCharCount += params.text.length;
      workerRecord.outputPreview = params.text.trim().length
        ? params.text.trim()
        : workerRecord.outputPreview;
      updateWorkerTimestamp(workerRecord);
      trimWorkerLogs(workerRecord);
    },
    recordCommandExit(workerId, params): void {
      const workerRecord = workersById.get(workerId);
      if (workerRecord === undefined) {
        return;
      }
      const commandRecord = workerRecord.commands.find(
        (workerCommand) => workerCommand.id === params.commandId,
      );
      if (commandRecord === undefined) {
        return;
      }
      commandRecord.status = params.status;
      commandRecord.exitCode = params.exitCode;
      commandRecord.completedAt = new Date().toISOString();
      updateWorkerTimestamp(workerRecord);
    },
    completeWorker(workerId, params): void {
      const workerRecord = workersById.get(workerId);
      if (workerRecord === undefined) {
        return;
      }
      workerRecord.status = params.status;
      if (params.error !== undefined) {
        workerRecord.error = params.error;
      } else {
        delete workerRecord.error;
      }
      workerRecord.completedAt = new Date().toISOString();
      workerRecord.canCancel = params.canCancel ?? false;
      updateWorkerTimestamp(workerRecord);
      clearCompletedWorkerOverflow(workersById, workerOrder);
    },
    listWorkers(params): readonly ProcessWorkerSummary[] {
      const projectPathFilter = params?.projectPath?.trim();
      return workerOrder
        .map((workerId) => workersById.get(workerId))
        .filter(
          (workerRecord): workerRecord is MutableWorkerRecord =>
            workerRecord !== undefined &&
            (projectPathFilter === undefined ||
              projectPathFilter.length === 0 ||
              workerRecord.projectPath === projectPathFilter),
        )
        .map((workerRecord) => createWorkerSummary(workerRecord));
    },
    getWorker(workerId): ProcessWorkerDetail | null {
      const workerRecord = workersById.get(workerId);
      if (workerRecord === undefined) {
        return null;
      }
      return {
        ...createWorkerSummary(workerRecord),
        commands: workerRecord.commands,
        logs: workerRecord.logs,
      };
    },
    clear(): void {
      workersById.clear();
      workerOrder.length = 0;
    },
  };
}

export const processWorkerStore = createProcessWorkerStore();
