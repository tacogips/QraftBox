import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  createTerminalApiClient,
  type TerminalConnectResponse,
} from "../../../../client-shared/src/api/terminal";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ToolbarIconButton } from "../../components/ToolbarIconButton";
import { buildTerminalWebSocketUrl, parseTerminalServerMessage } from "./state";

export interface TerminalScreenProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
}

interface TerminalDimensions {
  readonly rows: number;
  readonly cols: number;
}

const DEFAULT_TERMINAL_HEIGHT = 480;
const PHONE_TERMINAL_HEIGHT_RATIO = 0.55;
const PHONE_INITIAL_HEIGHT_RATIO = 0.96;
const DESKTOP_INITIAL_HEIGHT_RATIO = 0.75;
const PHONE_MIN_TERMINAL_HEIGHT = 160;
const DESKTOP_MIN_TERMINAL_HEIGHT = 220;

function detectPhoneViewport(): boolean {
  return window.innerWidth <= 768;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

export function TerminalScreen(props: TerminalScreenProps): JSX.Element {
  const terminalApi = createTerminalApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });

  const [isCheckingStatus, setIsCheckingStatus] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [isConnected, setIsConnected] = createSignal(false);
  const [connectionError, setConnectionError] = createSignal<string | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = createSignal<string | null>(
    null,
  );
  const [isPhoneViewport, setIsPhoneViewport] = createSignal(false);
  const [terminalHeightPx, setTerminalHeightPx] = createSignal<number | null>(
    null,
  );

  let activeSocket: WebSocket | null = null;
  let activeContextId: string | null = null;
  let terminalInstance: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let terminalHostRef: HTMLDivElement | undefined;
  let terminalContainerRef: HTMLDivElement | undefined;
  let terminalControlsRef: HTMLDivElement | undefined;
  let terminalResizeHandleRef: HTMLDivElement | undefined;
  let terminalSessionMetaRef: HTMLParagraphElement | undefined;
  let isResizingTerminal = false;
  let terminalDragStartY = 0;
  let terminalDragStartHeightPx = 0;
  let lastObservedContextId: string | null | undefined = undefined;
  let pendingTerminalOutputChunks: string[] = [];

  function disposeSocket(): void {
    if (activeSocket === null) {
      return;
    }

    activeSocket.onopen = null;
    activeSocket.onmessage = null;
    activeSocket.onerror = null;
    activeSocket.onclose = null;
    if (
      activeSocket.readyState === WebSocket.OPEN ||
      activeSocket.readyState === WebSocket.CONNECTING
    ) {
      activeSocket.close();
    }
    activeSocket = null;
  }

  function stopTerminalResizeDrag(): void {
    isResizingTerminal = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleTerminalResizeMouseMove);
    window.removeEventListener("mouseup", handleTerminalResizeMouseUp);
  }

  function disposeTerminalResources(): void {
    stopTerminalResizeDrag();
    disposeSocket();

    terminalInstance?.dispose();
    terminalInstance = null;
    fitAddon = null;
    pendingTerminalOutputChunks = [];

    setIsCheckingStatus(false);
    setIsConnecting(false);
    setIsConnected(false);
    setActiveSessionId(null);
    setTerminalHeightPx(null);
  }

  function hostHasMountedTerminal(): boolean {
    return terminalHostRef?.querySelector(".xterm") !== null;
  }

  function ensureTerminalInitialized(): void {
    if (terminalHostRef === undefined) {
      return;
    }

    if (terminalInstance !== null && hostHasMountedTerminal()) {
      return;
    }

    if (terminalInstance !== null) {
      terminalInstance.dispose();
      terminalInstance = null;
      fitAddon = null;
    }

    const createdTerminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 5_000,
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#93c5fd",
      },
    });
    const createdFitAddon = new FitAddon();

    createdTerminal.loadAddon(createdFitAddon);
    createdTerminal.open(terminalHostRef);
    createdFitAddon.fit();
    createdTerminal.onData((typedData) => {
      if (activeSocket === null || activeSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      activeSocket.send(
        JSON.stringify({
          type: "input",
          data: typedData,
        }),
      );
    });

    terminalInstance = createdTerminal;
    fitAddon = createdFitAddon;
    flushPendingTerminalOutput();
  }

  function writeTerminalOutput(outputChunk: string): void {
    if (terminalInstance === null) {
      pendingTerminalOutputChunks.push(outputChunk);
      return;
    }

    terminalInstance.write(outputChunk);
  }

  function flushPendingTerminalOutput(): void {
    if (terminalInstance === null || pendingTerminalOutputChunks.length === 0) {
      return;
    }

    for (const pendingOutputChunk of pendingTerminalOutputChunks) {
      terminalInstance.write(pendingOutputChunk);
    }
    pendingTerminalOutputChunks = [];
  }

  function focusTerminal(): void {
    terminalInstance?.focus();
  }

  function sendResize(dimensions: TerminalDimensions): void {
    if (activeSocket === null || activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    activeSocket.send(
      JSON.stringify({
        type: "resize",
        rows: dimensions.rows,
        cols: dimensions.cols,
      }),
    );
  }

  function fitAndResizeTerminal(): void {
    if (fitAddon === null || terminalInstance === null) {
      return;
    }

    fitAddon.fit();
    const terminalDimensions = fitAddon.proposeDimensions();
    if (terminalDimensions !== undefined) {
      sendResize(terminalDimensions);
    }
  }

  function getMinimumTerminalHeightPx(): number {
    return isPhoneViewport()
      ? PHONE_MIN_TERMINAL_HEIGHT
      : DESKTOP_MIN_TERMINAL_HEIGHT;
  }

  function getMaxTerminalHeightPx(): number {
    const minimumTerminalHeightPx = getMinimumTerminalHeightPx();
    if (terminalContainerRef === undefined) {
      return Math.max(
        minimumTerminalHeightPx,
        Math.floor(window.innerHeight * 0.8),
      );
    }

    const controlsHeightPx = terminalControlsRef?.offsetHeight ?? 0;
    const resizeHandleHeightPx = terminalResizeHandleRef?.offsetHeight ?? 0;
    const rowGapValue = window.getComputedStyle(terminalContainerRef).rowGap;
    const rowGapPx = Number.parseFloat(rowGapValue);
    const safeRowGapPx = Number.isFinite(rowGapPx) ? rowGapPx : 0;
    const reservedInsideContainerPx =
      controlsHeightPx + resizeHandleHeightPx + safeRowGapPx * 2;
    const sessionMetaHeightPx =
      terminalSessionMetaRef !== undefined
        ? terminalSessionMetaRef.offsetHeight + 8
        : 0;
    const parentHeightPx =
      terminalContainerRef.parentElement?.clientHeight ?? window.innerHeight;

    return Math.max(
      minimumTerminalHeightPx,
      parentHeightPx - sessionMetaHeightPx - reservedInsideContainerPx,
    );
  }

  function clampTerminalHeight(heightPx: number): number {
    return Math.max(
      getMinimumTerminalHeightPx(),
      Math.min(getMaxTerminalHeightPx(), heightPx),
    );
  }

  function ensureTerminalHeight(): void {
    if (terminalHeightPx() !== null) {
      return;
    }

    const initialRatio = isPhoneViewport()
      ? PHONE_INITIAL_HEIGHT_RATIO
      : DESKTOP_INITIAL_HEIGHT_RATIO;
    setTerminalHeightPx(
      clampTerminalHeight(Math.floor(getMaxTerminalHeightPx() * initialRatio)),
    );
  }

  function resizeTerminalHeight(deltaPx: number): void {
    ensureTerminalHeight();
    const currentHeightPx = terminalHeightPx();
    if (currentHeightPx === null) {
      return;
    }

    setTerminalHeightPx(clampTerminalHeight(currentHeightPx + deltaPx));
    window.requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function resetTerminalHeight(): void {
    setTerminalHeightPx(null);
    ensureTerminalHeight();
    window.requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function handleTerminalResizeMouseDown(mouseEvent: MouseEvent): void {
    mouseEvent.preventDefault();
    ensureTerminalHeight();

    const currentHeightPx = terminalHeightPx();
    if (currentHeightPx === null) {
      return;
    }

    isResizingTerminal = true;
    terminalDragStartY = mouseEvent.clientY;
    terminalDragStartHeightPx = currentHeightPx;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleTerminalResizeMouseMove);
    window.addEventListener("mouseup", handleTerminalResizeMouseUp);
  }

  function handleTerminalResizeMouseMove(mouseEvent: MouseEvent): void {
    if (!isResizingTerminal) {
      return;
    }

    const deltaPx = mouseEvent.clientY - terminalDragStartY;
    setTerminalHeightPx(
      clampTerminalHeight(terminalDragStartHeightPx + deltaPx),
    );
    window.requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function handleTerminalResizeMouseUp(): void {
    stopTerminalResizeDrag();
  }

  function handleServerMessage(payload: string): void {
    const serverMessage = parseTerminalServerMessage(payload);
    if (serverMessage === null) {
      return;
    }

    if (serverMessage.type === "output") {
      writeTerminalOutput(serverMessage.data);
      return;
    }

    if (serverMessage.type === "exit") {
      writeTerminalOutput(
        `\r\n\r\n[terminal exited with code ${serverMessage.code}]\r\n`,
      );
      setIsConnected(false);
      setActiveSessionId(null);
      return;
    }

    if (serverMessage.type === "error") {
      writeTerminalOutput(`\r\n[error] ${serverMessage.message}\r\n`);
      setConnectionError(serverMessage.message);
    }
  }

  async function connect(): Promise<void> {
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
      await nextAnimationFrame();
      await nextAnimationFrame();
      ensureTerminalInitialized();

      if (terminalInstance === null) {
        throw new Error("Terminal UI could not be initialized");
      }

      terminalInstance.reset();
      terminalInstance.writeln(
        `[connected to ${contextId} in ${new Date().toLocaleTimeString()}]`,
      );

      attachSocket(contextId, connectResponse);
    } catch (error) {
      if (activeContextId !== contextId) {
        return;
      }

      setIsConnecting(false);
      setIsConnected(false);
      setActiveSessionId(null);
      setConnectionError(
        error instanceof Error ? error.message : "Terminal connection failed",
      );
    }
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
      window.requestAnimationFrame(() => {
        ensureTerminalInitialized();
        ensureTerminalHeight();
        fitAndResizeTerminal();
        focusTerminal();
      });
    };

    socket.onmessage = (messageEvent) => {
      if (activeContextId !== contextId) {
        return;
      }

      handleServerMessage(String(messageEvent.data));
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

  async function tryResumeExistingSession(contextId: string): Promise<void> {
    if (isConnecting() || isConnected() || isCheckingStatus()) {
      return;
    }

    setIsCheckingStatus(true);
    try {
      const status = await terminalApi.fetchStatus(contextId);
      if (activeContextId !== contextId || !status.hasSession) {
        return;
      }

      await connect();
    } catch {
      // Ignore background status failures to preserve reconnect behavior.
    } finally {
      if (activeContextId === contextId) {
        setIsCheckingStatus(false);
      }
    }
  }

  async function disconnect(): Promise<void> {
    const contextId = props.contextId;
    if (contextId === null || isConnecting()) {
      return;
    }

    try {
      await terminalApi.disconnect(contextId);
    } catch {
      // Ignore network errors; local terminal resources still need cleanup.
    } finally {
      disposeTerminalResources();
      setConnectionError(null);
    }
  }

  onMount(() => {
    const handleWindowResize = (): void => {
      setIsPhoneViewport(detectPhoneViewport());
      const currentHeightPx = terminalHeightPx();
      if (currentHeightPx !== null) {
        setTerminalHeightPx(clampTerminalHeight(currentHeightPx));
      }
      window.requestAnimationFrame(() => {
        fitAndResizeTerminal();
      });
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);

    onCleanup(() => {
      window.removeEventListener("resize", handleWindowResize);
    });
  });

  createEffect(() => {
    const contextId = props.contextId;
    if (contextId === lastObservedContextId) {
      return;
    }

    lastObservedContextId = contextId;
    activeContextId = contextId;
    disposeTerminalResources();
    setConnectionError(null);

    if (contextId !== null) {
      void tryResumeExistingSession(contextId);
    }
  });

  createEffect(() => {
    terminalHeightPx();
    if (!(isConnected() || isConnecting())) {
      return;
    }

    ensureTerminalInitialized();

    if (!isConnected()) {
      return;
    }

    window.requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  });

  onCleanup(() => {
    stopTerminalResizeDrag();
    disposeTerminalResources();
  });

  return (
    <section class="mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ScreenHeader title="Terminal" />

      <Show
        when={props.contextId !== null}
        fallback={
          <div class="flex min-h-[420px] items-center justify-center rounded-2xl border border-border-default bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            Open a project tab to start a terminal session.
          </div>
        }
      >
        <Show
          when={isConnected() || isConnecting()}
          fallback={
            <div class="flex min-h-[420px] flex-1 items-start justify-start rounded-2xl border border-border-default bg-bg-secondary p-6 text-left">
              <div class="flex flex-col items-start gap-4">
                <ToolbarIconButton
                  label="Connect terminal"
                  onClick={() => void connect()}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 2.75h4v4h2.25a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1H10v3.25H6V10.25H3.75a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1H6v-4Z"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linejoin="round"
                    />
                  </svg>
                </ToolbarIconButton>
                <Show when={connectionError() !== null}>
                  <p class="max-w-md text-sm text-danger-fg">
                    {connectionError()}
                  </p>
                </Show>
              </div>
            </div>
          }
        >
          <div class="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-border-default bg-bg-secondary p-3">
            <div
              ref={(element) => {
                terminalContainerRef = element;
              }}
              class="flex h-full min-h-0 w-full flex-col gap-2"
            >
              <div
                ref={(element) => {
                  terminalControlsRef = element;
                }}
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-secondary">
                    {isConnected()
                      ? "Connected"
                      : isConnecting()
                        ? "Connecting"
                        : isCheckingStatus()
                          ? "Checking"
                          : "Disconnected"}
                  </span>
                  <ToolbarIconButton
                    label="Send Ctrl+C"
                    disabled={!isConnected()}
                    onClick={() => {
                      if (
                        activeSocket !== null &&
                        activeSocket.readyState === WebSocket.OPEN
                      ) {
                        activeSocket.send(
                          JSON.stringify({
                            type: "input",
                            data: "\u0003",
                          }),
                        );
                      }
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 3v10M3 8h10"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                      />
                      <path
                        d="M4 4l8 8"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                      />
                    </svg>
                  </ToolbarIconButton>
                  <ToolbarIconButton
                    label="Disconnect terminal"
                    disabled={isConnecting()}
                    onClick={() => void disconnect()}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 4.5A4.5 4.5 0 1 0 10 12"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                      />
                      <path
                        d="M10 3.5h3v3M13 3.5l-4 4"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </ToolbarIconButton>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <ToolbarIconButton
                    label="Increase terminal height"
                    onClick={() => resizeTerminalHeight(120)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 3v10M3 8h10"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </ToolbarIconButton>
                  <ToolbarIconButton
                    label="Decrease terminal height"
                    onClick={() => resizeTerminalHeight(-120)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8h10"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </ToolbarIconButton>
                  <ToolbarIconButton
                    label="Reset terminal height"
                    onClick={resetTerminalHeight}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8a5 5 0 1 0 1.5-3.6M3 3v3h3"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </ToolbarIconButton>
                </div>
              </div>

              <Show when={connectionError() !== null}>
                <p class="text-sm text-danger-fg">{connectionError()}</p>
              </Show>

              <div
                class="min-h-0 w-full shrink-0 overflow-hidden rounded-md border border-border-default bg-slate-900"
                style={{
                  height: `${terminalHeightPx() ?? (isPhoneViewport() ? Math.floor(window.innerHeight * PHONE_TERMINAL_HEIGHT_RATIO) : DEFAULT_TERMINAL_HEIGHT)}px`,
                }}
                onClick={focusTerminal}
                onKeyDown={focusTerminal}
                role="button"
                tabindex="0"
              >
                <div
                  ref={(element) => {
                    terminalHostRef = element;
                    ensureTerminalInitialized();
                  }}
                  class="terminal-host h-full w-full"
                />
              </div>

              <div
                ref={(element) => {
                  terminalResizeHandleRef = element;
                }}
                class="group flex h-5 cursor-row-resize items-center justify-center rounded-sm transition-colors hover:bg-accent-muted/40"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize terminal height"
                onMouseDown={handleTerminalResizeMouseDown}
              >
                <div class="h-0.5 w-8 rounded-full bg-border-default transition-colors group-hover:bg-accent-emphasis" />
              </div>
            </div>

            <Show when={activeSessionId() !== null}>
              <p
                ref={(element) => {
                  terminalSessionMetaRef = element;
                }}
                class="text-xs text-text-tertiary"
              >
                session: {activeSessionId()}
              </p>
            </Show>
          </div>
        </Show>
      </Show>
    </section>
  );
}
