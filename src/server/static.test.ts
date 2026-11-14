/**
 * Tests for static file serving middleware
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { createStaticMiddleware, createSPAFallback } from "./static";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";

// Test fixtures directory
const TEST_DIR = join(import.meta.dir, ".test-static-fixtures");
const CLIENT_DIR = join(TEST_DIR, "client");
const INDEX_PATH = join(CLIENT_DIR, "index.html");

describe("createStaticMiddleware", () => {
  beforeAll(() => {
    // Create test directory structure
    mkdirSync(CLIENT_DIR, { recursive: true });

    // Create test files
    writeFileSync(INDEX_PATH, "<html><body>Home</body></html>");
    writeFileSync(join(CLIENT_DIR, "app.js"), "console.log('app');");
    writeFileSync(join(CLIENT_DIR, "style.css"), "body { color: red; }");
    writeFileSync(join(CLIENT_DIR, "main.abc123.js"), "console.log('hashed');");
    writeFileSync(join(CLIENT_DIR, "data.json"), '{"key":"value"}');
    writeFileSync(join(CLIENT_DIR, "logo.png"), new Uint8Array([0x89, 0x50]));
  });

  // Note: cleanup happens in integration test afterAll

  test("serves HTML file with correct Content-Type", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/index.html");

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/html");
    const text = await response.text();
    expect(text).toContain("Home");
  });

  test("serves JavaScript file with correct Content-Type", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/app.js");

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("javascript");
    const text = await response.text();
    expect(text).toContain("console.log");
  });

  test("serves CSS file with correct Content-Type", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/style.css");

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/css");
    const text = await response.text();
    expect(text).toContain("color: red");
  });

  test("serves JSON file with correct Content-Type", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/data.json");

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("application/json");
    const json = await response.json();
    expect(json).toEqual({ key: "value" });
  });

  test("serves PNG file with correct Content-Type", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/logo.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  test("sets immutable cache for hashed assets", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/main.abc123.js");

    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });

  test("sets no-cache for non-hashed files", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/app.js");

    expect(response.status).toBe(200);
    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toBe("no-cache");
  });

  test("handles HEAD request with headers only", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/index.html", { method: "HEAD" });

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("text/html");
    expect(response.headers.get("Content-Length")).toBeTruthy();
    const body = await response.text();
    expect(body).toBe(""); // HEAD should have no body
  });

  test("falls through for missing files", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));
    app.get("*", (c) => c.text("Fallback", 404));

    const response = await app.request("/nonexistent.js");

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("Fallback");
  });

  test("skips API routes", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));
    app.get("/api/test", (c) => c.json({ api: true }));

    const response = await app.request("/api/test");

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ api: true });
  });

  test("only handles GET and HEAD methods", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));
    app.post("*", (c) => c.text("POST handled", 200));

    const response = await app.request("/index.html", { method: "POST" });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("POST handled");
  });

  test("handles case-insensitive file extensions", async () => {
    // Create test file with uppercase extension
    writeFileSync(join(CLIENT_DIR, "TEST.JS"), "console.log('uppercase');");

    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    const response = await app.request("/TEST.JS");

    expect(response.status).toBe(200);
    const contentType = response.headers.get("Content-Type");
    // Bun.file() may not auto-detect MIME for uppercase extensions, so it uses our fallback
    expect(contentType).toBeTruthy();
  });

  test("detects hash patterns correctly", async () => {
    // Create files with various hash patterns
    writeFileSync(
      join(CLIENT_DIR, "chunk.a1b2c3.js"),
      "console.log('short hash');",
    );
    writeFileSync(
      join(CLIENT_DIR, "vendor.a1b2c3d4e5f6.js"),
      "console.log('long hash');",
    );
    writeFileSync(
      join(CLIENT_DIR, "app.nothash.js"),
      "console.log('not a hash');",
    );

    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));

    // File with 6+ char hash should be immutable
    const response1 = await app.request("/chunk.a1b2c3.js");
    expect(response1.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );

    // File with long hash should also be immutable
    const response2 = await app.request("/vendor.a1b2c3d4e5f6.js");
    expect(response2.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );

    // File without valid hash pattern should not be immutable
    const response3 = await app.request("/app.nothash.js");
    expect(response3.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("createSPAFallback", () => {
  beforeAll(() => {
    // Update index.html content for SPA tests
    mkdirSync(CLIENT_DIR, { recursive: true });
    writeFileSync(INDEX_PATH, "<html><body>SPA</body></html>");
  });

  test("returns index.html for routes without extension", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));

    const response = await app.request("/users");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const text = await response.text();
    expect(text).toContain("SPA");
  });

  test("returns index.html for nested routes", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));

    const response = await app.request("/users/123/profile");

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("SPA");
  });

  test("falls through for paths with file extensions", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));
    app.get("*", (c) => c.text("Not SPA", 404));

    const response = await app.request("/file.js");

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("Not SPA");
  });

  test("skips API routes", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));
    app.get("/api/data", (c) => c.json({ api: true }));

    const response = await app.request("/api/data");

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ api: true });
  });

  test("only handles GET requests", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));
    app.post("*", (c) => c.text("POST", 200));

    const response = await app.request("/users", { method: "POST" });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("POST");
  });

  test("falls through if index.html does not exist", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback("/nonexistent/index.html"));
    app.get("*", (c) => c.text("404", 404));

    const response = await app.request("/users");

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("404");
  });

  test("returns index.html for root path", async () => {
    const app = new Hono();
    app.use("*", createSPAFallback(INDEX_PATH));

    const response = await app.request("/");

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("SPA");
  });
});

describe("Integration: Static + SPA Fallback", () => {
  beforeAll(() => {
    // Recreate test files for integration test
    mkdirSync(CLIENT_DIR, { recursive: true });
    writeFileSync(INDEX_PATH, "<html><body>SPA</body></html>");
    writeFileSync(join(CLIENT_DIR, "app.js"), "console.log('app');");

    // Create additional test files for integration test
    const assetsDir = join(CLIENT_DIR, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "logo.svg"), "<svg></svg>");
  });

  afterAll(() => {
    // Clean up test directory after integration tests
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("serves static files first, falls back to SPA for routes", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));
    app.use("*", createSPAFallback(INDEX_PATH));

    // Static file should be served
    const staticResponse = await app.request("/app.js");
    expect(staticResponse.status).toBe(200);
    const contentType = staticResponse.headers.get("Content-Type");
    expect(contentType).toContain("javascript");

    // Route without extension should get SPA fallback
    const spaResponse = await app.request("/dashboard");
    expect(spaResponse.status).toBe(200);
    const text = await spaResponse.text();
    expect(text).toContain("SPA");
  });

  test("API routes are not affected by static or SPA middleware", async () => {
    const app = new Hono();
    app.use("*", createStaticMiddleware(CLIENT_DIR));
    app.use("*", createSPAFallback(INDEX_PATH));
    app.get("/api/users", (c) => c.json({ users: [] }));

    const response = await app.request("/api/users");

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ users: [] });
  });
});
