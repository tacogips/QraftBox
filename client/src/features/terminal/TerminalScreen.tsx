import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
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

function createDisconnectedMessage(contextId: string): string {
  return `[terminal ready for ${contextId}]\n`;
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

  let activeSocket: WebSocket | null = null;
  let activeContextId: string | null = null;

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
    <section>
      <h2>Terminal</h2>
      <p>
        Open a workspace terminal, reconnect to an existing session, and send
        shell input through the current backend session.
      </p>
      <Show
        when={props.contextId !== null}
        fallback={<p>Open a project tab to start a terminal session.</p>}
      >
        <p>
          Status:{" "}
          <strong>
            {isConnected()
              ? "connected"
              : isConnecting()
                ? "connecting"
                : isCheckingStatus()
                  ? "checking"
                  : "disconnected"}
          </strong>
        </p>
        <Show when={activeSessionId() !== null}>
          <p>Session: {activeSessionId()}</p>
        </Show>
        <div>
          <button
            type="button"
            disabled={isConnecting() || props.contextId === null}
            onClick={() => void connect()}
          >
            {isConnected() ? "Connected" : "Connect"}
          </button>{" "}
          <button
            type="button"
            disabled={!isConnected()}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>{" "}
          <button
            type="button"
            disabled={!isConnected()}
            onClick={() => sendInput("\u0003")}
          >
            Send Ctrl+C
          </button>
        </div>
        <Show when={connectionError() !== null}>
          <p role="alert">{connectionError()}</p>
        </Show>
        <label>
          Command input
          <input
            value={inputValue()}
            disabled={!isConnected()}
            onInput={(event) => setInputValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </label>{" "}
        <button
          type="button"
          disabled={!isConnected() || inputValue().length === 0}
          onClick={() => void handleSubmit()}
        >
          Send
        </button>
        <pre>{output()}</pre>
      </Show>
    </section>
  );
}
