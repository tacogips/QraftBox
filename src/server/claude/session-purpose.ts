import type { TranscriptEvent } from "./session-reader.js";
import { stripSystemTags } from "../../utils/strip-system-tags";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const MAX_INTENT_ITEMS = 10;
const MAX_INPUT_CHARS = 1600;
const PURPOSE_REFRESH_INTERVAL = 3;
const PURPOSE_PROMPT_FILE = "ai-session-purpose.md";
const PURPOSE_PROMPT_TEMPLATE = `You summarize a coding session's current objective.
Input contains user intent messages only.
Return exactly one concise purpose sentence.
Rules:
- Max 90 characters.
- Do not include labels, bullets, or quotes.
- Prefer the most recent objective when intents conflict.
- Write the sentence in {{outputLanguage}}.

User intent messages (oldest to newest):
{{intentLines}}`;

function getPurposePromptDir(): string {
  return join(homedir(), ".config", "qraftbox", "prompt");
}

export function getPurposePromptPath(): string {
  return join(getPurposePromptDir(), PURPOSE_PROMPT_FILE);
}

export type PurposePromptSource = "file" | "fallback";

export async function loadPurposePromptTemplate(): Promise<{
  readonly template: string;
  readonly source: PurposePromptSource;
}> {
  const path = getPurposePromptPath();
  try {
    const template = await readFile(path, "utf-8");
    return { template, source: "file" };
  } catch {
    return { template: PURPOSE_PROMPT_TEMPLATE, source: "fallback" };
  }
}

export async function ensurePurposePromptFile(): Promise<void> {
  const dir = getPurposePromptDir();
  const path = getPurposePromptPath();

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  if (!existsSync(path)) {
    await writeFile(path, PURPOSE_PROMPT_TEMPLATE, "utf-8");
  }
}

function normalizeWhitespace(text: string): string {
  return text.replaceAll("\n", " ").replace(/\s+/g, " ").trim();
}

function extractTextBlocks(contentBlocks: readonly unknown[]): string {
  const textParts: string[] = [];
  for (const block of contentBlocks) {
    if (typeof block !== "object" || block === null) {
      continue;
    }
    const blockObj = block as Record<string, unknown>;
    if (
      blockObj["type"] === "text" &&
      typeof blockObj["text"] === "string" &&
      blockObj["text"].trim().length > 0
    ) {
      textParts.push(blockObj["text"]);
    }
  }
  return textParts.join(" ");
}

function extractUserMessageText(event: TranscriptEvent): string {
  if (event.type !== "user") {
    return "";
  }

  const raw =
    typeof event.raw === "object" && event.raw !== null
      ? (event.raw as Record<string, unknown>)
      : undefined;
  if (raw === undefined) {
    return "";
  }

  const message =
    typeof raw["message"] === "object" && raw["message"] !== null
      ? (raw["message"] as Record<string, unknown>)
      : undefined;

  const content = message?.["content"];
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return extractTextBlocks(content);
  }

  if (typeof event.content === "string") {
    return event.content;
  }

  return "";
}

export function isToolResponseLikeUserText(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return true;
  }

  const lower = normalized.toLowerCase();
  if (
    lower.startsWith("{") ||
    lower.startsWith("[") ||
    lower.startsWith("```")
  ) {
    return true;
  }

  if (
    lower.includes("tool_result") ||
    lower.includes("tool_use") ||
    lower.includes("stdout") ||
    lower.includes("stderr") ||
    lower.includes("exit code") ||
    lower.includes("bash -lc") ||
    lower.includes("command:")
  ) {
    return true;
  }

  if (
    lower === "ok" ||
    lower === "done" ||
    lower === "yes" ||
    lower === "no" ||
    lower === "thanks" ||
    lower === "thank you"
  ) {
    return true;
  }

  return false;
}

export function extractUserIntents(
  events: readonly TranscriptEvent[],
): readonly string[] {
  const intents: string[] = [];

  for (const event of events) {
    const rawText = extractUserMessageText(event);
    const normalized = normalizeWhitespace(stripSystemTags(rawText));
    if (normalized.length < 3) {
      continue;
    }
    if (isToolResponseLikeUserText(normalized)) {
      continue;
    }
    intents.push(normalized);
  }

  if (intents.length <= MAX_INTENT_ITEMS) {
    return intents;
  }
  return intents.slice(intents.length - MAX_INTENT_ITEMS);
}

export function createIntentSignature(intents: readonly string[]): string {
  return `${intents.length}:${Bun.hash(intents.join("\n")).toString(16)}`;
}

export function compactIntentInputs(
  intents: readonly string[],
): readonly string[] {
  const compacted: string[] = [];
  let totalChars = 0;

  for (let i = intents.length - 1; i >= 0; i -= 1) {
    const intent = intents[i];
    if (intent === undefined) {
      continue;
    }
    if (totalChars + intent.length > MAX_INPUT_CHARS) {
      break;
    }
    compacted.push(intent);
    totalChars += intent.length;
  }

  return compacted.reverse();
}

export async function buildPurposePrompt(
  intents: readonly string[],
  outputLanguage = "English",
): Promise<string> {
  const language = normalizeWhitespace(outputLanguage);
  const resolvedLanguage = language.length > 0 ? language : "English";
  const intentLines = intents.map((intent, idx) => `${idx + 1}. ${intent}`);
  const { template } = await loadPurposePromptTemplate();

  return template
    .replace("{{outputLanguage}}", resolvedLanguage)
    .replace("{{intentLines}}", intentLines.join("\n"));
}

export function normalizePurposeText(text: string): string {
  return normalizeWhitespace(stripSystemTags(text)).slice(0, 120);
}

export function shouldRefreshPurpose(
  cachedIntentCount: number,
  currentIntentCount: number,
): boolean {
  return currentIntentCount >= cachedIntentCount + PURPOSE_REFRESH_INTERVAL;
}
