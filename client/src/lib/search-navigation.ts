/**
 * Search Navigation utilities
 *
 * This module provides functions for navigating to search results
 * and highlighting matches in the diff viewer.
 */

import type { SearchResult } from "../../../src/types/search";

/**
 * Options for result navigation
 */
export interface NavigationOptions {
  /**
   * Whether to scroll the result into view
   * @default true
   */
  readonly scrollIntoView?: boolean;

  /**
   * Scroll behavior
   * @default 'smooth'
   */
  readonly behavior?: ScrollBehavior;

  /**
   * Vertical alignment when scrolling
   * @default 'center'
   */
  readonly block?: ScrollLogicalPosition;
}

/**
 * Match position in a string
 */
export interface MatchPosition {
  readonly start: number;
  readonly end: number;
}

/**
 * Navigate to a search result in the viewer
 *
 * This function handles:
 * 1. Opening the file if not already open
 * 2. Scrolling to the line number
 * 3. Highlighting the match
 *
 * @param result - The search result to navigate to
 * @param options - Navigation options
 */
export function navigateToResult(
  result: SearchResult,
  options: NavigationOptions = {}
): void {
  const { scrollIntoView = true, behavior = "smooth", block = "center" } = options;

  // Find the line element by line number
  const lineSelector = `[data-line-number="${result.lineNumber}"]`;
  const lineElement = document.querySelector(lineSelector);

  if (lineElement === null) {
    // Line not currently rendered (possibly virtualized)
    // Dispatch a custom event to request the viewer to scroll to this line
    const event = new CustomEvent("search:navigate", {
      bubbles: true,
      detail: {
        filePath: result.filePath,
        lineNumber: result.lineNumber,
        matchStart: result.matchStart,
        matchEnd: result.matchEnd,
      },
    });
    document.dispatchEvent(event);
    return;
  }

  if (scrollIntoView) {
    lineElement.scrollIntoView({ behavior, block });
  }

  // Add highlight class temporarily
  lineElement.classList.add("search-result-highlight");

  // Remove highlight after animation completes
  setTimeout(() => {
    lineElement.classList.remove("search-result-highlight");
  }, 2000);
}

/**
 * Find all matches of a pattern in a string
 *
 * @param content - The content to search in
 * @param pattern - The regex pattern to search for
 * @param caseSensitive - Whether the search is case sensitive
 * @returns Array of match positions (start/end indices)
 */
export function highlightSearchMatches(
  content: string,
  pattern: string,
  caseSensitive = false
): readonly MatchPosition[] {
  if (pattern.length === 0) {
    return [];
  }

  const matches: MatchPosition[] = [];

  try {
    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(pattern, flags);
    let match: RegExpExecArray | null;

    // Limit matches to prevent excessive highlighting
    const maxMatches = 100;

    while ((match = regex.exec(content)) !== null && matches.length < maxMatches) {
      // Prevent infinite loop for zero-width matches
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      matches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  } catch {
    // Invalid regex - return empty matches
    return [];
  }

  return matches;
}

/**
 * Scroll a line element into view
 *
 * @param lineNumber - The line number to scroll into view
 * @param options - Scroll options
 * @returns true if the line was found and scrolled to, false otherwise
 */
export function scrollResultIntoView(
  lineNumber: number,
  options: NavigationOptions = {}
): boolean {
  const { behavior = "smooth", block = "center" } = options;

  const lineSelector = `[data-line-number="${lineNumber}"]`;
  const lineElement = document.querySelector(lineSelector);

  if (lineElement === null) {
    return false;
  }

  lineElement.scrollIntoView({ behavior, block });
  return true;
}

/**
 * Check if a line is currently visible in the viewport
 *
 * @param lineNumber - The line number to check
 * @returns true if the line is visible, false otherwise
 */
export function isLineVisible(lineNumber: number): boolean {
  const lineSelector = `[data-line-number="${lineNumber}"]`;
  const lineElement = document.querySelector(lineSelector);

  if (lineElement === null) {
    return false;
  }

  const rect = lineElement.getBoundingClientRect();
  const viewHeight = window.innerHeight || document.documentElement.clientHeight;

  return rect.top >= 0 && rect.bottom <= viewHeight;
}

/**
 * Get the line numbers of all currently visible lines
 *
 * @param containerSelector - Selector for the scroll container
 * @returns Array of visible line numbers
 */
export function getVisibleLineNumbers(
  containerSelector = ".diff-content"
): readonly number[] {
  const container = document.querySelector(containerSelector);
  if (container === null) {
    return [];
  }

  const containerRect = container.getBoundingClientRect();
  const lineElements = container.querySelectorAll("[data-line-number]");
  const visibleLines: number[] = [];

  for (const element of lineElements) {
    const rect = element.getBoundingClientRect();

    // Check if element is within the container's visible area
    if (
      rect.top < containerRect.bottom &&
      rect.bottom > containerRect.top
    ) {
      const lineNumber = parseInt(
        element.getAttribute("data-line-number") ?? "0",
        10
      );
      if (lineNumber > 0) {
        visibleLines.push(lineNumber);
      }
    }
  }

  return visibleLines;
}

/**
 * Calculate the match index closest to the current viewport
 *
 * @param results - Array of search results
 * @param visibleLines - Currently visible line numbers
 * @returns Index of the closest result, or -1 if no results
 */
export function findClosestResultIndex(
  results: readonly SearchResult[],
  visibleLines: readonly number[]
): number {
  if (results.length === 0) {
    return -1;
  }

  if (visibleLines.length === 0) {
    return 0;
  }

  const midVisibleLine = visibleLines[Math.floor(visibleLines.length / 2)] ?? 0;

  let closestIndex = 0;
  let closestDistance = Math.abs(results[0]!.lineNumber - midVisibleLine);

  for (let i = 1; i < results.length; i++) {
    const distance = Math.abs(results[i]!.lineNumber - midVisibleLine);
    if (distance < closestDistance) {
      closestIndex = i;
      closestDistance = distance;
    }
  }

  return closestIndex;
}
