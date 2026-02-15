<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";

  const {
    contextId,
  }: {
    contextId: string;
  } = $props();

  type ConnectResponse = {
    sessionId: string;
    websocketPath: string;
    websocketUrl?: string;
    reused?: boolean;
  };

  type StatusResponse =
    | { hasSession: false }
    | {
        hasSession: true;
        sessionId: string;
        websocketPath: string;
        websocketUrl?: string;
      };

  type ServerMessage =
    | { type: "output"; data: string }
    | { type: "exit"; code: number }
    | { type: "error"; message: string }
    | { type: "pong" };

  type TerminalDimensions = {
    rows: number;
    cols: number;
  };

  let terminalHost = $state<HTMLDivElement | undefined>(undefined);
  let terminalInstance = $state<Terminal | null>(null);
  let fitAddon = $state<FitAddon | null>(null);
  let webSocket = $state<WebSocket | null>(null);

  let isConnecting = $state(false);
  let isConnected = $state(false);
  let connectionError = $state<string | null>(null);
  let activeSessionId = $state<string | null>(null);
  let lastContextId = $state(contextId);
  let checkingExistingSession = $state(false);
  let terminalContainer = $state<HTMLDivElement | undefined>(undefined);
  let terminalHeightPx = $state<number | null>(null);
  let isPhoneViewport = $state(false);

  function detectPhoneViewport(): boolean {
    return window.innerWidth <= 768;
  }

  function buildWebSocketUrl(
    websocketPath: string,
    websocketUrl?: string,
  ): string {
    if (websocketUrl !== undefined && websocketUrl.length > 0) {
      return websocketUrl;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${websocketPath}`;
  }

  function disposeTerminalResources(): void {
    if (webSocket !== null) {
      webSocket.onopen = null;
      webSocket.onmessage = null;
      webSocket.onerror = null;
      webSocket.onclose = null;
      if (
        webSocket.readyState === WebSocket.OPEN ||
        webSocket.readyState === WebSocket.CONNECTING
      ) {
        webSocket.close();
      }
      webSocket = null;
    }

    if (terminalInstance !== null) {
      terminalInstance.dispose();
      terminalInstance = null;
    }

    fitAddon = null;
    isConnecting = false;
    isConnected = false;
    activeSessionId = null;
  }

  function ensureTerminalInitialized(): void {
    if (terminalInstance !== null || terminalHost === undefined) {
      return;
    }

    const createdTerminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#93c5fd",
      },
    });

    const createdFitAddon = new FitAddon();
    createdTerminal.loadAddon(createdFitAddon);
    createdTerminal.open(terminalHost);
    createdFitAddon.fit();

    createdTerminal.onData((typedData) => {
      if (webSocket !== null && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(
          JSON.stringify({
            type: "input",
            data: typedData,
          }),
        );
      }
    });

    terminalInstance = createdTerminal;
    fitAddon = createdFitAddon;
  }

  function focusTerminal(): void {
    terminalInstance?.focus();
  }

  function sendResize(dimensions: TerminalDimensions): void {
    if (webSocket === null || webSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    webSocket.send(
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
    const dimensions = fitAddon.proposeDimensions();
    if (dimensions !== undefined) {
      sendResize(dimensions);
    }
  }

  function getMaxTerminalHeightPx(): number {
    const minHeightPx = isPhoneViewport ? 180 : 260;
    if (terminalContainer === undefined) {
      return Math.max(minHeightPx, Math.floor(window.innerHeight * 0.8));
    }
    const reservedSpacePx = isPhoneViewport ? 28 : 88;
    return Math.max(
      minHeightPx,
      terminalContainer.clientHeight - reservedSpacePx,
    );
  }

  function clampTerminalHeight(heightPx: number): number {
    const minHeightPx = isPhoneViewport ? 180 : 260;
    return Math.max(minHeightPx, Math.min(getMaxTerminalHeightPx(), heightPx));
  }

  function ensureTerminalHeight(): void {
    if (terminalHeightPx !== null) {
      return;
    }
    const initialRatio = isPhoneViewport ? 0.96 : 0.75;
    terminalHeightPx = clampTerminalHeight(
      Math.floor(getMaxTerminalHeightPx() * initialRatio),
    );
  }

  function resizeTerminalHeight(deltaPx: number): void {
    ensureTerminalHeight();
    if (terminalHeightPx === null) {
      return;
    }
    terminalHeightPx = clampTerminalHeight(terminalHeightPx + deltaPx);
    requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function maximizeTerminalHeight(): void {
    terminalHeightPx = getMaxTerminalHeightPx();
    requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function resetTerminalHeight(): void {
    terminalHeightPx = null;
    ensureTerminalHeight();
    requestAnimationFrame(() => {
      fitAndResizeTerminal();
    });
  }

  function handleServerMessage(serverMessage: ServerMessage): void {
    if (terminalInstance === null) {
      return;
    }

    if (serverMessage.type === "output") {
      terminalInstance.write(serverMessage.data);
      return;
    }

    if (serverMessage.type === "exit") {
      terminalInstance.writeln(
        `\r\n\r\n[terminal exited with code ${serverMessage.code}]`,
      );
      isConnected = false;
      activeSessionId = null;
      return;
    }

    if (serverMessage.type === "error") {
      terminalInstance.writeln(`\r\n[error] ${serverMessage.message}`);
      connectionError = serverMessage.message;
    }
  }

  async function connect(): Promise<void> {
    if (isConnecting || isConnected) {
      return;
    }

    isConnecting = true;
    connectionError = null;

    try {
      const response = await fetch(`/api/ctx/${contextId}/terminal/connect`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(
          errorData.error ?? `Failed to connect terminal (${response.status})`,
        );
      }

      const connectResponse = (await response.json()) as ConnectResponse;
      activeSessionId = connectResponse.sessionId;

      await tick();
      ensureTerminalInitialized();

      if (terminalInstance === null) {
        throw new Error("Terminal UI could not be initialized");
      }

      terminalInstance.reset();
      terminalInstance.writeln(
        `[connected to ${contextId} in ${new Date().toLocaleTimeString()}]`,
      );

      const createdWebSocket = new WebSocket(
        buildWebSocketUrl(
          connectResponse.websocketPath,
          connectResponse.websocketUrl,
        ),
      );

      createdWebSocket.onopen = () => {
        isConnecting = false;
        isConnected = true;
        fitAndResizeTerminal();
        focusTerminal();
      };

      createdWebSocket.onmessage = (event) => {
        try {
          const serverMessage = JSON.parse(event.data) as ServerMessage;
          handleServerMessage(serverMessage);
        } catch {
          // Ignore invalid frames from server.
        }
      };

      createdWebSocket.onerror = () => {
        connectionError = "Terminal WebSocket error";
      };

      createdWebSocket.onclose = () => {
        isConnecting = false;
        isConnected = false;
        activeSessionId = null;
      };

      webSocket = createdWebSocket;
    } catch (error) {
      isConnecting = false;
      isConnected = false;
      activeSessionId = null;
      connectionError =
        error instanceof Error ? error.message : "Terminal connection failed";
    }
  }

  async function tryResumeExistingSession(): Promise<void> {
    if (isConnecting || isConnected || checkingExistingSession) {
      return;
    }

    checkingExistingSession = true;
    try {
      const response = await fetch(`/api/ctx/${contextId}/terminal/status`);
      if (!response.ok) {
        return;
      }
      const status = (await response.json()) as StatusResponse;
      if (status.hasSession) {
        await connect();
      }
    } catch {
      // Ignore status check failures.
    } finally {
      checkingExistingSession = false;
    }
  }

  function disconnect(): void {
    if (isConnecting) {
      return;
    }
    void (async () => {
      try {
        await fetch(`/api/ctx/${contextId}/terminal/disconnect`, {
          method: "POST",
        });
      } catch {
        // Ignore network errors; client resources will still be cleaned up.
      } finally {
        disposeTerminalResources();
        connectionError = null;
      }
    })();
  }

  $effect(() => {
    if (contextId !== lastContextId) {
      lastContextId = contextId;
      disposeTerminalResources();
      connectionError = null;
      void tryResumeExistingSession();
    }
  });

  onMount(() => {
    const updateViewport = (): void => {
      isPhoneViewport = detectPhoneViewport();
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    void tryResumeExistingSession();
    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  });

  $effect(() => {
    if (isConnected && fitAddon !== null) {
      ensureTerminalHeight();
      const resizeHandler = (): void => {
        if (terminalHeightPx !== null) {
          terminalHeightPx = clampTerminalHeight(terminalHeightPx);
        }
        fitAndResizeTerminal();
      };

      window.addEventListener("resize", resizeHandler);
      return () => {
        window.removeEventListener("resize", resizeHandler);
      };
    }
  });

  onDestroy(() => {
    disposeTerminalResources();
  });
</script>

<main class="terminal-screen flex-1 min-h-0 bg-bg-primary">
  <div class="h-full w-full p-2 sm:p-6">
    {#if !isConnected && !isConnecting}
      <div class="h-full w-full flex items-center justify-center">
        <div class="text-center">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md
                   bg-accent-emphasis text-white hover:opacity-90 transition-opacity"
            onclick={() => void connect()}
          >
            connect
          </button>
          {#if connectionError !== null}
            <p class="mt-3 text-sm text-danger-fg">{connectionError}</p>
          {/if}
        </div>
      </div>
    {:else}
      <div
        class="h-full w-full flex flex-col gap-2"
        bind:this={terminalContainer}
      >
        <div class="flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            class="px-2 py-1.5 text-xs font-medium rounded-md border border-border-default
                   bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
            onclick={() => {
              resizeTerminalHeight(120);
            }}
          >
            +
          </button>
          <button
            type="button"
            class="px-2 py-1.5 text-xs font-medium rounded-md border border-border-default
                   bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
            onclick={() => {
              resizeTerminalHeight(-120);
            }}
          >
            -
          </button>
          <button
            type="button"
            class="px-2 py-1.5 text-xs font-medium rounded-md border border-border-default
                   bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
            onclick={maximizeTerminalHeight}
          >
            max
          </button>
          <button
            type="button"
            class="px-2 py-1.5 text-xs font-medium rounded-md border border-border-default
                   bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
            onclick={resetTerminalHeight}
          >
            reset
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium rounded-md border border-border-default
                   bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={disconnect}
            disabled={isConnecting}
          >
            disconnect
          </button>
        </div>
        <div
          class="shrink-0 min-h-0 w-full rounded-md border border-border-default overflow-hidden bg-slate-900"
          style={`height: ${terminalHeightPx ?? (isPhoneViewport ? Math.floor(window.innerHeight * 0.55) : 480)}px;`}
          onclick={focusTerminal}
          onkeydown={focusTerminal}
          role="button"
          tabindex="0"
        >
          <div
            bind:this={terminalHost}
            class="terminal-host h-full w-full"
          ></div>
        </div>
      </div>
      {#if activeSessionId !== null}
        <p class="mt-2 text-xs text-text-tertiary">
          session: {activeSessionId}
        </p>
      {/if}
    {/if}
  </div>
</main>

<style>
  .terminal-host :global(.xterm) {
    height: 100%;
    padding: 0.75rem;
  }

  .terminal-host :global(.xterm-viewport) {
    scrollbar-width: thin;
  }
</style>
