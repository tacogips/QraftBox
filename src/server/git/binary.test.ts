import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isBinaryExtension,
  isImageExtension,
  detectBinaryContent,
  detectBinary,
  checkLargeFile,
  getMimeType,
  LARGE_FILE_THRESHOLD,
  PARTIAL_CONTENT_LIMIT,
} from "./binary";

describe("isBinaryExtension", () => {
  test("detects image extensions", () => {
    expect(isBinaryExtension("photo.png")).toBe(true);
    expect(isBinaryExtension("image.jpg")).toBe(true);
    expect(isBinaryExtension("picture.jpeg")).toBe(true);
    expect(isBinaryExtension("animation.gif")).toBe(true);
    expect(isBinaryExtension("icon.svg")).toBe(true);
    expect(isBinaryExtension("photo.webp")).toBe(true);
    expect(isBinaryExtension("favicon.ico")).toBe(true);
    expect(isBinaryExtension("bitmap.bmp")).toBe(true);
  });

  test("detects document extensions", () => {
    expect(isBinaryExtension("document.pdf")).toBe(true);
  });

  test("detects archive extensions", () => {
    expect(isBinaryExtension("archive.zip")).toBe(true);
    expect(isBinaryExtension("backup.tar")).toBe(true);
    expect(isBinaryExtension("compressed.gz")).toBe(true);
  });

  test("detects executable extensions", () => {
    expect(isBinaryExtension("program.exe")).toBe(true);
    expect(isBinaryExtension("library.dll")).toBe(true);
    expect(isBinaryExtension("linux.so")).toBe(true);
    expect(isBinaryExtension("macos.dylib")).toBe(true);
  });

  test("detects font extensions", () => {
    expect(isBinaryExtension("font.woff")).toBe(true);
    expect(isBinaryExtension("font.woff2")).toBe(true);
    expect(isBinaryExtension("font.ttf")).toBe(true);
    expect(isBinaryExtension("font.eot")).toBe(true);
  });

  test("detects video extensions", () => {
    expect(isBinaryExtension("video.mp4")).toBe(true);
    expect(isBinaryExtension("clip.webm")).toBe(true);
    expect(isBinaryExtension("movie.mov")).toBe(true);
  });

  test("detects audio extensions", () => {
    expect(isBinaryExtension("audio.mp3")).toBe(true);
    expect(isBinaryExtension("sound.wav")).toBe(true);
    expect(isBinaryExtension("music.ogg")).toBe(true);
  });

  test("does not detect text file extensions", () => {
    expect(isBinaryExtension("script.js")).toBe(false);
    expect(isBinaryExtension("document.txt")).toBe(false);
    expect(isBinaryExtension("markup.html")).toBe(false);
    expect(isBinaryExtension("data.json")).toBe(false);
    expect(isBinaryExtension("config.yml")).toBe(false);
    expect(isBinaryExtension("readme.md")).toBe(false);
  });

  test("handles files with no extension", () => {
    expect(isBinaryExtension("Makefile")).toBe(false);
    expect(isBinaryExtension("LICENSE")).toBe(false);
    expect(isBinaryExtension("README")).toBe(false);
  });

  test("handles case insensitivity", () => {
    expect(isBinaryExtension("IMAGE.PNG")).toBe(true);
    expect(isBinaryExtension("Photo.JPG")).toBe(true);
    expect(isBinaryExtension("VIDEO.MP4")).toBe(true);
  });

  test("handles paths with multiple dots", () => {
    expect(isBinaryExtension("archive.tar.gz")).toBe(true);
    expect(isBinaryExtension("file.backup.zip")).toBe(true);
    expect(isBinaryExtension("my.file.txt")).toBe(false);
  });

  test("handles paths with directories", () => {
    expect(isBinaryExtension("path/to/image.png")).toBe(true);
    expect(isBinaryExtension("src/main.ts")).toBe(false);
  });
});

describe("isImageExtension", () => {
  test("detects image extensions", () => {
    expect(isImageExtension("photo.png")).toBe(true);
    expect(isImageExtension("image.jpg")).toBe(true);
    expect(isImageExtension("picture.jpeg")).toBe(true);
    expect(isImageExtension("animation.gif")).toBe(true);
    expect(isImageExtension("icon.svg")).toBe(true);
    expect(isImageExtension("photo.webp")).toBe(true);
    expect(isImageExtension("favicon.ico")).toBe(true);
    expect(isImageExtension("bitmap.bmp")).toBe(true);
  });

  test("does not detect non-image binary extensions", () => {
    expect(isImageExtension("document.pdf")).toBe(false);
    expect(isImageExtension("archive.zip")).toBe(false);
    expect(isImageExtension("program.exe")).toBe(false);
    expect(isImageExtension("font.woff")).toBe(false);
    expect(isImageExtension("video.mp4")).toBe(false);
    expect(isImageExtension("audio.mp3")).toBe(false);
  });

  test("does not detect text file extensions", () => {
    expect(isImageExtension("script.js")).toBe(false);
    expect(isImageExtension("document.txt")).toBe(false);
    expect(isImageExtension("markup.html")).toBe(false);
  });

  test("handles case insensitivity", () => {
    expect(isImageExtension("IMAGE.PNG")).toBe(true);
    expect(isImageExtension("Photo.JPG")).toBe(true);
  });

  test("handles files with no extension", () => {
    expect(isImageExtension("README")).toBe(false);
  });
});

