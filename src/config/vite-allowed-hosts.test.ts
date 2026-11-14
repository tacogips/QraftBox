import { afterEach, describe, expect, test } from "bun:test";
import {
  VITE_ALLOWED_HOSTS_ENV_VAR,
  resolveViteAllowedHosts,
} from "./vite-allowed-hosts";

const originalAllowedHosts = process.env[VITE_ALLOWED_HOSTS_ENV_VAR];

afterEach(() => {
  if (originalAllowedHosts === undefined) {
    delete process.env[VITE_ALLOWED_HOSTS_ENV_VAR];
    return;
  }

  process.env[VITE_ALLOWED_HOSTS_ENV_VAR] = originalAllowedHosts;
});

describe("resolveViteAllowedHosts", () => {
  test("returns undefined when the environment variable is unset", () => {
    delete process.env[VITE_ALLOWED_HOSTS_ENV_VAR];

    expect(resolveViteAllowedHosts()).toBeUndefined();
  });

  test("returns undefined for blank configuration", () => {
    expect(resolveViteAllowedHosts("   ")).toBeUndefined();
  });

  test("parses comma-separated hosts and removes duplicates", () => {
    expect(
      resolveViteAllowedHosts("nixos, qraftbox.local, nixos, 100.101.102.103"),
    ).toEqual(["nixos", "qraftbox.local", "100.101.102.103"]);
  });

  test("supports allowing every host explicitly", () => {
    expect(resolveViteAllowedHosts("*")).toBe(true);
    expect(resolveViteAllowedHosts("all")).toBe(true);
    expect(resolveViteAllowedHosts("true")).toBe(true);
  });

  test("reads the value from process.env by default", () => {
    process.env[VITE_ALLOWED_HOSTS_ENV_VAR] = "nixos";

    expect(resolveViteAllowedHosts()).toEqual(["nixos"]);
  });
});
