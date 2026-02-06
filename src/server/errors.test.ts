/**
 * Tests for server error handling
 */

import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import {
  AppError,
  createErrorHandler,
  notFoundError,
  validationError,
  gitError,
  internalError,
  conflictError,
} from "./errors";

describe("AppError", () => {
  test("creates error with all properties", () => {
    const error = new AppError("NOT_FOUND", "Resource not found", 404, {
      resource: "user",
    });

    expect(error.name).toBe("AppError");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Resource not found");
    expect(error.statusCode).toBe(404);
    expect(error.details).toEqual({ resource: "user" });
  });

  test("creates error without details", () => {
    const error = new AppError("INTERNAL_ERROR", "Something went wrong", 500);

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.details).toBeUndefined();
  });

  test("is instance of Error", () => {
    const error = new AppError("VALIDATION_ERROR", "Invalid input", 400);
    expect(error instanceof Error).toBe(true);
  });
});

describe("Factory functions", () => {
  test("notFoundError creates NOT_FOUND error", () => {
    const error = notFoundError("User not found");

    expect(error.code).toBe("NOT_FOUND");
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("User not found");
    expect(error.details).toBeUndefined();
  });

  test("validationError creates VALIDATION_ERROR", () => {
    const error = validationError("Invalid email", {
      field: "email",
      value: "invalid",
    });

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Invalid email");
    expect(error.details).toEqual({ field: "email", value: "invalid" });
  });

  test("validationError without details", () => {
    const error = validationError("Invalid input");

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.details).toBeUndefined();
  });

  test("gitError creates GIT_ERROR", () => {
    const error = gitError("Git command failed", {
      command: "git status",
      exitCode: 128,
    });

    expect(error.code).toBe("GIT_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe("Git command failed");
    expect(error.details).toEqual({ command: "git status", exitCode: 128 });
  });

  test("internalError creates INTERNAL_ERROR", () => {
    const error = internalError("Unexpected error", { stack: "..." });

    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe("Unexpected error");
    expect(error.details).toEqual({ stack: "..." });
  });

  test("conflictError creates CONFLICT error", () => {
    const error = conflictError("Resource already exists", {
      resource: "user",
      id: "123",
    });

    expect(error.code).toBe("CONFLICT");
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe("Resource already exists");
    expect(error.details).toEqual({ resource: "user", id: "123" });
  });
});

describe("createErrorHandler", () => {
  test("catches AppError and returns JSON response", async () => {
    const app = new Hono();
    app.onError(createErrorHandler());
    app.get("/", () => {
      throw notFoundError("Resource not found");
    });

    const response = await app.request("/");
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body).toEqual({
      error: "Resource not found",
      code: 404,
    });
  });

  test("includes details in error response", async () => {
    const app = new Hono();
    app.onError(createErrorHandler());
    app.get("/", () => {
      throw validationError("Invalid input", { field: "email" });
    });

    const response = await app.request("/");
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toEqual({
      error: "Invalid input",
      code: 400,
      details: { field: "email" },
    });
  });

  test("handles standard Error as 500", async () => {
    const app = new Hono();
    app.onError(createErrorHandler());
    app.get("/", () => {
      throw new Error("Unexpected error");
    });

    const response = await app.request("/");
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toEqual({
      error: "Unexpected error",
      code: 500,
    });
  });

  test("passes through when no error thrown", async () => {
    const app = new Hono();
    app.onError(createErrorHandler());
    app.get("/", (c) => {
      return c.json({ success: true });
    });

    const response = await app.request("/");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  test("handles different error codes correctly", async () => {
    const app = new Hono();
    app.onError(createErrorHandler());

    app.get("/not-found", () => {
      throw notFoundError("Not found");
    });

    app.get("/validation", () => {
      throw validationError("Validation failed");
    });

    app.get("/git", () => {
      throw gitError("Git error");
    });

    app.get("/internal", () => {
      throw internalError("Internal error");
    });

    app.get("/conflict", () => {
      throw conflictError("Conflict");
    });

    // Test NOT_FOUND
    const notFoundResponse = await app.request("/not-found");
    expect(notFoundResponse.status).toBe(404);

    // Test VALIDATION_ERROR
    const validationResponse = await app.request("/validation");
    expect(validationResponse.status).toBe(400);

    // Test GIT_ERROR
    const gitResponse = await app.request("/git");
    expect(gitResponse.status).toBe(500);

    // Test INTERNAL_ERROR
    const internalResponse = await app.request("/internal");
    expect(internalResponse.status).toBe(500);

    // Test CONFLICT
    const conflictResponse = await app.request("/conflict");
    expect(conflictResponse.status).toBe(409);
  });
});
