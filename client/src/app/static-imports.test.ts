import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOLID_CONTROL_FLOW_COMPONENTS = [
  "For",
  "Match",
  "Show",
  "Switch",
] as const;

function collectTsxFiles(directoryPath: string): readonly string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...collectTsxFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".tsx")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function collectUsedControlFlowComponents(
  fileContents: string,
): readonly string[] {
  return SOLID_CONTROL_FLOW_COMPONENTS.filter((componentName) =>
    new RegExp(`<${componentName}\\b`).test(fileContents),
  );
}

function collectImportedSolidBindings(
  fileContents: string,
): ReadonlySet<string> {
  const solidImportMatch = fileContents.match(
    /import\s*\{([^}]*)\}\s*from\s*["']solid-js["']/s,
  );
  if (solidImportMatch === null) {
    return new Set<string>();
  }

  const bindingNames = solidImportMatch[1]
    .split(",")
    .map((bindingName) => bindingName.trim())
    .filter((bindingName) => bindingName.length > 0)
    .map((bindingName) => bindingName.split(/\s+as\s+/u)[0]?.trim() ?? "");

  return new Set(bindingNames.filter((bindingName) => bindingName.length > 0));
}

describe("solid tsx imports", () => {
  test("imports solid control-flow components explicitly when they are used", () => {
    const sourceRoot = join(import.meta.dir, "..");
    const tsxFilePaths = collectTsxFiles(sourceRoot);

    const missingImports = tsxFilePaths.flatMap((tsxFilePath) => {
      const fileContents = readFileSync(tsxFilePath, "utf8");
      const usedComponents = collectUsedControlFlowComponents(fileContents);
      if (usedComponents.length === 0) {
        return [];
      }

      const importedBindings = collectImportedSolidBindings(fileContents);
      const missingBindings = usedComponents.filter(
        (componentName) => !importedBindings.has(componentName),
      );

      return missingBindings.map(
        (bindingName) =>
          `${tsxFilePath.replace(`${sourceRoot}/`, "")}: missing ${bindingName}`,
      );
    });

    expect(missingImports).toEqual([]);
  });
});
