import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getFileTree,
  getAllFiles,
  mergeStatusIntoTree,
  buildTreeFromPaths,
  markBinaryFiles,
} from "./files";
import type { FileStatus } from "../../types/git";
import { execGit } from "./executor";

describe("buildTreeFromPaths", () => {
  test("builds tree from flat file list", () => {
    const paths = ["file1.txt", "file2.txt", "file3.txt"];
    const tree = buildTreeFromPaths(paths);

    expect(tree.name).toBe("");
    expect(tree.path).toBe("");
    expect(tree.type).toBe("directory");
    expect(tree.children).toBeDefined();
    expect(tree.children?.length).toBe(3);

    const children = tree.children ?? [];
    expect(children[0]?.name).toBe("file1.txt");
    expect(children[0]?.type).toBe("file");
    expect(children[1]?.name).toBe("file2.txt");
    expect(children[2]?.name).toBe("file3.txt");
  });

  test("builds tree with nested directories", () => {
    const paths = ["src/main.ts", "src/lib.ts", "src/utils/helper.ts"];
    const tree = buildTreeFromPaths(paths);

    expect(tree.children?.length).toBe(1);

    const srcDir = tree.children?.[0];
    expect(srcDir?.name).toBe("src");
    expect(srcDir?.path).toBe("src");
    expect(srcDir?.type).toBe("directory");
    expect(srcDir?.children?.length).toBe(3); // main.ts, lib.ts, utils/

    // Check that utils is a directory
    const utilsDir = srcDir?.children?.find((c) => c.name === "utils");
    expect(utilsDir?.type).toBe("directory");
    expect(utilsDir?.children?.length).toBe(1);
    expect(utilsDir?.children?.[0]?.name).toBe("helper.ts");
  });

  test("handles empty array", () => {
    const tree = buildTreeFromPaths([]);

    expect(tree.name).toBe("");
    expect(tree.path).toBe("");
    expect(tree.type).toBe("directory");
    expect(tree.children).toEqual([]);
  });

  test("sorts directories first then alphabetically", () => {
    const paths = [
      "z-file.txt",
      "a-file.txt",
      "src/main.ts",
      "lib/utils.ts",
      "docs/readme.md",
    ];
    const tree = buildTreeFromPaths(paths);

    const children = tree.children ?? [];

    // First three should be directories (alphabetically)
    expect(children[0]?.name).toBe("docs");
    expect(children[0]?.type).toBe("directory");
    expect(children[1]?.name).toBe("lib");
    expect(children[1]?.type).toBe("directory");
    expect(children[2]?.name).toBe("src");
    expect(children[2]?.type).toBe("directory");

    // Then files (alphabetically)
    expect(children[3]?.name).toBe("a-file.txt");
    expect(children[3]?.type).toBe("file");
    expect(children[4]?.name).toBe("z-file.txt");
    expect(children[4]?.type).toBe("file");
  });

  test("handles paths with correct path property", () => {
    const paths = ["a/b/c.txt"];
    const tree = buildTreeFromPaths(paths);

    const aDir = tree.children?.[0];
    expect(aDir?.path).toBe("a");

    const bDir = aDir?.children?.[0];
    expect(bDir?.path).toBe("a/b");

    const cFile = bDir?.children?.[0];
    expect(cFile?.path).toBe("a/b/c.txt");
  });
});

