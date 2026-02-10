/**
 * Server logger with leveled output.
 *
 * - LOG_LEVEL or QRAFTBOX_LOG_LEVEL controls minimum level (default: info)
 * - Always includes timestamp and level prefix
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function parseLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.toLowerCase().trim();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
}

function safeSerialize(value: Record<string, unknown> | undefined): string {
  if (value === undefined) {
    return "";
  }
  try {
    return ` ${JSON.stringify(value)}`;
  } catch {
    return " {\"context\":\"unserializable\"}";
  }
}

function toErrorRecord(error: unknown): Record<string, unknown> | undefined {
  if (error === undefined) {
    return undefined;
  }
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    };
  }
  return {
    error: String(error),
  };
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void;
}

export function createLogger(component: string): Logger {
  const configuredLevel = parseLogLevel(
    process.env["QRAFTBOX_LOG_LEVEL"] ?? process.env["LOG_LEVEL"],
  );

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
  }

  function emit(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formatted = `${timestamp} [${level.toUpperCase()}] [${component}] ${message}${safeSerialize(context)}`;

    if (level === "error") {
      console.error(formatted);
      return;
    }
    if (level === "warn") {
      console.warn(formatted);
      return;
    }
    if (level === "debug") {
      console.debug(formatted);
      return;
    }

    console.log(formatted);
  }

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      emit("debug", message, context);
    },
    info(message: string, context?: Record<string, unknown>): void {
      emit("info", message, context);
    },
    warn(message: string, context?: Record<string, unknown>): void {
      emit("warn", message, context);
    },
    error(
      message: string,
      error?: unknown,
      context?: Record<string, unknown>,
    ): void {
      emit("error", message, {
        ...context,
        ...toErrorRecord(error),
      });
    },
  };
}