describe("detectBinaryContent", () => {
  test("detects null bytes as binary", () => {
    const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00]); // "Hello" + null
    expect(detectBinaryContent(buffer)).toBe(true);
  });

  test("detects excessive control characters as binary", () => {
    // Create buffer with many control characters
    const buffer = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      buffer[i] = i % 2 === 0 ? 0x01 : 0x41; // Mix control chars with 'A'
    }
    expect(detectBinaryContent(buffer)).toBe(true);
  });

  test("treats normal text as non-binary", () => {
    const text = "Hello, world! This is a normal text file.\n";
    const buffer = new TextEncoder().encode(text);
    expect(detectBinaryContent(buffer)).toBe(false);
  });

  test("allows common whitespace characters", () => {
    const text = "Line 1\nLine 2\tTabbed\rCarriage return";
    const buffer = new TextEncoder().encode(text);
    expect(detectBinaryContent(buffer)).toBe(false);
  });

  test("treats empty buffer as non-binary", () => {
    const buffer = new Uint8Array(0);
    expect(detectBinaryContent(buffer)).toBe(false);
  });

  test("handles large buffers efficiently", () => {
    // Create 100KB text buffer
    const text = "x".repeat(100_000);
    const buffer = new TextEncoder().encode(text);
    expect(detectBinaryContent(buffer)).toBe(false);
  });

  test("detects PNG file signature", () => {
    // PNG file signature: 137 80 78 71 13 10 26 10
    const buffer = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(detectBinaryContent(buffer)).toBe(true);
  });

  test("detects binary with many high-value bytes", () => {
    // Create buffer with many non-ASCII bytes (binary data)
    const buffer = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      buffer[i] = 0x80 + (i % 50); // High-value bytes
    }
    // Note: High-value bytes alone don't trigger binary detection
    // Only null bytes or excessive control chars do
    // This test shows content that would need extension-based detection
    expect(detectBinaryContent(buffer)).toBe(false);
  });
});

describe("detectBinary", () => {
  test("detects binary by extension without content", () => {
    const result = detectBinary("image.png");
    expect(result.isBinary).toBe(true);
    expect(result.isImage).toBe(true);
    expect(result.extension).toBe("png");
    expect(result.mimeType).toBe("image/png");
  });

  test("detects binary by content when extension unknown", () => {
    const binaryContent = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    const result = detectBinary("unknown.dat", binaryContent);
    expect(result.isBinary).toBe(true);
    expect(result.isImage).toBe(false);
    expect(result.extension).toBe("dat");
    expect(result.mimeType).toBeUndefined();
  });

  test("detects text file correctly", () => {
    const textContent = new TextEncoder().encode("Hello, world!");
    const result = detectBinary("script.js", textContent);
    expect(result.isBinary).toBe(false);
    expect(result.isImage).toBe(false);
    expect(result.extension).toBe("js");
  });

  test("trusts binary extension even without content", () => {
    const result = detectBinary("video.mp4");
    expect(result.isBinary).toBe(true);
    expect(result.isImage).toBe(false);
    expect(result.mimeType).toBe("video/mp4");
  });

  test("handles different image formats", () => {
    const formats = [
      { file: "photo.jpg", mime: "image/jpeg" },
      { file: "icon.svg", mime: "image/svg+xml" },
      { file: "animation.gif", mime: "image/gif" },
      { file: "picture.webp", mime: "image/webp" },
    ];

    for (const { file, mime } of formats) {
      const result = detectBinary(file);
      expect(result.isBinary).toBe(true);
      expect(result.isImage).toBe(true);
      expect(result.mimeType).toBe(mime);
    }
  });

  test("handles files with no extension", () => {
    const result = detectBinary("README");
    expect(result.isBinary).toBe(false);
    expect(result.isImage).toBe(false);
    expect(result.extension).toBe("");
    expect(result.mimeType).toBeUndefined();
  });

  test("combines extension and content detection", () => {
    // Text extension but binary content (corrupted file)
    const binaryContent = new Uint8Array([0x00, 0xff, 0x00]);
    const result = detectBinary("fake.txt", binaryContent);
    expect(result.isBinary).toBe(true);
    expect(result.isImage).toBe(false);
  });
});

