/**
 * Session Manager
 *
 * Manages AI sessions including queueing, execution, and streaming.
 * Integrates with claude-code-agent library (stubbed for now).
 */

import type {
  AIPromptRequest,
  AISessionSubmitResult,
  QueueStatus,
  AIProgressEvent,
  AISessionInfo,
  SessionState,
  AIConfig,
} from "../../types/ai";
import { DEFAULT_AI_CONFIG } from "../../types/ai";
import { buildPromptWithContext } from "./prompt-builder";
import type { QraftBoxToolRegistry } from "../tools/registry.js";
import {
  ClaudeCodeToolAgent,
  type ToolAgentSession,
} from "../../../../claude-code-agent/src/sdk/index.js";

/**
 * Internal session representation
 */
interface InternalSession {
  id: string;
  state: SessionState;
  prompt: string;
  fullPrompt: string;
  request: AIPromptRequest;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastAssistantMessage?: string;
  listeners: Set<(event: AIProgressEvent) => void>;
  abortController?: AbortController;
  toolAgentSession?: ToolAgentSession;
  claudeAgent?: ClaudeCodeToolAgent;
}

/**
 * Session manager interface
 */
export interface SessionManager {
  /**
   * Submit a prompt for execution (immediate or queued)
   */
  submit(request: AIPromptRequest): Promise<AISessionSubmitResult>;

  /**
   * Cancel a session
   */
  cancel(sessionId: string): Promise<void>;

  /**
   * Get queue status for UI
   */
  getQueueStatus(): QueueStatus;

  /**
   * Get session info
   */
  getSession(sessionId: string): AISessionInfo | null;

  /**
   * List all sessions
   */
  listSessions(): readonly AISessionInfo[];

  /**
   * Subscribe to session progress events
   */
  subscribe(
    sessionId: string,
    listener: (event: AIProgressEvent) => void,
  ): () => void;

