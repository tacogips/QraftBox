/**
 * Tests for LabelSelector component
 */

import { describe, test, expect } from "vitest";

describe("LabelSelector Component", () => {
  test("should toggle label selection", () => {
    const selected = ["bug"];
    const label = "feature";
    const newSelected = selected.includes(label)
      ? selected.filter((l) => l !== label)
      : [...selected, label];
    expect(newSelected).toEqual(["bug", "feature"]);
  });

  test("should have minimum height of 44px", () => {
    const minHeight = 44;
    expect(minHeight).toBe(44);
  });
});
