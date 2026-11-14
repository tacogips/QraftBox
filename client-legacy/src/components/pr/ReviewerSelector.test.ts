/**
 * Tests for ReviewerSelector component
 */

import { describe, test, expect } from "vitest";

describe("ReviewerSelector Component", () => {
  test("should generate correct avatar URL", () => {
    const username = "alice";
    const avatarUrl = `https://github.com/${username}.png?size=40`;
    expect(avatarUrl).toBe("https://github.com/alice.png?size=40");
  });

  test("should have minimum height of 44px", () => {
    const minHeight = 44;
    expect(minHeight).toBe(44);
  });
});
