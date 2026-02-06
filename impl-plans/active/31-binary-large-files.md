# Binary & Large File Handling Implementation Plan

**Status**: Ready
**Phase**: 12
**Design Reference**: design-docs/specs/design-local-diff-viewer.md#binary-and-large-file-handling
**Created**: 2026-02-07
**Last Updated**: 2026-02-07

---

## Design Document Reference

**Source**: design-docs/specs/design-local-diff-viewer.md

### Summary
Binary file detection and display, image preview support, badge indicators in file tree, and large file handling with partial content loading. Extends existing git types and file routes to support binary/large file scenarios.

### Scope
**Included**: Binary detection, image preview for known formats, [IMG]/[BIN] badges, large file threshold (1MB) with partial loading, DiffFile binary/size metadata extension, file route extensions
**Excluded**: Video file preview (future), client-side rendering of image previews (client layer)

---

## Modules

### 1. Binary Detection Utilities

#### src/server/git/binary.ts

**Status**: COMPLETED

```typescript
// Known binary extensions
type ImageExtension = "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "ico" | "bmp";
type BinaryExtension = ImageExtension | "pdf" | "zip" | "tar" | "gz" | "exe" | "dll" | "so" | "dylib" | "woff" | "woff2" | "ttf" | "eot" | "mp4" | "webm" | "mov" | "mp3" | "wav" | "ogg";

interface BinaryDetectionResult {
  readonly isBinary: boolean;
  readonly isImage: boolean;
  readonly extension: string;
  readonly mimeType?: string;
}

// Large file threshold: 1MB
const LARGE_FILE_THRESHOLD: number; // 1_048_576

// Partial content limit: 10KB
const PARTIAL_CONTENT_LIMIT: number; // 10_240

interface LargeFileInfo {
  readonly isLarge: boolean;
  readonly size: number;
  readonly threshold: number;
}

function isBinaryExtension(filePath: string): boolean;
function isImageExtension(filePath: string): boolean;
function detectBinaryContent(buffer: Uint8Array): boolean;
function detectBinary(filePath: string, content?: Uint8Array): BinaryDetectionResult;
function checkLargeFile(filePath: string, projectPath: string): Promise<LargeFileInfo>;
function getMimeType(filePath: string): string | undefined;
```

**Checklist**:
- [x] isBinaryExtension checking file extension against known list
- [x] isImageExtension checking for previewable image formats
- [x] detectBinaryContent scanning first bytes for null bytes / control chars
- [x] detectBinary combining extension and content detection
- [x] checkLargeFile getting file size and comparing to threshold
- [x] getMimeType returning MIME type from extension
- [x] Export constants LARGE_FILE_THRESHOLD, PARTIAL_CONTENT_LIMIT
- [x] Unit tests

---

### 2. Git Types Extension

#### src/types/git.ts (extension)

**Status**: COMPLETED

Note: This extends the DiffFile and FileNode interfaces defined in Plan 26 with binary/size metadata.

```typescript
// Extended DiffFile fields (to be added to Plan 26's DiffFile):
// readonly isBinary: boolean;       (already in Plan 26)
// readonly fileSize?: number;       (already in Plan 26)

// Extended FileNode fields (to be added to Plan 26's FileNode):
// readonly isBinary?: boolean;      (already in Plan 26)

// Additional badge type for file tree display
type FileBadge = "M" | "+" | "-" | "R" | "IMG" | "BIN";

function getFileBadge(node: FileNode): FileBadge | undefined;
```

**Checklist**:
- [x] Verify DiffFile has isBinary and fileSize fields (Plan 26)
- [x] Verify FileNode has isBinary field (Plan 26)
- [x] Define FileBadge type
- [x] getFileBadge helper function
- [x] Unit tests

---

### 3. File Route Extensions

#### src/server/routes/files.ts (extension)

**Status**: COMPLETED

Note: This extends Plan 27's file routes with binary/large file handling.

```typescript
// Extended FileContentResponse (modifies Plan 27):
interface FileContentResponse {
  readonly path: string;
  readonly content: string;          // Base64 for binary images, empty for other binaries, text for text
  readonly language: string;
  readonly lineCount: number;
  readonly size: number;
  readonly isBinary: boolean;
  readonly isImage?: boolean | undefined;
  readonly mimeType?: string | undefined;
  readonly badge?: string | undefined;     // "IMG" | "BIN"
  readonly isPartial?: boolean | undefined;
  readonly fullSize?: number | undefined;
}

// GET /file/*path?full=true&ref=HEAD
// Query param: full=true to load full content for large files
// Query param: ref=<git-ref> to load from specific commit/branch
```

