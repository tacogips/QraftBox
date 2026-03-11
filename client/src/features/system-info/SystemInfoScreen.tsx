import { createSignal, For, type JSX, onMount, Show } from "solid-js";
import { createSystemInfoApiClient } from "../../../../client-shared/src/api/system-info";
import type {
  ClaudeCodeUsage,
  SystemInfo,
  VersionInfo,
} from "../../../../src/types/system-info";
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

function renderVersion(versionInfo: VersionInfo): JSX.Element {
  if (versionInfo.version !== null) {
    return <p>{versionInfo.version}</p>;
  }

  if (versionInfo.error !== null) {
    return <p role="alert">{versionInfo.error}</p>;
  }

  return <p>Version information is not available.</p>;
}

function renderUsageSummary(
  label: string,
  usage: ClaudeCodeUsage | null,
): JSX.Element {
  if (usage === null) {
    return <p>{label} usage data is not available in this environment.</p>;
  }

  const sortedActivity = getSortedSystemInfoActivity(usage.recentDailyActivity);

  return (
    <section>
      <h3>{label} usage</h3>
      <p>
        Sessions {formatCompactNumber(usage.totalSessions)} | Messages{" "}
        {formatCompactNumber(usage.totalMessages)} | Recent tokens{" "}
        {formatCompactNumber(getRecentTokenTotal(usage))}
      </p>
      <Show when={usage.firstSessionDate !== null}>
        <p>
          First session: {formatSystemInfoDate(usage.firstSessionDate ?? "")}
        </p>
      </Show>
      <Show when={sortedActivity.length > 0}>
        <h4>Recent activity</h4>
        <ul>
          <For each={sortedActivity.slice(0, 7)}>
            {(activity) => (
              <li>
                {formatSystemInfoDate(activity.date)}
                <Show when={activity.messageCount !== undefined}>
                  {` | messages ${formatCompactNumber(activity.messageCount ?? 0)}`}
                </Show>
                <Show when={activity.toolCallCount !== undefined}>
                  {` | tool calls ${formatCompactNumber(activity.toolCallCount ?? 0)}`}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={Object.keys(usage.modelUsage).length > 0}>
        <h4>Model usage</h4>
        <ul>
          <For each={Object.entries(usage.modelUsage)}>
            {([modelId, modelUsage]) => (
              <li>
                {getSystemInfoModelShortName(modelId)} | in{" "}
                {formatCompactNumber(modelUsage.inputTokens)} | out{" "}
                {formatCompactNumber(modelUsage.outputTokens)}
              </li>
            )}
          </For>
        </ul>
      </Show>
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
    <section>
      <h2>System Information</h2>
      <p>Runtime and tooling status for the current QraftBox workspace.</p>
      <Show when={isLoading()}>
        <p>Loading system information...</p>
      </Show>
      <Show when={errorMessage() !== null}>
        <p role="alert">{errorMessage()}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </Show>
      <Show
        when={!isLoading() && errorMessage() === null && systemInfo() !== null}
      >
        <section>
          <h3>Tools</h3>
          <h4>Git</h4>
          {renderVersion(systemInfo()!.git)}
          <h4>Claude Code</h4>
          {renderVersion(systemInfo()!.claudeCode)}
          <h4>Codex</h4>
          {renderVersion(systemInfo()!.codexCode)}
        </section>
        <section>
          <h3>Active models</h3>
          <p>Prompt model: {systemInfo()!.models.promptModel}</p>
          <p>Assistant model: {systemInfo()!.models.assistantModel}</p>
        </section>
        {renderUsageSummary("Claude Code", systemInfo()!.claudeCodeUsage)}
        {renderUsageSummary("Codex", systemInfo()!.codexCodeUsage)}
      </Show>
    </section>
  );
}
