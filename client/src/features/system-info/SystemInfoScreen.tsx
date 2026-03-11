import { createSignal, For, type JSX, onMount, Show } from "solid-js";
import { createSystemInfoApiClient } from "../../../../client-shared/src/api/system-info";
import type {
  ClaudeCodeUsage,
  SystemInfo,
  VersionInfo,
} from "../../../../src/types/system-info";
import { ScreenHeader } from "../../components/ScreenHeader";
import {
  formatCompactNumber,
  formatSystemInfoDate,
  getRecentTokenTotal,
  getSortedSystemInfoActivity,
  getSystemInfoModelShortName,
} from "./presentation";

export interface SystemInfoScreenProps {
  readonly apiBaseUrl: string;
}

const SCREEN_SHELL_CLASS =
  "mx-auto flex h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6";
const PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-secondary p-5";
const METRIC_PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-secondary/80 p-4";
const STATUS_PANEL_CLASS =
  "rounded-2xl border border-border-default bg-bg-primary/60 p-4";
const LOADING_DOT_CLASS =
  "h-2 w-2 animate-pulse rounded-full bg-accent-emphasis";

function getVersionToneClass(versionInfo: VersionInfo): string {
  if (versionInfo.version !== null) {
    return "border-success-emphasis/30 bg-success-muted/10";
  }

  if (versionInfo.error !== null) {
    return "border-danger-emphasis/30 bg-danger-muted/10";
  }

  return "border-border-default bg-bg-primary/60";
}

function getVersionValueClass(versionInfo: VersionInfo): string {
  if (versionInfo.version !== null) {
    return "text-success-fg";
  }

  if (versionInfo.error !== null) {
    return "text-danger-fg";
  }

  return "text-text-tertiary";
}