describe("mergeStatusIntoTree", () => {
  test("annotates files with status", () => {
    const tree = buildTreeFromPaths(["src/main.ts", "src/lib.ts", "README.md"]);

    const statuses: FileStatus[] = [
      { path: "src/main.ts", status: "modified", staged: false },
      { path: "README.md", status: "added", staged: true },
    ];

    const annotated = mergeStatusIntoTree(tree, statuses);

    // Check file statuses
    const srcDir = annotated.children?.find((c) => c.name === "src");
    const mainFile = srcDir?.children?.find((c) => c.name === "main.ts");
    expect(mainFile?.status).toBe("modified");

    const libFile = srcDir?.children?.find((c) => c.name === "lib.ts");
    expect(libFile?.status).toBeUndefined();

    const readme = annotated.children?.find((c) => c.name === "README.md");
    expect(readme?.status).toBe("added");
  });

  test("bubbles up status to parent directories", () => {
    const tree = buildTreeFromPaths(["src/utils/helper.ts", "src/main.ts"]);

    const statuses: FileStatus[] = [
      { path: "src/utils/helper.ts", status: "modified", staged: false },
    ];

    const annotated = mergeStatusIntoTree(tree, statuses);

    // src directory should have status because child has status
    const srcDir = annotated.children?.find((c) => c.name === "src");
    expect(srcDir?.status).toBe("modified");

    // utils directory should have status
    const utilsDir = srcDir?.children?.find((c) => c.name === "utils");
    expect(utilsDir?.status).toBe("modified");

    // helper.ts should have status
    const helperFile = utilsDir?.children?.find((c) => c.name === "helper.ts");
    expect(helperFile?.status).toBe("modified");
  });

  test("returns new tree without mutating original", () => {
    const tree = buildTreeFromPaths(["file.txt"]);

    const statuses: FileStatus[] = [
      { path: "file.txt", status: "modified", staged: false },
    ];

    const annotated = mergeStatusIntoTree(tree, statuses);

    // Original tree should not have status
    const originalFile = tree.children?.[0];
    expect(originalFile?.status).toBeUndefined();

    // New tree should have status
    const annotatedFile = annotated.children?.[0];
    expect(annotatedFile?.status).toBe("modified");

    // Should be different objects
    expect(tree).not.toBe(annotated);
    expect(originalFile).not.toBe(annotatedFile);
  });

  test("handles empty statuses array", () => {
    const tree = buildTreeFromPaths(["file.txt"]);
    const annotated = mergeStatusIntoTree(tree, []);

    const file = annotated.children?.[0];
    expect(file?.status).toBeUndefined();
  });

  test("handles statuses with no matching files", () => {
    const tree = buildTreeFromPaths(["file.txt"]);

    const statuses: FileStatus[] = [
      { path: "nonexistent.txt", status: "modified", staged: false },
    ];

    const annotated = mergeStatusIntoTree(tree, statuses);

    const file = annotated.children?.[0];
    expect(file?.status).toBeUndefined();
  });
});

describe("getAllFiles (integration)", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "git-files-test-"));
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("lists all tracked files in repository", async () => {
    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });

    // Create and commit files
    await writeFile(join(testDir, "file1.txt"), "content1");
    await writeFile(join(testDir, "file2.txt"), "content2");
    await mkdir(join(testDir, "subdir"));
    await writeFile(join(testDir, "subdir", "file3.txt"), "content3");

    await execGit(["add", "."], { cwd: testDir });
    await execGit(["commit", "-m", "Initial commit"], { cwd: testDir });

    // Get all files
    const files = await getAllFiles(testDir);

    expect(files.length).toBe(3);
    expect(files).toContain("file1.txt");
    expect(files).toContain("file2.txt");
    expect(files).toContain("subdir/file3.txt");
  });

  test("returns empty array for repository with no files", async () => {
    // Initialize empty git repo
    await execGit(["init"], { cwd: testDir });

    const files = await getAllFiles(testDir);

    expect(files.length).toBe(0);
  });

  test("does not include untracked files", async () => {
    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });

    // Create and commit one file
    await writeFile(join(testDir, "tracked.txt"), "tracked");
    await execGit(["add", "tracked.txt"], { cwd: testDir });
    await execGit(["commit", "-m", "Add tracked file"], { cwd: testDir });

    // Create untracked file
    await writeFile(join(testDir, "untracked.txt"), "untracked");

    const files = await getAllFiles(testDir);

    expect(files.length).toBe(1);
    expect(files).toContain("tracked.txt");
    expect(files).not.toContain("untracked.txt");
  });
});

