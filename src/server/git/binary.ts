/**
 * Binary File Detection Utilities
 *
 * Provides functions for detecting binary files, image files, and large files
 * with MIME type resolution and content analysis.
 */

/**
 * Known image file extensions (previewable formats)
 */
export type ImageExtension =
  | "png"
  | "jpg"
  | "jpeg"
  | "gif"
  | "svg"
  | "webp"
  | "ico"
  | "bmp";

/**
 * Known binary file extensions
 */
export type BinaryExtension =
  | ImageExtension
  | "pdf"
  | "zip"
  | "tar"
  | "gz"
  | "exe"
  | "dll"
  | "so"
  | "dylib"
  | "woff"
  | "woff2"
  | "ttf"
  | "eot"
  | "mp4"
  | "webm"
  | "mov"
  | "mp3"
  | "wav"
  | "ogg";

/**
 * Binary file detection result with metadata
 */
export interface BinaryDetectionResult {
  readonly isBinary: boolean;
  readonly isImage: boolean;
  readonly extension: string;
  readonly mimeType?: string | undefined;
}

/**
 * Large file information with size metadata
 */
export interface LargeFileInfo {
  readonly isLarge: boolean;
  readonly size: number;
  readonly threshold: number;
}

/**
 * Large file threshold in bytes (1MB)
 */
export const LARGE_FILE_THRESHOLD = 1_048_576;

/**
 * Partial content limit for large files in bytes (10KB)
 */
export const PARTIAL_CONTENT_LIMIT = 10_240;

/**
 * Set of known binary file extensions
 */
const BINARY_EXTENSIONS = new Set<string>([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
  "pdf",
  "zip",
  "tar",
  "gz",
  "exe",
  "dll",
  "so",
  "dylib",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "ogg",
]);

/**
 * Set of known image file extensions
 */
const IMAGE_EXTENSIONS = new Set<string>([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
]);

/**
 * Map of file extensions to MIME types
 */
const MIME_TYPE_MAP = new Map<string, string>([
  // Images
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
  ["ico", "image/x-icon"],
  ["bmp", "image/bmp"],
  // Documents
  ["pdf", "application/pdf"],
  // Archives
  ["zip", "application/zip"],
  ["tar", "application/x-tar"],
  ["gz", "application/gzip"],
  // Executables
  ["exe", "application/x-msdownload"],
  ["dll", "application/x-msdownload"],
  ["so", "application/x-sharedlib"],
  ["dylib", "application/x-sharedlib"],
  // Fonts
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttf", "font/ttf"],
  ["eot", "application/vnd.ms-fontobject"],
  // Video
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  // Audio
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["ogg", "audio/ogg"],
]);

/**
 * Extract file extension from file path
 *
 * @param filePath - Path to the file
 * @returns Lowercase file extension without dot, or empty string if no extension
 *
 * @example
 * ```typescript
 * extractExtension('image.png'); // 'png'
 * extractExtension('document.tar.gz'); // 'gz'
 * extractExtension('noext'); // ''
 * ```
 */
function extractExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return "";
  }
  return filePath.slice(lastDot + 1).toLowerCase();
}

/**
 * Check if file path has a known binary extension
 *
 * @param filePath - Path to check
 * @returns True if extension is in known binary list
 *
 * @example
 * ```typescript
 * isBinaryExtension('image.png'); // true
 * isBinaryExtension('file.exe'); // true
 * isBinaryExtension('script.js'); // false
 * isBinaryExtension('noext'); // false
 * ```
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = extractExtension(filePath);
  return ext.length > 0 && BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if file path has a known image extension
 *
 * @param filePath - Path to check
 * @returns True if extension is a previewable image format
 *
 * @example
 * ```typescript
 * isImageExtension('photo.jpg'); // true
 * isImageExtension('icon.svg'); // true
 * isImageExtension('archive.zip'); // false
 * isImageExtension('document.pdf'); // false
 * ```
 */
export function isImageExtension(filePath: string): boolean {
  const ext = extractExtension(filePath);
  return ext.length > 0 && IMAGE_EXTENSIONS.has(ext);
}

/**
 * Detect binary content by scanning for null bytes or control characters
 *
 * Scans the first portion of the buffer (up to 8KB) for indicators of binary data.
 * Null bytes and excessive control characters suggest binary content.
 *
 * @param buffer - Content buffer to analyze
 * @returns True if content appears to be binary
 *
 * @example
 * ```typescript
 * const textBuffer = new TextEncoder().encode('Hello, world!');
 * detectBinaryContent(textBuffer); // false
 *
 * const binaryBuffer = new Uint8Array([0x00, 0x01, 0x02, 0xFF]);
 * detectBinaryContent(binaryBuffer); // true
 * ```
 */
