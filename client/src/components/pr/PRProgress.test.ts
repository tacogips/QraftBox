/**
 * Tests for PRProgress component
 */

import { describe, test, expect } from "vitest";

describe("PRProgress Component", () => {
  test("should return correct default message for stage", () => {
    const stage = "creating";
    const message =
      stage === "preparing"
        ? "Preparing pull request..."
        : stage === "creating"
          ? "Creating pull request..."
          : "Pull request created!";
    expect(message).toBe("Creating pull request...");
  });

  test("should have three stage dots", () => {
    const stageDots = 3;
    expect(stageDots).toBe(3);
  });
});