**Checklist**:
- [x] Detect binary files before sending content
- [x] Return base64-encoded content for binary images
- [x] Return empty content for non-image binaries
- [x] Return image MIME type for image files
- [x] Apply LARGE_FILE_THRESHOLD check
- [x] Return partial content (first 10KB) for large files
- [x] Support ?full=true query param to load full content
- [x] Set isPartial flag and fullSize when truncated
- [x] Unit tests (7 new tests added)

---

### 4. File Tree Binary Badges

#### src/server/git/files.ts (extension)

**Status**: COMPLETED

Note: This extends Plan 26's file tree with binary detection.

```typescript
// markBinaryFiles function walks file tree and sets isBinary flag
function markBinaryFiles(root: FileNode): FileNode;

// getFileTree now calls markBinaryFiles before returning
```

**Checklist**:
- [x] Extend tree nodes with isBinary flag based on extension
- [x] [IMG] badge for image files (via getFileBadge in git.ts)
- [x] [BIN] badge for other binary files (via getFileBadge in git.ts)
- [x] Efficient detection (extension-based, no content read for tree)
- [x] Unit tests (10 new tests added)

---

## Module Status

| Module | File Path | Status | Tests |
|--------|-----------|--------|-------|
| Binary Detection | `src/server/git/binary.ts` | COMPLETED | PASS (51/51) |
| Git Types Extension | `src/types/git.ts` | COMPLETED | PASS (44/44) |
| File Route Extension | `src/server/routes/files.ts` | COMPLETED | PASS (26/26) |
| File Tree Extension | `src/server/git/files.ts` | COMPLETED | PASS (27/27) |

## Dependencies

| Feature | Depends On | Status |
|---------|------------|--------|
| Binary Detection | None (standalone utility) | - |
| Git Types Extension | Plan 26 (git types) | NOT_STARTED |
| File Route Extension | Plan 27 (file routes) | NOT_STARTED |
| File Tree Extension | Plan 26 (file tree ops), Binary Detection | NOT_STARTED |

## Completion Criteria

- [x] All 4 modules implemented
- [x] All tests passing
- [x] Type checking passes
- [x] Binary files detected by extension and content
- [x] Image files return with preview-compatible format (base64 + mimeType)
- [x] Other binary files return empty content with badge indicator
- [x] Large files (>1MB) return partial content with isPartial flag
- [x] Full content loadable via ?full=true query param
- [x] File tree shows [IMG]/[BIN] badges for binary files

## Progress Log

### Session: 2026-02-07 (Module 1)

**Tasks Completed**: Binary Detection Utilities (Module 1)

**Changes**:
- Implemented complete binary detection utility module
- Added type definitions: `ImageExtension`, `BinaryExtension`, `BinaryDetectionResult`, `LargeFileInfo`
- Implemented 6 core functions:
  1. `isBinaryExtension(filePath)`: Extension-based binary detection
  2. `isImageExtension(filePath)`: Image format detection
  3. `detectBinaryContent(buffer)`: Content scanning (null bytes, control chars)
  4. `detectBinary(filePath, content?)`: Combined detection with MIME type resolution
  5. `checkLargeFile(filePath, projectPath)`: File size checking against threshold
  6. `getMimeType(filePath)`: Extension to MIME type mapping
- Exported constants: `LARGE_FILE_THRESHOLD` (1MB), `PARTIAL_CONTENT_LIMIT` (10KB)
- Comprehensive test coverage: 51 tests across 7 test suites
- Supports 23 binary file types (8 images, 15 other binary formats)
- MIME type mappings for all supported formats

**Test Results**: 51/51 tests passing (bun test)

**Type Check**: PASS (bun run typecheck)

**Files Modified**:
- `src/server/git/binary.ts`: Complete implementation (414 lines)
- `src/server/git/binary.test.ts`: Comprehensive tests (524 lines)

**Notes**:
- All functions follow TypeScript strict mode guidelines
- All interfaces use readonly fields
- Comprehensive JSDoc comments on all exports
- Case-insensitive extension handling
- Efficient content scanning (up to 8KB) with 10% control char threshold
- All completion criteria for Module 1 met

### Session: 2026-02-07 (Module 2)

**Tasks Completed**: Git Types Extension (Module 2)

**Changes**:
- Added `FileBadge` type with 6 variants: "M", "+", "-", "R", "IMG", "BIN"
- Implemented `getFileBadge(node: FileNode)` function with priority logic:
  1. Binary files (IMG for images, BIN for other binaries)
  2. Status-based badges (+, -, R, M)
- Image extensions: png, jpg, jpeg, gif, svg, webp, ico, bmp
- Case-insensitive extension matching
- Added 13 comprehensive test cases covering all badge scenarios