export function detectBinaryContent(buffer: Uint8Array): boolean {
  // Empty buffer is not binary
  if (buffer.length === 0) {
    return false;
  }

  // Scan up to first 8KB for performance
  const scanLength = Math.min(buffer.length, 8192);
  let controlChars = 0;

  for (let i = 0; i < scanLength; i++) {
    const byte = buffer[i];
    if (byte === undefined) {
      continue;
    }

    // Null byte is a strong binary indicator
    if (byte === 0) {
      return true;
    }

    // Count control characters (excluding common whitespace)
    // ASCII control chars: 0-31, excluding tab(9), LF(10), CR(13)
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlChars++;
    }
  }

  // If more than 10% of scanned bytes are control chars, likely binary
  const controlCharThreshold = scanLength * 0.1;
  return controlChars > controlCharThreshold;
}

/**
 * Detect if file is binary using extension and optional content analysis
 *
 * First checks extension against known binary types. If content is provided,
 * also scans content for binary indicators.
 *
 * @param filePath - Path to the file
 * @param content - Optional file content buffer for analysis
 * @returns Binary detection result with metadata
 *
 * @example
 * ```typescript
 * // Extension-only detection
 * const result1 = detectBinary('image.png');
 * // { isBinary: true, isImage: true, extension: 'png', mimeType: 'image/png' }
 *
 * // Content-based detection
 * const buffer = await Bun.file('unknown.dat').arrayBuffer();
 * const result2 = detectBinary('unknown.dat', new Uint8Array(buffer));
 * // { isBinary: true, isImage: false, extension: 'dat', mimeType: undefined }
 * ```
 */
export function detectBinary(
  filePath: string,
  content?: Uint8Array | undefined,
): BinaryDetectionResult {
  const extension = extractExtension(filePath);
  const isBinaryExt = isBinaryExtension(filePath);
  const isImageExt = isImageExtension(filePath);

  // If extension indicates binary, trust it
  if (isBinaryExt) {
    return {
      isBinary: true,
      isImage: isImageExt,
      extension,
      mimeType: getMimeType(filePath),
    };
  }

  // If content provided, analyze it
  if (content !== undefined) {
    const isBinaryContent = detectBinaryContent(content);
    return {
      isBinary: isBinaryContent,
      isImage: false,
      extension,
      mimeType: isBinaryContent ? undefined : getMimeType(filePath),
    };
  }

  // No binary indicators found
  return {
    isBinary: false,
    isImage: false,
    extension,
    mimeType: getMimeType(filePath),
  };
}

/**
 * Check if file exceeds large file threshold
 *
 * Uses Bun.file() to get file size without reading entire contents.
 * Compares against LARGE_FILE_THRESHOLD (1MB).
 *
 * @param filePath - Path to file (relative to project)
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to large file info with size metadata
 *
 * @example
 * ```typescript
 * const info = await checkLargeFile('big-file.txt', '/path/to/project');
 * if (info.isLarge) {
 *   console.log(`File is ${info.size} bytes (threshold: ${info.threshold})`);
 * }
 * ```
 */
export async function checkLargeFile(
  filePath: string,
  projectPath: string,
): Promise<LargeFileInfo> {
  const fullPath = `${projectPath}/${filePath}`;
  const file = Bun.file(fullPath);

  try {
    const size = file.size;
    return {
      isLarge: size > LARGE_FILE_THRESHOLD,
      size,
      threshold: LARGE_FILE_THRESHOLD,
    };
  } catch {
    // File doesn't exist or can't be accessed
    return {
      isLarge: false,
      size: 0,
      threshold: LARGE_FILE_THRESHOLD,
    };
  }
}

/**
 * Get MIME type for file based on extension
 *
 * @param filePath - Path to file
 * @returns MIME type string if known, undefined otherwise
 *
 * @example
 * ```typescript
 * getMimeType('image.png'); // 'image/png'
 * getMimeType('video.mp4'); // 'video/mp4'
 * getMimeType('unknown.xyz'); // undefined
 * ```
 */
export function getMimeType(filePath: string): string | undefined {
  const ext = extractExtension(filePath);
  return MIME_TYPE_MAP.get(ext);
}
