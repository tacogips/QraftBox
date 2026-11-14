/**
 * Event collector that batches events with debounce functionality.
 * Collects events and flushes them to callback after delayMs of inactivity.
 */
export interface EventCollector<T> {
  /**
   * Add an event to the pending queue.
   * Resets the debounce timer.
   */
  add(event: T): void;

  /**
   * Flush all pending events immediately and return them.
   * Cancels the debounce timer and clears pending events.
   */
  flush(): readonly T[];

  /**
   * Clear all pending events without triggering callback.
   * Cancels the debounce timer.
   */
  clear(): void;

  /**
   * Number of pending events in the queue.
   */
  readonly pending: number;

  /**
   * Dispose the collector (clear timers and pending events).
   * Should be called when the collector is no longer needed.
   */
  dispose(): void;
}

/**
 * Create a debounced event collector.
 *
 * Collects events and flushes them to the callback after delayMs of inactivity.
 * Each new event resets the timer. Supports optional deduplication by key function.
 *
 * @param callback - Function called with collected events after delay
 * @param delayMs - Debounce delay in milliseconds
 * @param keyFn - Optional function to extract deduplication key from event
 * @returns EventCollector instance
 *
 * @example
 * ```typescript
 * // Simple collector without deduplication
 * const collector = createEventCollector(
 *   (events) => console.log('Events:', events),
 *   100
 * );
 * collector.add({ path: 'file.txt', type: 'modify' });
 * collector.add({ path: 'file2.txt', type: 'modify' });
 * // After 100ms: Events: [{ path: 'file.txt', type: 'modify' }, { path: 'file2.txt', type: 'modify' }]
 *
 * // Collector with deduplication by path
 * const collector = createEventCollector(
 *   (events) => console.log('Events:', events),
 *   100,
 *   (event) => event.path
 * );
 * collector.add({ path: 'file.txt', type: 'modify', ts: 1 });
 * collector.add({ path: 'file.txt', type: 'modify', ts: 2 }); // Replaces previous
 * // After 100ms: Events: [{ path: 'file.txt', type: 'modify', ts: 2 }]
 * ```
 */
export function createEventCollector<T>(
  callback: (events: readonly T[]) => void,
  delayMs: number,
  keyFn?: (event: T) => string,
): EventCollector<T> {
  // Use Map for deduplication if keyFn provided, otherwise array
  let pending: Map<string, T> | T[] = keyFn !== undefined ? new Map() : [];
  let timerId: Timer | undefined = undefined;

  function resetTimer(): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }

    timerId = setTimeout(() => {
      flushInternal();
    }, delayMs);
  }

  function flushInternal(): readonly T[] {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }

    const events =
      pending instanceof Map ? Array.from(pending.values()) : [...pending];

    // Clear pending before callback to avoid issues if callback adds events
    if (pending instanceof Map) {
      pending.clear();
    } else {
      pending = [];
    }

    if (events.length > 0) {
      callback(events);
    }

    return events;
  }

  return {
    add(event: T): void {
      if (keyFn !== undefined && pending instanceof Map) {
        const key = keyFn(event);
        pending.set(key, event);
      } else if (Array.isArray(pending)) {
        pending.push(event);
      }
      resetTimer();
    },

    flush(): readonly T[] {
      return flushInternal();
    },

    clear(): void {
      if (timerId !== undefined) {
        clearTimeout(timerId);
        timerId = undefined;
      }
      if (pending instanceof Map) {
        pending.clear();
      } else {
        pending = [];
      }
    },

    get pending(): number {
      return pending instanceof Map ? pending.size : pending.length;
    },

    dispose(): void {
      if (timerId !== undefined) {
        clearTimeout(timerId);
        timerId = undefined;
      }
      if (pending instanceof Map) {
        pending.clear();
      } else {
        pending = [];
      }
    },
  };
}
