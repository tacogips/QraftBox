import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  createTerminalApiClient,
  type TerminalConnectResponse,
} from "../../../../client-shared/src/api/terminal";
import {
  appendTerminalOutput,
  buildTerminalWebSocketUrl,
  parseTerminalServerMessage,
} from "./state";

export interface TerminalScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
}

const DEFAULT_TERMINAL_HEIGHT = 480;
const MIN_TERMINAL_HEIGHT = 320;
const MAX_TERMINAL_HEIGHT = 920;

function createDisconnectedMessage(contextId: string): string {
  return `[terminal ready for ${contextId}]\n`;
}

function clampTerminalHeight(height: number): number {
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(MAX_TERMINAL_HEIGHT, height));
}

export function TerminalScreen(props: TerminalScreenProps): JSX.Element {
  const terminalApi = createTerminalApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [output, setOutput] = createSignal("");
  const [inputValue, setInputValue] = createSignal("");
  const [isCheckingStatus, setIsCheckingStatus] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [isConnected, setIsConnected] = createSignal(false);
  const [connectionError, setConnectionError] = createSignal<string | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = createSignal<string | null>(
    null,
  );
  const [terminalHeight, setTerminalHeight] = createSignal(
    DEFAULT_TERMINAL_HEIGHT,
  );

  let activeSocket: WebSocket | null = null;
  let activeContextId: string | null = null;
  let terminalViewportRef: HTMLPreElement | undefined;

  function disposeSocket(): void {
    if (activeSocket === null) {
      return;
    }

    activeSocket.onopen = null;
    activeSocket.onmessage = null;
    activeSocket.onerror = null;
    activeSocket.onclose = null;
    activeSocket.close();
    activeSocket = null;
  }

  function resetForContext(contextId: string | null): void {
    disposeSocket();
    activeContextId = contextId;
    setIsCheckingStatus(false);
    setIsConnecting(false);
    setIsConnected(false);
    setConnectionError(null);
    setActiveSessionId(null);
    setInputValue("");
    setTerminalHeight(DEFAULT_TERMINAL_HEIGHT);
    setOutput(contextId === null ? "" : createDisconnectedMessage(contextId));
  }

  function attachSocket(
    contextId: string,
    connectResponse: TerminalConnectResponse,
  ): void {
    const socket = new WebSocket(
      buildTerminalWebSocketUrl(connectResponse, window.location),
    );
    activeSocket = socket;

    socket.onopen = () => {
      if (activeContextId !== contextId) {
        socket.close();
        return;
      }

      setIsConnecting(false);
      setIsConnected(true);
      setOutput((currentOutput) =>
        appendTerminalOutput(
          currentOutput,
          `[connected${connectResponse.reused ? " (reused session)" : ""} ${connectResponse.sessionId}]\n`,
        ),
      );
    };

    socket.onmessage = (event) => {
      if (activeContextId !== contextId) {
        return;
      }

      const serverMessage = parseTerminalServerMessage(String(event.data));
      if (serverMessage === null) {
        return;
      }

      if (serverMessage.type === "output") {
        setOutput((currentOutput) =>
          appendTerminalOutput(currentOutput, serverMessage.data),
        );
        return;
      }

      if (serverMessage.type === "exit") {
        setIsConnected(false);
        setActiveSessionId(null);
        setOutput((currentOutput) =>
          appendTerminalOutput(
            currentOutput,
            `\n[terminal exited with code ${serverMessage.code}]\n`,
          ),
        );
        return;
      }

      if (serverMessage.type === "error") {
        setConnectionError(serverMessage.message);
        setOutput((currentOutput) =>
          appendTerminalOutput(
            currentOutput,
            `\n[error] ${serverMessage.message}\n`,
          ),
        );
      }
    };

    socket.onerror = () => {
      if (activeContextId !== contextId) {
        return;
      }

      setConnectionError("Terminal WebSocket error");
    };

    socket.onclose = () => {
      if (activeSocket === socket) {
        activeSocket = null;
      }

      if (activeContextId !== contextId) {
        return;
      }

      setIsConnecting(false);
      setIsConnected(false);
      setActiveSessionId(null);
    };
  }

  async function connect(reusedFromStatus = false): Promise<void> {
    const contextId = props.contextId;
    if (contextId === null || isConnecting() || isConnected()) {
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const connectResponse = await terminalApi.connect(contextId);
      if (activeContextId !== contextId) {
        return;
      }

      setActiveSessionId(connectResponse.sessionId);
      if (!reusedFromStatus) {
        setOutput((currentOutput) =>
          appendTerminalOutput(currentOutput, "[opening terminal session]\n"),
        );
      }
      attachSocket(contextId, connectResponse);
    } catch (error) {
      if (activeContextId !== contextId) {
        return;
      }

      setIsConnecting(false);
      setIsConnected(false);
      setActiveSessionId(null);
      setConnectionError(
        error instanceof Error ? error.message : "Failed to connect terminal",
      );
    }
  }

  async function tryResumeExistingSession(contextId: string): Promise<void> {
    setIsCheckingStatus(true);
    setConnectionError(null);

    try {
      const status = await terminalApi.fetchStatus(contextId);
      if (activeContextId !== contextId || !status.hasSession) {
        return;
      }

      await connect(true);
    } catch (error) {
      if (activeContextId !== contextId) {
        return;
      }

      setConnectionError(
        error instanceof Error
          ? error.message
          : "Failed to fetch terminal status",
      );
    } finally {
      if (activeContextId === contextId) {
        setIsCheckingStatus(false);
      }
    }
  }

  async function disconnect(): Promise<void> {
    const contextId = props.contextId;
    if (contextId === null) {
      resetForContext(null);
      return;
    }

    try {
      await terminalApi.disconnect(contextId);
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Failed to disconnect terminal",
      );
    } finally {
      resetForContext(contextId);
    }
  }

  function sendInput(text: string): void {
    if (activeSocket === null || activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    activeSocket.send(
      JSON.stringify({
        type: "input",
        data: text,
      }),
    );
  }

  async function handleSubmit(): Promise<void> {
    const normalizedInput = inputValue();
    if (normalizedInput.length === 0) {
      return;
    }

    sendInput(`${normalizedInput}\n`);
    setInputValue("");
  }

  function resizeTerminal(delta: number): void {
    setTerminalHeight((currentHeight) =>
      clampTerminalHeight(currentHeight + delta),
    );
  }

  createEffect(() => {
    output();
    queueMicrotask(() => {
      terminalViewportRef?.scrollTo({
        top: terminalViewportRef.scrollHeight,
      });
    });
  });

  onMount(() => {
    resetForContext(props.contextId);
  });

  createEffect(() => {
    resetForContext(props.contextId);

    if (props.contextId !== null) {
      void tryResumeExistingSession(props.contextId);
    }
  });

  onCleanup(() => {
    disposeSocket();
  });

  return (
    <section class="flex min-h-0 flex-1 flex-col gap-4">
      <header class="grid gap-3 md:grid-cols-3">
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-5 shadow-lg shadow-black/15 md:col-span-2">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-fg">
            Terminal
          </p>
          <h2 class="mt-2 text-2xl font-semibold text-text-primary">
            Workspace Shell
          </h2>
          <p class="mt-2 text-sm leading-6 text-text-secondary">
            Keep an attached backend shell session open inside the workspace,
            with reconnect, quick interrupt, and a denser terminal surface than
            the old migration placeholder.
          </p>
        </div>
        <div class="rounded-2xl border border-border-default bg-bg-secondary p-5">
          <p class="text-xs uppercase tracking-[0.22em] text-text-tertiary">
            Connection
          </p>
          <p class="mt-3 text-lg font-semibold text-text-primary">
            {isConnected()
              ? "Connected"
              : isConnecting()
                ? "Connecting"
                : isCheckingStatus()
                  ? "Checking"
                  : "Disconnected"}
          </p>
          <Show when={activeSessionId() !== null}>
            <p class="mt-2 break-all font-mono text-xs text-text-secondary">
              {activeSessionId()}
            </p>
          </Show>
          <Show when={connectionError() !== null}>
            <p class="mt-3 text-sm text-danger-fg">{connectionError()}</p>
          </Show>
        </div>
      </header>

      <Show
        when={props.contextId !== null}
        fallback={
          <div class="flex min-h-[420px] items-center justify-center rounded-2xl border border-border-default bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            Open a project tab to start a terminal session.
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border border-border-default bg-bg-secondary p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isConnecting() || props.contextId === null}
                class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-semibold text-text-on-emphasis transition hover:bg-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void connect()}
              >
                {isConnected() ? "Connected" : "Connect"}
              </button>
              <button
                type="button"
                disabled={!isConnected()}
                class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void disconnect()}
              >
                Disconnect
              </button>
              <button
                type="button"
                disabled={!isConnected()}
                class="rounded-md border border-border-default bg-bg-primary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => sendInput("\u0003")}
              >
                Send Ctrl+C
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-xs font-medium text-text-primary transition hover:bg-bg-hover"
                onClick={() => resizeTerminal(120)}
              >
                Taller
              </button>
              <button
                type="button"
                class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-xs font-medium text-text-primary transition hover:bg-bg-hover"
                onClick={() => resizeTerminal(-120)}
              >
                Shorter
              </button>
              <button
                type="button"
                class="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-xs font-medium text-text-primary transition hover:bg-bg-hover"
                onClick={() => setTerminalHeight(DEFAULT_TERMINAL_HEIGHT)}
              >
                Reset height
              </button>
            </div>
          </div>

          <Show
            when={isConnected() || isConnecting()}
            fallback={
              <div class="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-dashed border-border-default bg-bg-primary/50 p-6 text-center">
                <div>
                  <button
                    type="button"
                    class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-semibold text-text-on-emphasis transition hover:bg-accent-fg"
                    onClick={() => void connect()}
                  >
                    Connect
                  </button>
                  <Show when={connectionError() !== null}>
                    <p class="mt-4 text-sm text-danger-fg">
                      {connectionError()}
                    </p>
                  </Show>
                </div>
              </div>
            }
          >
            <div class="flex min-h-0 flex-1 flex-col gap-3">
              <div
                class="overflow-hidden rounded-xl border border-border-default bg-[#020817] shadow-inner shadow-black/30"
                style={{
                  height: `${terminalHeight()}px`,
                }}
              >
                <pre
                  ref={terminalViewportRef}
                  class="h-full overflow-auto px-4 py-4 font-mono text-[13px] leading-6 text-slate-100"
                >
                  {output()}
                </pre>
              </div>
              <Show when={activeSessionId() !== null}>
                <p class="text-xs text-text-tertiary">
                  session: {activeSessionId()}
                </p>
              </Show>
            </div>
          </Show>

          <div class="rounded-xl border border-border-default bg-bg-primary p-4">
            <label class="flex flex-col gap-3 text-sm text-text-secondary">
              Command input
              <div class="flex flex-col gap-3 lg:flex-row">
                <input
                  value={inputValue()}
                  disabled={!isConnected()}
                  class="min-w-0 flex-1 rounded-md border border-border-default bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent-emphasis disabled:cursor-not-allowed disabled:opacity-60"
                  onInput={(event) => setInputValue(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!isConnected() || inputValue().length === 0}
                  class="rounded-md bg-accent-emphasis px-4 py-2 text-sm font-semibold text-text-on-emphasis transition hover:bg-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleSubmit()}
                >
                  Send
                </button>
              </div>
            </label>
          </div>
        </div>
      </Show>
    </section>
  );
}