function renderToolVersionCard(
  label: string,
  description: string,
  versionInfo: VersionInfo,
): JSX.Element {
  return (
    <article class={`${PANEL_CLASS} ${getVersionToneClass(versionInfo)}`}>
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
              Tool
            </p>
            <h3 class="mt-1 text-base font-semibold text-text-primary">
              {label}
            </h3>
          </div>
          <p class="text-sm leading-6 text-text-secondary">{description}</p>
        </div>
        <span
          class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            versionInfo.version !== null
              ? "border-success-emphasis/30 bg-success-muted/15 text-success-fg"
              : versionInfo.error !== null
                ? "border-danger-emphasis/30 bg-danger-muted/15 text-danger-fg"
                : "border-border-default bg-bg-primary text-text-tertiary"
          }`}
        >
          {versionInfo.version !== null
            ? "Available"
            : versionInfo.error !== null
              ? "Error"
              : "Unknown"}
        </span>
      </div>
      <p
        class={`mt-4 break-all rounded-xl border border-border-default/60 bg-bg-primary/60 px-3 py-2 font-mono text-sm ${getVersionValueClass(
          versionInfo,
        )}`}
      >
        {versionInfo.version ??
          versionInfo.error ??
          "Version information is not available in this environment."}
      </p>
    </article>
  );
}

function renderUsageSummary(
  label: string,
  usage: ClaudeCodeUsage | null,
): JSX.Element {
  if (usage === null) {
    return (
      <section class={PANEL_CLASS}>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
              Usage
            </p>
            <h3 class="mt-1 text-lg font-semibold text-text-primary">
              {label}
            </h3>
          </div>
          <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            Unavailable
          </span>
        </div>
        <p class="mt-4 text-sm leading-6 text-text-secondary">
          {label} usage data is not available in this environment.
        </p>
      </section>
    );
  }

  const sortedActivity = getSortedSystemInfoActivity(usage.recentDailyActivity);
  const modelUsageEntries = Object.entries(usage.modelUsage);

  return (
    <section class={`${PANEL_CLASS} space-y-5`}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
            Usage
          </p>
          <h3 class="mt-1 text-lg font-semibold text-text-primary">{label}</h3>
        </div>
        <Show when={usage.firstSessionDate !== null}>
          <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs text-text-secondary">
            First session {formatSystemInfoDate(usage.firstSessionDate ?? "")}
          </span>
        </Show>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div class={METRIC_PANEL_CLASS}>
          <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
            Sessions
          </p>
          <p class="mt-2 text-2xl font-semibold text-text-primary">
            {formatCompactNumber(usage.totalSessions)}
          </p>
        </div>
        <div class={METRIC_PANEL_CLASS}>
          <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
            Messages
          </p>
          <p class="mt-2 text-2xl font-semibold text-text-primary">
            {formatCompactNumber(usage.totalMessages)}
          </p>
        </div>
        <div class={METRIC_PANEL_CLASS}>
          <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
            Recent Tokens
          </p>
          <p class="mt-2 text-2xl font-semibold text-text-primary">
            {formatCompactNumber(getRecentTokenTotal(usage))}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div class={`${STATUS_PANEL_CLASS} space-y-3`}>
          <div>
            <h4 class="text-sm font-semibold text-text-primary">
              Recent activity
            </h4>
            <p class="mt-1 text-xs leading-5 text-text-secondary">
              Latest daily session activity captured from the local usage
              dataset.
            </p>
          </div>
          <Show
            when={sortedActivity.length > 0}
            fallback={
              <p class="text-sm text-text-secondary">
                No recent activity has been recorded yet.
              </p>
            }
          >
            <div class="space-y-2">
              <For each={sortedActivity.slice(0, 7)}>
                {(activity) => (
                  <div class="flex flex-col gap-2 rounded-xl border border-border-default/60 bg-bg-secondary px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p class="text-sm font-medium text-text-primary">
                        {formatSystemInfoDate(activity.date)}
                      </p>
                      <p class="mt-1 text-xs text-text-secondary">
                        {activity.messageCount !== undefined
                          ? `${formatCompactNumber(activity.messageCount)} messages`
                          : "No message data"}
                        {activity.toolCallCount !== undefined
                          ? ` | ${formatCompactNumber(activity.toolCallCount)} tool calls`
                          : ""}
                      </p>
                    </div>
                    <Show when={activity.tokensByModel !== undefined}>
                      <span class="rounded-full border border-accent-emphasis/30 bg-accent-muted/10 px-3 py-1 text-xs font-medium text-accent-fg">
                        {formatCompactNumber(
                          Object.values(activity.tokensByModel ?? {}).reduce(
                            (sum, tokenCount) => sum + tokenCount,
                            0,
                          ),
                        )}{" "}
                        tokens
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class={`${STATUS_PANEL_CLASS} space-y-3`}>
          <div>
            <h4 class="text-sm font-semibold text-text-primary">Model usage</h4>
            <p class="mt-1 text-xs leading-5 text-text-secondary">
              Token totals grouped by reported model identifier.
            </p>
          </div>
          <Show
            when={modelUsageEntries.length > 0}
            fallback={
              <p class="text-sm text-text-secondary">
                No model usage has been recorded yet.
              </p>
            }
          >
            <div class="space-y-2">
              <For each={modelUsageEntries}>
                {([modelId, modelUsage]) => (
                  <div class="rounded-xl border border-border-default/60 bg-bg-secondary px-3 py-3">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="text-sm font-medium text-text-primary">
                          {getSystemInfoModelShortName(modelId)}
                        </p>
                        <p class="mt-1 break-all text-xs text-text-tertiary">
                          {modelId}
                        </p>
                      </div>
                      <span class="rounded-full border border-border-default bg-bg-primary px-3 py-1 text-[11px] text-text-secondary">
                        {formatCompactNumber(
                          modelUsage.inputTokens + modelUsage.outputTokens,
                        )}{" "}
                        total
                      </span>
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                      <div class="rounded-lg bg-bg-primary px-3 py-2">
                        In: {formatCompactNumber(modelUsage.inputTokens)}
                      </div>
                      <div class="rounded-lg bg-bg-primary px-3 py-2">
                        Out: {formatCompactNumber(modelUsage.outputTokens)}
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}

export function SystemInfoScreen(props: SystemInfoScreenProps): JSX.Element {
  const systemInfoApi = createSystemInfoApiClient({
    apiBaseUrl: props.apiBaseUrl,
  });
  const [systemInfo, setSystemInfo] = createSignal<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  async function load(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setSystemInfo(await systemInfoApi.fetchSystemInfo());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load system info",
      );
    } finally {
      setIsLoading(false);
    }
  }

  onMount(() => {
    void load();
  });

  return (
    <section class={SCREEN_SHELL_CLASS}>
      <ScreenHeader
        title="System Information"
        subtitle="Runtime availability, configured models, and recent Claude Code or Codex usage for the current QraftBox environment."
      />

      <Show when={isLoading()}>
        <div class="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-border-default bg-bg-secondary text-text-secondary">
          <div class="flex gap-2">
            <span class={LOADING_DOT_CLASS} />
            <span class={`${LOADING_DOT_CLASS} [animation-delay:120ms]`} />
            <span class={`${LOADING_DOT_CLASS} [animation-delay:240ms]`} />
          </div>
          <p class="text-sm">Loading system information...</p>
        </div>
      </Show>

      <Show when={errorMessage() !== null}>
        <div class="rounded-2xl border border-danger-emphasis/40 bg-danger-muted/10 p-6">
          <p class="text-sm font-medium text-danger-fg">{errorMessage()}</p>
          <button
            type="button"
            class="mt-4 rounded-md border border-danger-emphasis/40 bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-hover"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      </Show>

      <Show
        when={!isLoading() && errorMessage() === null && systemInfo() !== null}
      >
        <>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {renderToolVersionCard(
                "Git",
                "Repository plumbing and diff operations used across project views.",
                systemInfo()!.git,
              )}
              {renderToolVersionCard(
                "Claude Code",
                "CLI runtime availability for Claude-backed coding and review sessions.",
                systemInfo()!.claudeCode,
              )}
              {renderToolVersionCard(
                "Codex",
                "CLI runtime availability for Codex-backed coding and review sessions.",
                systemInfo()!.codexCode,
              )}
            </div>

            <section class={`${PANEL_CLASS} space-y-4`}>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-tertiary">
                  Active models
                </p>
                <h3 class="mt-1 text-lg font-semibold text-text-primary">
                  Default bindings
                </h3>
              </div>
              <div class="space-y-3">
                <div class={STATUS_PANEL_CLASS}>
                  <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
                    Prompt model
                  </p>
                  <p class="mt-2 break-all font-mono text-sm text-text-primary">
                    {systemInfo()!.models.promptModel}
                  </p>
                </div>
                <div class={STATUS_PANEL_CLASS}>
                  <p class="text-[11px] uppercase tracking-wide text-text-tertiary">
                    Assistant model
                  </p>
                  <p class="mt-2 break-all font-mono text-sm text-text-primary">
                    {systemInfo()!.models.assistantModel}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {renderUsageSummary("Claude Code", systemInfo()!.claudeCodeUsage)}
          {renderUsageSummary("Codex", systemInfo()!.codexCodeUsage)}
        </>
      </Show>
    </section>
  );
}