describe("checkLargeFile", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "large-file-test-"));
  });

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("detects file above threshold", async () => {
    // Create file larger than 1MB
    const largeContent = "x".repeat(LARGE_FILE_THRESHOLD + 1000);
    const filePath = "large.txt";
    await writeFile(join(testDir, filePath), largeContent);

    const info = await checkLargeFile(filePath, testDir);

    expect(info.isLarge).toBe(true);
    expect(info.size).toBeGreaterThan(LARGE_FILE_THRESHOLD);
    expect(info.threshold).toBe(LARGE_FILE_THRESHOLD);
  });

  test("detects file below threshold", async () => {
    // Create small file
    const smallContent = "Small content";
    const filePath = "small.txt";
    await writeFile(join(testDir, filePath), smallContent);

    const info = await checkLargeFile(filePath, testDir);

    expect(info.isLarge).toBe(false);
    expect(info.size).toBeLessThan(LARGE_FILE_THRESHOLD);
    expect(info.threshold).toBe(LARGE_FILE_THRESHOLD);
  });

  test("detects file exactly at threshold", async () => {
    // Create file exactly at threshold
    const content = "x".repeat(LARGE_FILE_THRESHOLD);
    const filePath = "exact.txt";
    await writeFile(join(testDir, filePath), content);

    const info = await checkLargeFile(filePath, testDir);

    expect(info.isLarge).toBe(false);
    expect(info.size).toBe(LARGE_FILE_THRESHOLD);
  });

  test("handles non-existent file", async () => {
    const info = await checkLargeFile("nonexistent.txt", testDir);

    expect(info.isLarge).toBe(false);
    expect(info.size).toBe(0);
    expect(info.threshold).toBe(LARGE_FILE_THRESHOLD);
  });

  test("handles empty file", async () => {
    const filePath = "empty.txt";
    await writeFile(join(testDir, filePath), "");

    const info = await checkLargeFile(filePath, testDir);

    expect(info.isLarge).toBe(false);
    expect(info.size).toBe(0);
  });

  test("handles nested path", async () => {
    const content = "x".repeat(LARGE_FILE_THRESHOLD + 100);
    const filePath = "subdir/nested/large.txt";
    const fullDir = join(testDir, "subdir", "nested");
    await Bun.write(join(fullDir, "large.txt"), content);

    const info = await checkLargeFile(filePath, testDir);

    expect(info.isLarge).toBe(true);
  });
});

describe("getMimeType", () => {
  test("returns MIME type for image formats", () => {
    expect(getMimeType("image.png")).toBe("image/png");
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("picture.jpeg")).toBe("image/jpeg");
    expect(getMimeType("animation.gif")).toBe("image/gif");
    expect(getMimeType("icon.svg")).toBe("image/svg+xml");
    expect(getMimeType("photo.webp")).toBe("image/webp");
    expect(getMimeType("favicon.ico")).toBe("image/x-icon");
    expect(getMimeType("bitmap.bmp")).toBe("image/bmp");
  });

  test("returns MIME type for document formats", () => {
    expect(getMimeType("document.pdf")).toBe("application/pdf");
  });

  test("returns MIME type for archive formats", () => {
    expect(getMimeType("archive.zip")).toBe("application/zip");
    expect(getMimeType("backup.tar")).toBe("application/x-tar");
    expect(getMimeType("compressed.gz")).toBe("application/gzip");
  });

  test("returns MIME type for executable formats", () => {
    expect(getMimeType("program.exe")).toBe("application/x-msdownload");
    expect(getMimeType("library.dll")).toBe("application/x-msdownload");
    expect(getMimeType("linux.so")).toBe("application/x-sharedlib");
    expect(getMimeType("macos.dylib")).toBe("application/x-sharedlib");
  });

  test("returns MIME type for font formats", () => {
    expect(getMimeType("font.woff")).toBe("font/woff");
    expect(getMimeType("font.woff2")).toBe("font/woff2");
    expect(getMimeType("font.ttf")).toBe("font/ttf");
    expect(getMimeType("font.eot")).toBe("application/vnd.ms-fontobject");
  });

  test("returns MIME type for video formats", () => {
    expect(getMimeType("video.mp4")).toBe("video/mp4");
    expect(getMimeType("clip.webm")).toBe("video/webm");
    expect(getMimeType("movie.mov")).toBe("video/quicktime");
  });

  test("returns MIME type for audio formats", () => {
    expect(getMimeType("audio.mp3")).toBe("audio/mpeg");
    expect(getMimeType("sound.wav")).toBe("audio/wav");
    expect(getMimeType("music.ogg")).toBe("audio/ogg");
  });

  test("returns undefined for unknown extensions", () => {
    expect(getMimeType("file.unknown")).toBeUndefined();
    expect(getMimeType("data.xyz")).toBeUndefined();
    expect(getMimeType("script.js")).toBeUndefined();
  });

  test("returns undefined for files with no extension", () => {
    expect(getMimeType("README")).toBeUndefined();
    expect(getMimeType("Makefile")).toBeUndefined();
  });

  test("handles case insensitivity", () => {
    expect(getMimeType("IMAGE.PNG")).toBe("image/png");
    expect(getMimeType("Video.MP4")).toBe("video/mp4");
  });

  test("handles paths with directories", () => {
    expect(getMimeType("path/to/image.png")).toBe("image/png");
  });
});

describe("constants", () => {
  test("LARGE_FILE_THRESHOLD is 1MB", () => {
    expect(LARGE_FILE_THRESHOLD).toBe(1_048_576);
  });

  test("PARTIAL_CONTENT_LIMIT is 10KB", () => {
    expect(PARTIAL_CONTENT_LIMIT).toBe(10_240);
  });
});
