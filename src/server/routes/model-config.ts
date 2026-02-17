import { Hono } from "hono";
import type {
  ModelVendor,
  UpdateOperationModelBindingsInput,
  UpdateModelProfileInput,
} from "../../types/model-config.js";
import type { ModelConfigStore } from "../model-config/store.js";

interface ErrorResponse {
  readonly error: string;
  readonly code: number;
}

interface CreateProfileRequest {
  readonly name: string;
  readonly vendor: ModelVendor;
  readonly model: string;
  readonly arguments?: readonly string[] | undefined;
}

interface UpdateBindingsRequest {
  readonly gitCommitProfileId?: string | null;
  readonly gitPrProfileId?: string | null;
  readonly aiDefaultProfileId?: string | null;
}

function toErrorResponse(message: string, code: number): ErrorResponse {
  return { error: message, code };
}

function sanitizeOptionalProfileId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Profile ID must be a string or null");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createModelConfigRoutes(store: ModelConfigStore): Hono {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json(store.getState());
  });

  app.post("/profiles", async (c) => {
    try {
      const body = await c.req.json<CreateProfileRequest>();
      const profile = store.createProfile({
        name: body.name,
        vendor: body.vendor,
        model: body.model,
        arguments: body.arguments ?? [],
      });

      return c.json({ profile }, 201);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create profile";
      return c.json(toErrorResponse(message, 400), 400);
    }
  });

  app.patch("/profiles/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const body = await c.req.json<UpdateModelProfileInput>();
      const profile = store.updateProfile(id, body);
      return c.json({ profile });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";
      const status = message.includes("not found") ? 404 : 400;
      return c.json(toErrorResponse(message, status), status);
    }
  });

  app.delete("/profiles/:id", (c) => {
    const id = c.req.param("id");
    const deleted = store.deleteProfile(id);
    if (!deleted) {
      return c.json(toErrorResponse("Model profile not found", 404), 404);
    }
    return c.json({ success: true });
  });

  app.patch("/bindings", async (c) => {
    try {
      const body = await c.req.json<UpdateBindingsRequest>();
      const nextGitCommitProfileId = sanitizeOptionalProfileId(
        body.gitCommitProfileId,
      );
      const nextGitPrProfileId = sanitizeOptionalProfileId(body.gitPrProfileId);
      const nextAiDefaultProfileId = sanitizeOptionalProfileId(
        body.aiDefaultProfileId,
      );
      const input: UpdateOperationModelBindingsInput = {
        ...(nextGitCommitProfileId !== undefined && {
          gitCommitProfileId: nextGitCommitProfileId,
        }),
        ...(nextGitPrProfileId !== undefined && {
          gitPrProfileId: nextGitPrProfileId,
        }),
        ...(nextAiDefaultProfileId !== undefined && {
          aiDefaultProfileId: nextAiDefaultProfileId,
        }),
      };

      const operationBindings = store.updateOperationBindings(input);
      return c.json({ operationBindings });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update operation bindings";
      const status = message.includes("not found") ? 404 : 400;
      return c.json(toErrorResponse(message, status), status);
    }
  });

  return app;
}