  /**
   * Clean up completed/failed sessions
   */
  cleanup(): void;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Create a progress event
 */
function createProgressEvent(
  type: AIProgressEvent["type"],
  sessionId: string,
  data: AIProgressEvent["data"] = {},
): AIProgressEvent {
  return {
    type,
    sessionId,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Convert internal session to public session info
 */
function toSessionInfo(session: InternalSession): AISessionInfo {
  return {
    id: session.id,
    state: session.state,
    prompt: session.prompt,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    completedAt: session.completedAt?.toISOString(),
    context: session.request.context,
    lastAssistantMessage: session.lastAssistantMessage,
  };
}

/**
 * Create a session manager
 *
 * @param config - AI configuration
 * @returns Session manager instance
 */
export function createSessionManager(
  config: AIConfig = DEFAULT_AI_CONFIG,
  toolRegistry?: QraftBoxToolRegistry | undefined,
): SessionManager {
  const sessions = new Map<string, InternalSession>();
  const queue: string[] = [];
  let runningCount = 0;

  /**
   * Emit event to session listeners
   */
  function emitEvent(sessionId: string, event: AIProgressEvent): void {
    const session = sessions.get(sessionId);
    if (session !== undefined) {
      for (const listener of session.listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  /**
   * Execute a session with real claude-code-agent integration
   */
  async function executeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (session === undefined) return;

    session.state = "running";
    session.startedAt = new Date();
    runningCount++;

    // Emit session started event
    emitEvent(sessionId, createProgressEvent("session_started", sessionId));

    try {
      // If toolRegistry is available, use real ClaudeCodeToolAgent
      if (toolRegistry !== undefined) {
        // Create ClaudeCodeToolAgent with tool registry
        const allowedToolNames = [...toolRegistry.getAllowedToolNames()];
        const mcpServerConfig = toolRegistry.toMcpServerConfig();

        const agent = new ClaudeCodeToolAgent({
          cwd: session.request.options.projectPath,
          mcpServers: {
            "qraftbox-tools": mcpServerConfig as any,
          },
          allowedTools: allowedToolNames,
          permissionMode: "bypassPermissions",
        });

        session.claudeAgent = agent;

        // Start or resume session
        const resumeSessionId = session.request.options.resumeSessionId;
        const toolAgentSession =
          resumeSessionId !== undefined
            ? await agent.resumeSession(resumeSessionId, session.fullPrompt)
            : await agent.startSession({ prompt: session.fullPrompt });

        session.toolAgentSession = toolAgentSession;

        // Session started

        // Listen for events
        toolAgentSession.on("message", (msg: unknown) => {
          // Extract role and content from message
          // CLI stream-json format: { type: "assistant", message: { role: "assistant", content: [{type:"text",text:"..."}] } }
          if (typeof msg === "object" && msg !== null && "type" in msg) {
            const rawMsg = msg as { type?: string; message?: { role?: string; content?: unknown }; content?: unknown };
            const msgType = rawMsg.type;

            // Only capture assistant messages for lastAssistantMessage
            if (msgType !== "assistant") return;

            // Extract text content from CLI message format
            let content: string | undefined;
            const nestedContent = rawMsg.message?.content;
            if (typeof nestedContent === "string") {
              content = nestedContent;
            } else if (Array.isArray(nestedContent)) {
              // Content blocks: [{ type: "text", text: "..." }, ...]
              const textParts: string[] = [];
              for (const block of nestedContent) {
                if (typeof block === "object" && block !== null && "text" in block && typeof (block as { text: unknown }).text === "string") {
                  textParts.push((block as { text: string }).text);
                }
              }
              content = textParts.join("\n");
            } else if (typeof rawMsg.content === "string") {
              content = rawMsg.content;
            }

            if (content !== undefined && content.length > 0) {
              session.lastAssistantMessage = content;
              emitEvent(
                sessionId,
                createProgressEvent("message", sessionId, {
                  role: "assistant",
                  content,
                }),
              );
            }
          }
        });

        toolAgentSession.on("toolCall", (call: unknown) => {
          // Extract tool name and input
          if (typeof call === "object" && call !== null) {
            const toolCall = call as {
              name?: string;
              input?: Record<string, unknown>;
            };
            const toolName =
              typeof toolCall.name === "string" ? toolCall.name : "unknown";
            const input =
              typeof toolCall.input === "object" && toolCall.input !== null
                ? toolCall.input
                : {};
            emitEvent(
              sessionId,
              createProgressEvent("tool_use", sessionId, {
                toolName,
                input,
              }),
            );
          }
        });

        toolAgentSession.on("toolResult", (result: unknown) => {
          // Extract tool result data
          if (typeof result === "object" && result !== null) {
            const toolResult = result as {
              name?: string;
              output?: unknown;
              isError?: boolean;
            };
            const toolName =
              typeof toolResult.name === "string" ? toolResult.name : "unknown";
            const isError =
              typeof toolResult.isError === "boolean"
                ? toolResult.isError
                : false;
            emitEvent(
              sessionId,
              createProgressEvent("tool_result", sessionId, {
                toolName,
                output: toolResult.output,
                isError,
              }),
            );
          }
        });

        toolAgentSession.on("error", (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          emitEvent(
            sessionId,
            createProgressEvent("error", sessionId, {
              message: errorMessage,
            }),
          );
        });

        // Iterate messages until completion
        let msgCount = 0;
        for await (const _msg of toolAgentSession.messages()) {
          msgCount++;
          // Check if cancelled
          const currentSession = sessions.get(sessionId);
          if (
            currentSession === undefined ||
            currentSession.state === "cancelled"
          ) {
            break;
          }
        }

        // Wait for completion
        const sessionResult = await toolAgentSession.waitForCompletion();

        // Mark as completed or failed
        if (sessionResult.success) {
          session.state = "completed";
        } else {
          session.state = "failed";
          if (sessionResult.error !== undefined) {
            emitEvent(
              sessionId,
              createProgressEvent("error", sessionId, {
                message: sessionResult.error.message,
              }),
            );
          }
        }
        session.completedAt = new Date();

        // Clean up agent
        await agent.close();

        emitEvent(
          sessionId,
          createProgressEvent(
            session.state === "completed" ? "completed" : "error",
            sessionId,
          ),
        );
      } else {
        // Fallback to stubbed behavior if toolRegistry is undefined
        emitEvent(sessionId, createProgressEvent("thinking", sessionId));

        await new Promise((resolve) => setTimeout(resolve, 100));

        const currentSession = sessions.get(sessionId);
        if (
          currentSession === undefined ||
          currentSession.state === "cancelled"
        ) {
          return;
        }

        const stubbedContent =
          "[AI Integration Stubbed] Tool registry not provided. The full prompt was:\n\n" +
          session.fullPrompt.slice(0, 500) +
          (session.fullPrompt.length > 500 ? "..." : "");
        session.lastAssistantMessage = stubbedContent;

        emitEvent(
          sessionId,
          createProgressEvent("message", sessionId, {
            role: "assistant",
            content: stubbedContent,
          }),
        );

        session.state = "completed";
        session.completedAt = new Date();

        emitEvent(sessionId, createProgressEvent("completed", sessionId));
      }
    } catch (e) {
      session.state = "failed";
      session.completedAt = new Date();

      const errorMessage = e instanceof Error ? e.message : "Session failed";
      emitEvent(
        sessionId,
        createProgressEvent("error", sessionId, {
          message: errorMessage,
        }),
      );
    } finally {
      runningCount--;
      processQueue();
    }
  }

  /**
   * Process the queue - start next session if capacity available
   */
  function processQueue(): void {
    while (runningCount < config.maxConcurrent && queue.length > 0) {
      const nextSessionId = queue.shift();
      if (nextSessionId !== undefined) {
        const session = sessions.get(nextSessionId);
        if (session !== undefined && session.state === "queued") {
          // Don't await - run in background
          executeSession(nextSessionId).catch(() => {
            // Errors handled in executeSession
          });
        }
      }
    }
  }

  return {
    async submit(request: AIPromptRequest): Promise<AISessionSubmitResult> {
      if (!config.enabled) {
        throw new Error("AI features are disabled");
      }

      const sessionId = generateSessionId();
      const fullPrompt = buildPromptWithContext(request);

      const session: InternalSession = {
        id: sessionId,
        state: "queued",
        prompt: request.prompt,
        fullPrompt,
        request,
        createdAt: new Date(),
        listeners: new Set(),
      };

      sessions.set(sessionId, session);

      // Immediate execution or queue
      if (request.options.immediate && runningCount < config.maxConcurrent) {
        // Start immediately
        executeSession(sessionId).catch(() => {
          // Errors handled in executeSession
        });

        return {
          sessionId,
          immediate: true,
        };
      } else {
        // Add to queue
        if (queue.length >= config.maxQueueSize) {
          sessions.delete(sessionId);
          throw new Error(
            `Queue is full (max ${config.maxQueueSize} sessions)`,
          );
        }

        queue.push(sessionId);
        const queuePosition = queue.indexOf(sessionId) + 1;

        // Try to process queue in case there's capacity
        processQueue();

        return {
          sessionId,
          queuePosition,
          immediate: false,
        };
      }
    },

    async cancel(sessionId: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.state === "completed" || session.state === "cancelled") {
        return; // Already done
      }

      // Remove from queue if queued
      const queueIndex = queue.indexOf(sessionId);
      if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
      }

      // Cancel ToolAgentSession if available
      if (session.toolAgentSession !== undefined) {
        await session.toolAgentSession.cancel();
      }

      // Abort if running (fallback for old abort controller)
      if (session.abortController !== undefined) {
        session.abortController.abort();
      }

      session.state = "cancelled";
      session.completedAt = new Date();

      emitEvent(sessionId, createProgressEvent("cancelled", sessionId));
    },

    getQueueStatus(): QueueStatus {
      const runningSessionIds: string[] = [];
      for (const session of sessions.values()) {
        if (session.state === "running") {
          runningSessionIds.push(session.id);
        }
      }

      return {
        runningCount,
        queuedCount: queue.length,
        runningSessionIds,
        totalCount: runningCount + queue.length,
      };
    },

    getSession(sessionId: string): AISessionInfo | null {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return null;
      }
      return toSessionInfo(session);
    },

    listSessions(): readonly AISessionInfo[] {
      return Array.from(sessions.values()).map(toSessionInfo);
    },

    subscribe(
      sessionId: string,
      listener: (event: AIProgressEvent) => void,
    ): () => void {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        // Return no-op unsubscribe
        return () => {};
      }

      session.listeners.add(listener);

      // Return unsubscribe function
      return () => {
        session.listeners.delete(listener);
      };
    },

    cleanup(): void {
      const now = Date.now();
      const maxAge = config.sessionTimeoutMs;

      for (const [id, session] of sessions.entries()) {
        // Remove completed/failed/cancelled sessions older than maxAge
        if (
          session.state === "completed" ||
          session.state === "failed" ||
          session.state === "cancelled"
        ) {
          const age = now - session.createdAt.getTime();
          if (age > maxAge) {
            sessions.delete(id);
          }
        }
      }
    },
  };
}
