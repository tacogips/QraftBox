import type {
  AIPromptContext,
  AIPromptRequest,
  DiffSummaryContext,
  FileReference,
  PrimaryFileContext,
} from "../types/ai";

function formatFileReference(reference: FileReference): string {
  const lines: string[] = [];
  const isAttachment = reference.attachmentKind !== undefined;
  const attachmentKind = reference.attachmentKind ?? "text";

  if (isAttachment) {
    lines.push(`### Attachment: ${reference.path}`);
  } else if (
    reference.startLine !== undefined &&
    reference.endLine !== undefined
  ) {
    if (reference.startLine === reference.endLine) {
      lines.push(`### File: ${reference.path} (Line ${reference.startLine})`);
    } else {
      lines.push(
        `### File: ${reference.path} (Lines ${reference.startLine}-${reference.endLine})`,
      );
    }
  } else {
    lines.push(`### File: ${reference.path}`);
  }

  if (isAttachment) {
    lines.push(`- Kind: ${attachmentKind}`);
    if (reference.fileName !== undefined && reference.fileName.length > 0) {
      lines.push(`- File Name: ${reference.fileName}`);
    }
    if (reference.mimeType !== undefined && reference.mimeType.length > 0) {
      lines.push(`- MIME Type: ${reference.mimeType}`);
    }
    if (reference.encoding !== undefined) {
      lines.push(`- Encoding: ${reference.encoding}`);
    }
    lines.push("");
  }

  if (reference.content !== undefined && reference.content.length > 0) {
    const fenceLabel =
      isAttachment && reference.encoding === "base64" ? "base64" : "";
    lines.push(`\`\`\`${fenceLabel}`);
    lines.push(reference.content);
    lines.push("```");
  }

  return lines.join("\n");
}

function formatPrimaryFile(primaryFile: PrimaryFileContext): string {
  const lines: string[] = [];

  lines.push("## Selected Code");
  lines.push("");

  if (primaryFile.startLine === primaryFile.endLine) {
    lines.push(`**File:** ${primaryFile.path} (Line ${primaryFile.startLine})`);
  } else {
    lines.push(
      `**File:** ${primaryFile.path} (Lines ${primaryFile.startLine}-${primaryFile.endLine})`,
    );
  }

  lines.push("");
  lines.push("```");
  lines.push(primaryFile.content);
  lines.push("```");

  return lines.join("\n");
}

function formatDiffSummary(diffSummary: DiffSummaryContext): string {
  const lines: string[] = [];

  lines.push("## Diff Context");
  lines.push("");
  lines.push(`**Base Branch:** ${diffSummary.baseBranch}`);
  lines.push(`**Target Branch:** ${diffSummary.targetBranch}`);
  lines.push("");

  if (diffSummary.changedFiles.length > 0) {
    lines.push(`**Changed Files (${diffSummary.changedFiles.length}):**`);
    for (const changedFile of diffSummary.changedFiles.slice(0, 20)) {
      lines.push(`- ${changedFile}`);
    }
    if (diffSummary.changedFiles.length > 20) {
      lines.push(`- ... and ${diffSummary.changedFiles.length - 20} more`);
    }
  }

  return lines.join("\n");
}

function isDiffSummaryContext(value: unknown): value is DiffSummaryContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const diffSummaryCandidate = value as Partial<DiffSummaryContext>;
  return (
    typeof diffSummaryCandidate.baseBranch === "string" &&
    typeof diffSummaryCandidate.targetBranch === "string" &&
    Array.isArray(diffSummaryCandidate.changedFiles)
  );
}

export function formatContext(context: AIPromptContext): string {
  const sections: string[] = [];

  if (context.primaryFile !== undefined) {
    sections.push(formatPrimaryFile(context.primaryFile));
  }

  if (isDiffSummaryContext(context.diffSummary)) {
    sections.push(formatDiffSummary(context.diffSummary));
  }

  const references = context.references ?? [];
  if (references.length > 0) {
    sections.push("## Referenced Files");
    sections.push("");

    for (const reference of references) {
      sections.push(formatFileReference(reference));
      sections.push("");
    }
  }

  return sections.join("\n\n");
}

export function buildPromptWithContext<
  PromptRequest extends Pick<AIPromptRequest, "prompt" | "context">,
>(request: PromptRequest): string {
  const promptParts: string[] = [];
  const contextText = formatContext(request.context);

  if (contextText.length > 0) {
    promptParts.push("# Context");
    promptParts.push("");
    promptParts.push(contextText);
    promptParts.push("");
  }

  promptParts.push(request.prompt);

  return promptParts.join("\n");
}