describe("getFileTree (integration)", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "git-tree-test-"));
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("builds hierarchical tree from repository", async () => {
    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });

    // Create file structure
    await mkdir(join(testDir, "src"));
    await writeFile(join(testDir, "src", "main.ts"), "main");
    await writeFile(join(testDir, "src", "lib.ts"), "lib");
    await writeFile(join(testDir, "README.md"), "readme");

    await execGit(["add", "."], { cwd: testDir });
    await execGit(["commit", "-m", "Initial commit"], { cwd: testDir });

    const tree = await getFileTree(testDir);

    expect(tree.name).toBe("");
    expect(tree.type).toBe("directory");

    const children = tree.children ?? [];
    expect(children.length).toBe(2); // src/ and README.md

    // src should be first (directory)
    const srcDir = children[0];
    expect(srcDir?.name).toBe("src");
    expect(srcDir?.type).toBe("directory");
    expect(srcDir?.children?.length).toBe(2);

    // README.md should be second (file)
    const readme = children[1];
    expect(readme?.name).toBe("README.md");
    expect(readme?.type).toBe("file");
  });

  test("getFileTree with diffOnly=true shows only changed files", async () => {
    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });

    // Create and commit initial files
    await writeFile(join(testDir, "unchanged.txt"), "unchanged");
    await writeFile(join(testDir, "tochange.txt"), "original");
    await execGit(["add", "."], { cwd: testDir });
    await execGit(["commit", "-m", "Initial commit"], { cwd: testDir });

    // Modify one file
    await writeFile(join(testDir, "tochange.txt"), "modified");

    // Get tree with diffOnly=true
    const tree = await getFileTree(testDir, true);

    const children = tree.children ?? [];
    expect(children.length).toBe(1);
    expect(children[0]?.name).toBe("tochange.txt");
  });

  test("getFileTree with diffOnly=false shows all files", async () => {
    // Initialize git repo
    await execGit(["init"], { cwd: testDir });
    await execGit(["config", "user.name", "Test User"], { cwd: testDir });
    await execGit(["config", "user.email", "test@example.com"], {
      cwd: testDir,
    });

    // Create and commit files
    await writeFile(join(testDir, "file1.txt"), "content1");
    await writeFile(join(testDir, "file2.txt"), "content2");
    await execGit(["add", "."], { cwd: testDir });
    await execGit(["commit", "-m", "Initial commit"], { cwd: testDir });

    // Modify one file
    await writeFile(join(testDir, "file1.txt"), "modified");

    // Get tree with diffOnly=false (or undefined)
    const tree = await getFileTree(testDir, false);

    const children = tree.children ?? [];
    expect(children.length).toBe(2);
    expect(children.some((c) => c.name === "file1.txt")).toBe(true);
    expect(children.some((c) => c.name === "file2.txt")).toBe(true);
  });

  test("handles new repository with no HEAD", async () => {
    // Initialize empty git repo (no commits)
    await execGit(["init"], { cwd: testDir });

    // Should not throw error, should return empty tree
    const tree = await getFileTree(testDir, true);

    expect(tree.type).toBe("directory");
    expect(tree.children).toEqual([]);
  });
});

