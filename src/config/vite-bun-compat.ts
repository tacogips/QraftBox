type DestroySoonCompatibleSocket = {
  destroySoon?: (() => void) | undefined;
  readonly writable: boolean;
  readonly writableFinished?: boolean | undefined;
  end(): void;
  once(eventName: "finish", listener: () => void): void;
  destroy(): void;
};

function destroySocketSoon(socketInstance: DestroySoonCompatibleSocket): void {
  if (socketInstance.writable && socketInstance.writableFinished !== true) {
    socketInstance.end();
    socketInstance.once("finish", () => {
      socketInstance.destroy();
    });
    return;
  }

  socketInstance.destroy();
}

export function ensureSocketDestroySoon(
  socketInstance: DestroySoonCompatibleSocket,
): void {
  if (typeof socketInstance.destroySoon === "function") {
    return;
  }

  socketInstance.destroySoon = function destroySoonCompat() {
    destroySocketSoon(this);
  };
}
