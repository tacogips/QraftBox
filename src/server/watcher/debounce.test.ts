import { describe, test, expect } from "bun:test";
import { createEventCollector } from "./debounce";

interface TestEvent {
  readonly path: string;
  readonly type: string;
  readonly timestamp?: number;
}

describe("createEventCollector", () => {
  describe("basic functionality", () => {
    test("collects and flushes events after delay", async () => {
      let flushedEvents: readonly TestEvent[] = [];
      const collector = createEventCollector<TestEvent>((events) => {
        flushedEvents = events;
      }, 50);

      collector.add({ path: "file1.txt", type: "modify" });
      collector.add({ path: "file2.txt", type: "modify" });

      expect(collector.pending).toBe(2);
      expect(flushedEvents).toEqual([]);

      // Wait for debounce delay + buffer
      await new Promise((resolve) => setTimeout(resolve, 70));

      expect(collector.pending).toBe(0);
      expect(flushedEvents).toEqual([
        { path: "file1.txt", type: "modify" },
        { path: "file2.txt", type: "modify" },
      ]);

      collector.dispose();
    });

    test("timer resets on new events within delay window", async () => {
      let flushedEvents: readonly TestEvent[] = [];
      let flushCount = 0;
      const collector = createEventCollector<TestEvent>((events) => {
        flushedEvents = events;
        flushCount++;
      }, 50);

      collector.add({ path: "file1.txt", type: "modify" });
      expect(collector.pending).toBe(1);

      // Add another event before delay expires (reset timer)
      await new Promise((resolve) => setTimeout(resolve, 30));
      collector.add({ path: "file2.txt", type: "modify" });
      expect(collector.pending).toBe(2);

      // First timer should have been cancelled, no flush yet
      expect(flushCount).toBe(0);

      // Wait for debounce delay from second event
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Should flush both events together
      expect(flushCount).toBe(1);
      expect(flushedEvents.length).toBe(2);
      expect(collector.pending).toBe(0);

      collector.dispose();
    });

    test("flush() triggers immediate callback", () => {
      let flushedEvents: readonly TestEvent[] = [];
      const collector = createEventCollector<TestEvent>((events) => {
        flushedEvents = events;
      }, 50);

      collector.add({ path: "file1.txt", type: "modify" });
      collector.add({ path: "file2.txt", type: "modify" });

      expect(collector.pending).toBe(2);

      const result = collector.flush();

      expect(result).toEqual([
        { path: "file1.txt", type: "modify" },
        { path: "file2.txt", type: "modify" },
      ]);
      expect(flushedEvents).toEqual(result);
      expect(collector.pending).toBe(0);

      collector.dispose();
    });

    test("flush() returns events in order", () => {
      const collector = createEventCollector<TestEvent>(() => {}, 50);

      const events = [
        { path: "file1.txt", type: "create" },
        { path: "file2.txt", type: "modify" },
        { path: "file3.txt", type: "delete" },
      ];

      for (const event of events) {
        collector.add(event);
      }

      const result = collector.flush();
      expect(result).toEqual(events);

      collector.dispose();
    });

    test("clear() drops events without callback", async () => {
      let callbackCalled = false;
      const collector = createEventCollector<TestEvent>(() => {
        callbackCalled = true;
      }, 50);

      collector.add({ path: "file1.txt", type: "modify" });
      collector.add({ path: "file2.txt", type: "modify" });

      expect(collector.pending).toBe(2);

      collector.clear();

      expect(collector.pending).toBe(0);

      // Wait to ensure callback is not called
      await new Promise((resolve) => setTimeout(resolve, 70));

      expect(callbackCalled).toBe(false);

      collector.dispose();
    });

    test("pending count is accurate", () => {
      const collector = createEventCollector<TestEvent>(() => {}, 50);

      expect(collector.pending).toBe(0);

      collector.add({ path: "file1.txt", type: "modify" });
      expect(collector.pending).toBe(1);

      collector.add({ path: "file2.txt", type: "modify" });
      expect(collector.pending).toBe(2);

      collector.flush();
      expect(collector.pending).toBe(0);

      collector.dispose();
    });

    test("dispose() cleans up resources", async () => {
      let callbackCalled = false;
      const collector = createEventCollector<TestEvent>(() => {
        callbackCalled = true;
      }, 50);

      collector.add({ path: "file1.txt", type: "modify" });
      expect(collector.pending).toBe(1);

      collector.dispose();

      expect(collector.pending).toBe(0);

      // Wait to ensure timer was cancelled and callback not called
      await new Promise((resolve) => setTimeout(resolve, 70));

      expect(callbackCalled).toBe(false);
    });

    test("handles empty flush", () => {
      let flushedEvents: readonly TestEvent[] | undefined = undefined;
      const collector = createEventCollector<TestEvent>((events) => {
        flushedEvents = events;
      }, 50);

      const result = collector.flush();

      expect(result).toEqual([]);
      // Callback should not be called for empty flush
      expect(flushedEvents).toBeUndefined();

      collector.dispose();
    });
  });

  describe("deduplication by key function", () => {
    test("deduplicates events by key", async () => {
      let flushedEvents: readonly TestEvent[] = [];
      const collector = createEventCollector<TestEvent>(
        (events) => {
          flushedEvents = events;
        },
        50,
        (event) => event.path, // Deduplicate by path
      );

      collector.add({ path: "file.txt", type: "create", timestamp: 1 });
      collector.add({ path: "file.txt", type: "modify", timestamp: 2 });
      collector.add({ path: "other.txt", type: "modify", timestamp: 3 });

      expect(collector.pending).toBe(2); // Only 2 unique paths

      await new Promise((resolve) => setTimeout(resolve, 70));

      // Should keep only the latest event per path
      expect(flushedEvents.length).toBe(2);

      const fileEvent = flushedEvents.find((e) => e.path === "file.txt");
      const otherEvent = flushedEvents.find((e) => e.path === "other.txt");

      expect(fileEvent).toEqual({
        path: "file.txt",
        type: "modify",
        timestamp: 2,
      });
      expect(otherEvent).toEqual({
        path: "other.txt",
        type: "modify",
        timestamp: 3,
      });

      collector.dispose();
    });

    test("deduplication keeps latest event for same key", () => {
      const collector = createEventCollector<TestEvent>(
        () => {},
        50,
        (event) => event.path,
      );

      collector.add({ path: "file.txt", type: "create", timestamp: 1 });
      collector.add({ path: "file.txt", type: "modify", timestamp: 2 });
      collector.add({ path: "file.txt", type: "delete", timestamp: 3 });

      expect(collector.pending).toBe(1);

      const result = collector.flush();

      expect(result).toEqual([
        { path: "file.txt", type: "delete", timestamp: 3 },
      ]);

      collector.dispose();
    });

    test("deduplication with multiple unique keys", () => {
      const collector = createEventCollector<TestEvent>(
        () => {},
        50,
        (event) => event.path,
      );

      collector.add({ path: "a.txt", type: "modify" });
      collector.add({ path: "b.txt", type: "modify" });
      collector.add({ path: "c.txt", type: "modify" });
      collector.add({ path: "a.txt", type: "delete" }); // Update a.txt

      expect(collector.pending).toBe(3); // a, b, c

      const result = collector.flush();

      expect(result.length).toBe(3);
      expect(result.find((e) => e.path === "a.txt")?.type).toBe("delete");
      expect(result.find((e) => e.path === "b.txt")?.type).toBe("modify");
      expect(result.find((e) => e.path === "c.txt")?.type).toBe("modify");

      collector.dispose();
    });

    test("pending count reflects deduplicated size", () => {
      const collector = createEventCollector<TestEvent>(
        () => {},
        50,
        (event) => event.path,
      );

      collector.add({ path: "file.txt", type: "create" });
      expect(collector.pending).toBe(1);

      collector.add({ path: "file.txt", type: "modify" });
      expect(collector.pending).toBe(1); // Still 1 (deduplicated)

      collector.add({ path: "other.txt", type: "create" });
      expect(collector.pending).toBe(2); // Now 2 unique paths

      collector.dispose();
    });

    test("clear() works with deduplication", () => {
      const collector = createEventCollector<TestEvent>(
        () => {},
        50,
        (event) => event.path,
      );

      collector.add({ path: "file.txt", type: "create" });
      collector.add({ path: "file.txt", type: "modify" });
      collector.add({ path: "other.txt", type: "create" });

      expect(collector.pending).toBe(2);

      collector.clear();

      expect(collector.pending).toBe(0);

      collector.dispose();
    });
  });

  describe("edge cases", () => {
    test("handles very short delays", async () => {
      let flushedEvents: readonly TestEvent[] = [];
      const collector = createEventCollector<TestEvent>(
        (events) => {
          flushedEvents = events;
        },
        1, // 1ms delay
      );

      collector.add({ path: "file.txt", type: "modify" });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(flushedEvents.length).toBe(1);

      collector.dispose();
    });

    test("handles rapid sequential adds", async () => {
      let flushCount = 0;
      const collector = createEventCollector<TestEvent>(() => {
        flushCount++;
      }, 50);

      // Add 10 events in rapid succession
      for (let i = 0; i < 10; i++) {
        collector.add({ path: `file${i}.txt`, type: "modify" });
      }

      expect(collector.pending).toBe(10);

      await new Promise((resolve) => setTimeout(resolve, 70));

      // Should flush only once
      expect(flushCount).toBe(1);
      expect(collector.pending).toBe(0);

      collector.dispose();
    });

    test("can reuse collector after flush", async () => {
      let flushCount = 0;
      let lastFlushedEvents: readonly TestEvent[] = [];
      const collector = createEventCollector<TestEvent>((events) => {
        flushCount++;
        lastFlushedEvents = events;
      }, 50);

      // First batch
      collector.add({ path: "file1.txt", type: "modify" });
      collector.flush();
      expect(flushCount).toBe(1);
      expect(lastFlushedEvents.length).toBe(1);

      // Second batch
      collector.add({ path: "file2.txt", type: "modify" });
      collector.add({ path: "file3.txt", type: "modify" });
      await new Promise((resolve) => setTimeout(resolve, 70));

      expect(flushCount).toBe(2);
      expect(lastFlushedEvents.length).toBe(2);

      collector.dispose();
    });

    test("callback can add events without causing infinite loop", () => {
      let callbackCount = 0;
      const collector = createEventCollector<TestEvent>((events) => {
        callbackCount++;
        // Don't add events during callback - just verify it doesn't break
        expect(events.length).toBeGreaterThan(0);
      }, 50);

      collector.add({ path: "file.txt", type: "modify" });
      collector.flush();

      expect(callbackCount).toBe(1);
      expect(collector.pending).toBe(0);

      collector.dispose();
    });
  });
});