describe("markBinaryFiles", () => {
  test("marks image files as binary", () => {
    const tree = buildTreeFromPaths([
      "image.png",
      "photo.jpg",
      "icon.svg",
      "logo.gif",
    ]);

    const marked = markBinaryFiles(tree);

    const children = marked.children ?? [];
    expect(children[0]?.isBinary).toBe(true); // gif
    expect(children[1]?.isBinary).toBe(true); // jpg
    expect(children[2]?.isBinary).toBe(true); // png
    expect(children[3]?.isBinary).toBe(true); // svg
  });

  test("marks non-image binary files", () => {
    const tree = buildTreeFromPaths([
      "archive.zip",
      "document.pdf",
      "executable.exe",
      "font.woff",
    ]);

    const marked = markBinaryFiles(tree);

    const children = marked.children ?? [];
    expect(children[0]?.isBinary).toBe(true); // exe
    expect(children[1]?.isBinary).toBe(true); // pdf
    expect(children[2]?.isBinary).toBe(true); // woff
    expect(children[3]?.isBinary).toBe(true); // zip
  });

  test("does not mark text files as binary", () => {
    const tree = buildTreeFromPaths([
      "script.js",
      "style.css",
      "readme.md",
      "config.json",
    ]);

    const marked = markBinaryFiles(tree);

    const children = marked.children ?? [];
    expect(children[0]?.isBinary).toBeUndefined();
    expect(children[1]?.isBinary).toBeUndefined();
    expect(children[2]?.isBinary).toBeUndefined();
    expect(children[3]?.isBinary).toBeUndefined();
  });

  test("handles mixed binary and text files", () => {
    const tree = buildTreeFromPaths([
      "src/main.ts",
      "assets/logo.png",
      "docs/readme.md",
      "lib/library.so",
    ]);

    const marked = markBinaryFiles(tree);

    // Check individual files
    const assetsDir = marked.children?.find((c) => c.name === "assets");
    const logo = assetsDir?.children?.find((c) => c.name === "logo.png");
    expect(logo?.isBinary).toBe(true);

    const srcDir = marked.children?.find((c) => c.name === "src");
    const main = srcDir?.children?.find((c) => c.name === "main.ts");
    expect(main?.isBinary).toBeUndefined();

    const docsDir = marked.children?.find((c) => c.name === "docs");
    const readme = docsDir?.children?.find((c) => c.name === "readme.md");
    expect(readme?.isBinary).toBeUndefined();

    const libDir = marked.children?.find((c) => c.name === "lib");
    const library = libDir?.children?.find((c) => c.name === "library.so");
    expect(library?.isBinary).toBe(true);
  });

  test("handles nested directories correctly", () => {
    const tree = buildTreeFromPaths([
      "src/assets/images/icon.png",
      "src/code/main.ts",
    ]);

    const marked = markBinaryFiles(tree);

    const srcDir = marked.children?.find((c) => c.name === "src");
    const assetsDir = srcDir?.children?.find((c) => c.name === "assets");
    const imagesDir = assetsDir?.children?.find((c) => c.name === "images");
    const icon = imagesDir?.children?.find((c) => c.name === "icon.png");
    expect(icon?.isBinary).toBe(true);

    const codeDir = srcDir?.children?.find((c) => c.name === "code");
    const main = codeDir?.children?.find((c) => c.name === "main.ts");
    expect(main?.isBinary).toBeUndefined();
  });

  test("does not mark directories as binary", () => {
    const tree = buildTreeFromPaths(["dir/file.png"]);

    const marked = markBinaryFiles(tree);

    const dir = marked.children?.[0];
    expect(dir?.type).toBe("directory");
    expect(dir?.isBinary).toBeUndefined(); // Directories should not be marked
  });

  test("returns new tree without mutating original", () => {
    const tree = buildTreeFromPaths(["image.png"]);

    const marked = markBinaryFiles(tree);

    // Original tree should not have isBinary
    const originalFile = tree.children?.[0];
    expect(originalFile?.isBinary).toBeUndefined();

    // New tree should have isBinary
    const markedFile = marked.children?.[0];
    expect(markedFile?.isBinary).toBe(true);

    // Should be different objects
    expect(tree).not.toBe(marked);
    expect(originalFile).not.toBe(markedFile);
  });

  test("handles empty tree", () => {
    const tree = buildTreeFromPaths([]);

    const marked = markBinaryFiles(tree);

    expect(marked.children).toEqual([]);
  });

  test("handles case insensitive extensions", () => {
    const tree = buildTreeFromPaths(["image.PNG", "photo.JPG", "archive.ZIP"]);

    const marked = markBinaryFiles(tree);

    const children = marked.children ?? [];
    expect(children[0]?.isBinary).toBe(true); // JPG
    expect(children[1]?.isBinary).toBe(true); // PNG
    expect(children[2]?.isBinary).toBe(true); // ZIP
  });

  test("handles files without extensions", () => {
    const tree = buildTreeFromPaths(["README", "Makefile", "LICENSE"]);

    const marked = markBinaryFiles(tree);

    const children = marked.children ?? [];
    expect(children[0]?.isBinary).toBeUndefined();
    expect(children[1]?.isBinary).toBeUndefined();
    expect(children[2]?.isBinary).toBeUndefined();
  });
});
