import { describe, expect, test, vi } from "vitest";

import { ensureSocketDestroySoon } from "./vite-bun-compat";

type FakeSocket = {
  destroySoon?: (() => void) | undefined;
  writable: boolean;
  writableFinished?: boolean | undefined;
  end(): void;
  once(eventName: "finish", listener: () => void): void;
  destroy(): void;
};

function createFakeSocket(overrides: Partial<FakeSocket> = {}): FakeSocket & {
  readonly finishListeners: Array<() => void>;
  readonly destroySpy: ReturnType<typeof vi.fn>;
  readonly endSpy: ReturnType<typeof vi.fn>;
  readonly onceSpy: ReturnType<typeof vi.fn>;
} {
  const finishListeners: Array<() => void> = [];
  const endSpy = vi.fn();
  const destroySpy = vi.fn();
  const onceSpy = vi.fn((eventName: "finish", listener: () => void) => {
    if (eventName === "finish") {
      finishListeners.push(listener);
    }
  });

  return {
    writable: true,
    end: endSpy,
    once: onceSpy,
    destroy: destroySpy,
    ...overrides,
    finishListeners,
    destroySpy,
    endSpy,
    onceSpy,
  };
}

describe("ensureSocketDestroySoon", () => {
  test("installs destroySoon when Bun does not provide it", () => {
    const fakeSocket = createFakeSocket({ destroySoon: undefined });

    ensureSocketDestroySoon(fakeSocket);

    expect(typeof fakeSocket.destroySoon).toBe("function");
  });

  test("keeps an existing destroySoon implementation intact", () => {
    const existingDestroySoon = vi.fn();
    const fakeSocket = createFakeSocket({
      destroySoon: existingDestroySoon,
    });

    ensureSocketDestroySoon(fakeSocket);

    expect(fakeSocket.destroySoon).toBe(existingDestroySoon);
  });

  test("ends writable sockets and destroys them after finish", () => {
    const fakeSocket = createFakeSocket({
      writable: true,
      writableFinished: false,
    });

    ensureSocketDestroySoon(fakeSocket);
    fakeSocket.destroySoon?.();

    expect(fakeSocket.endSpy).toHaveBeenCalledTimes(1);
    expect(fakeSocket.onceSpy).toHaveBeenCalledWith(
      "finish",
      expect.any(Function),
    );
    expect(fakeSocket.destroySpy).not.toHaveBeenCalled();

    const finishListener = fakeSocket.finishListeners[0];
    expect(finishListener).toBeTypeOf("function");
    finishListener?.();

    expect(fakeSocket.destroySpy).toHaveBeenCalledTimes(1);
  });

  test("destroys already-finished sockets immediately", () => {
    const fakeSocket = createFakeSocket({
      writable: true,
      writableFinished: true,
    });

    ensureSocketDestroySoon(fakeSocket);
    fakeSocket.destroySoon?.();

    expect(fakeSocket.endSpy).not.toHaveBeenCalled();
    expect(fakeSocket.onceSpy).not.toHaveBeenCalled();
    expect(fakeSocket.destroySpy).toHaveBeenCalledTimes(1);
  });
});