**Test Results**: 44/44 tests passing

**Type Check**: PASS (bun run typecheck)

**Files Modified**:
- `src/types/git.ts`: Added FileBadge type and getFileBadge function (60 lines)
- `src/types/git.test.ts`: Added FileBadge tests (117 lines)

**Notes**:
- Existing DiffFile.isBinary and FileNode.isBinary fields from Plan 26 confirmed present
- No breaking changes to existing code
- All completion criteria for Module 2 met

### Session: 2026-02-07 (Module 3)

**Tasks Completed**: File Route Extension (Module 3)

**Changes**:
- Extended `src/server/routes/files.ts` GET /file/* route with binary and large file handling
- Updated `FileContentResponse` interface with new optional fields:
  - `isImage?: boolean | undefined`: Indicates if binary file is an image
  - `mimeType?: string | undefined`: MIME type for proper rendering
  - `badge?: string | undefined`: "IMG" or "BIN" badge indicator
  - `isPartial?: boolean | undefined`: True if large file truncated
  - `fullSize?: number | undefined`: Original file size when partial
- Imported binary detection utilities from `../git/binary.js`:
  - `detectBinary()`: Detect binary files by extension and content
  - `checkLargeFile()`: Check if file exceeds 1MB threshold
  - `PARTIAL_CONTENT_LIMIT`: 10KB limit for partial content
- Implemented binary file handling:
  - Image files: Convert content to base64, include mimeType, set badge="IMG"
  - Other binary files: Empty content, include mimeType, set badge="BIN"
  - Text files: Return content as-is
- Implemented large file handling:
  - Check file size against LARGE_FILE_THRESHOLD (1MB)
  - Return first 10KB (PARTIAL_CONTENT_LIMIT) with isPartial=true
  - Support ?full=true query param to bypass limit and load full content
- Removed obsolete `isBinaryContent()` function (replaced by binary utilities)
- Added 7 comprehensive test cases:
  1. Binary PDF files (BIN badge, empty content)
  2. Image PNG files (IMG badge, base64 content)
  3. Large text files (isPartial, fullSize metadata)
  4. Full content loading with ?full=true
  5. Binary content detection without binary extension
  6. Small binary files (<1MB)
- All existing tests continue to pass (19 tests + 7 new = 26 total)

**Test Results**: 26/26 tests passing

**Type Check**: PASS (bun run typecheck)

**Files Modified**:
- `src/server/routes/files.ts`: Extended GET /file/* route handler (82 lines modified)
- `src/server/routes/files.test.ts`: Added 7 new test cases (133 lines added)

**Notes**:
- Implementation follows TypeScript strict mode guidelines
- All optional properties use `Type | undefined` pattern (exactOptionalPropertyTypes)
- Efficient binary detection using extension check first, then content scan
- Large file check optimized with Bun.file().size (no full read)
- Badge logic consistent with getFileBadge in src/types/git.ts
- All completion criteria for Module 3 met

### Session: 2026-02-07 (Module 4)

**Tasks Completed**: File Tree Extension (Module 4)

**Changes**:
- Added `markBinaryFiles(root: FileNode)` function to `src/server/git/files.ts`
- Function recursively walks FileNode tree and sets `isBinary: true` for files with binary extensions
- Integrated `markBinaryFiles` into `getFileTree()` - called before returning tree
- Uses `isBinaryExtension` from `./binary.js` for efficient extension-based detection
- No content reading for tree operations (performance optimized)
- Added 10 comprehensive test cases covering:
  1. Image files (png, jpg, svg, gif)
  2. Non-image binary files (zip, pdf, exe, woff)
  3. Text files remain unmarked
  4. Mixed binary and text files
  5. Nested directory structures
  6. Directories not marked as binary
  7. Immutability (returns new tree)
  8. Empty tree handling
  9. Case-insensitive extensions
  10. Files without extensions

**Test Results**: 27/27 tests passing (includes existing + new tests)

**Type Check**: PASS (bun run typecheck)

**Files Modified**:
- `src/server/git/files.ts`: Added markBinaryFiles function and integrated with getFileTree
- `src/server/git/files.test.ts`: Added 10 new test cases for markBinaryFiles

**Notes**:
- Implementation follows TypeScript strict mode guidelines
- Immutable operations - creates new FileNode objects
- Efficient extension-based detection (no file I/O)
- All completion criteria for Module 4 met
- Badge logic ([IMG]/[BIN]) is handled by `getFileBadge` in `src/types/git.ts` (Module 2)

## Related Plans

- **New plan** (design feature with no prior plan)
- **Depends On**: Plan 26 (git types), Plan 27 (file routes)
- **Depended on by**: None (leaf feature)
