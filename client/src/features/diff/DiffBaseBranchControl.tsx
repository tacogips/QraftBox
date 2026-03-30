import {
  createEffect,
  createMemo,
  onCleanup,
  createSignal,
  type JSX,
} from "solid-js";
import {
  createBranchesApiClient,
  type BranchInfo,
} from "../../../../client-shared/src/api/branches";

export interface DiffBaseBranchControlProps {
  readonly apiBaseUrl: string;
  readonly contextId: string | null;
  readonly isGitRepo: boolean;
  readonly selectedBaseBranch: string | null;
  readonly defaultBaseBranch: string | null;
  readonly onSelectBaseBranch: (baseBranch: string) => void | Promise<void>;
}

async function loadAllLocalBranches(
  contextId: string,
  apiBaseUrl: string,
): Promise<readonly BranchInfo[]> {
  const branchesApiClient = createBranchesApiClient({ apiBaseUrl });
  const aggregatedBranches: BranchInfo[] = [];
  let currentOffset = 0;
  let totalBranches = 0;

  do {
    const branchListResponse = await branchesApiClient.listBranches(contextId, {
      limit: 100,
      offset: currentOffset,
    });
    totalBranches = branchListResponse.total;
    aggregatedBranches.push(...branchListResponse.branches);
    currentOffset += branchListResponse.branches.length;

    if (branchListResponse.branches.length === 0) {
      break;
    }
  } while (currentOffset < totalBranches);

  return aggregatedBranches;
}

function renderBranchIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="4"
        cy="3.5"
        r="1.75"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <circle
        cx="12"
        cy="12.5"
        r="1.75"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <path
        d="M4 5.25v3.1c0 1.16.94 2.1 2.1 2.1H10.5"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="11.5" cy="8.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function renderSelectChevronIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function formatBranchLabel(
  branchInfo: BranchInfo,
  defaultBaseBranch: string | null,
): string {
  const branchTags: string[] = [];
  if (branchInfo.name === defaultBaseBranch || branchInfo.isDefault) {
    branchTags.push("default");
  }
  if (branchInfo.isCurrent) {
    branchTags.push("current");
  }

  return branchTags.length > 0
    ? `${branchInfo.name} (${branchTags.join(", ")})`
    : branchInfo.name;
}

export function DiffBaseBranchControl(
  props: DiffBaseBranchControlProps,
): JSX.Element {
  const [availableBranches, setAvailableBranches] = createSignal<
    readonly BranchInfo[]
  >([]);
  const [isLoadingBranches, setIsLoadingBranches] = createSignal(false);
  const [branchLoadError, setBranchLoadError] = createSignal<string | null>(
    null,
  );

  createEffect(() => {
    const contextId = props.contextId;
    const apiBaseUrl = props.apiBaseUrl;
    const isGitRepo = props.isGitRepo;

    if (contextId === null || !isGitRepo) {
      setAvailableBranches([]);
      setBranchLoadError(null);
      setIsLoadingBranches(false);
      return;
    }

    let isCancelled = false;
    onCleanup(() => {
      isCancelled = true;
    });

    setIsLoadingBranches(true);
    setBranchLoadError(null);

    void loadAllLocalBranches(contextId, apiBaseUrl)
      .then((loadedBranches) => {
        if (isCancelled) {
          return;
        }

        setAvailableBranches(loadedBranches);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        setBranchLoadError(
          error instanceof Error ? error.message : "Failed to load branches.",
        );
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }

        setIsLoadingBranches(false);
      });
  });

  const branchOptions = createMemo(() => {
    const branchMap = new Map<string, BranchInfo>();
    for (const branchInfo of availableBranches()) {
      branchMap.set(branchInfo.name, branchInfo);
    }

    const selectedBaseBranch = props.selectedBaseBranch;
    if (
      selectedBaseBranch !== null &&
      selectedBaseBranch.length > 0 &&
      !branchMap.has(selectedBaseBranch)
    ) {
      branchMap.set(selectedBaseBranch, {
        name: selectedBaseBranch,
        isCurrent: false,
        isDefault: selectedBaseBranch === props.defaultBaseBranch,
        isRemote: false,
        lastCommit: {
          hash: "",
          message: "",
          author: "",
          date: 0,
        },
      });
    }

    return Array.from(branchMap.values());
  });

  const selectedBranchValue = createMemo(
    () => props.selectedBaseBranch ?? props.defaultBaseBranch ?? "",
  );

  return (
    <label
      class="relative min-w-0"
      title={branchLoadError() ?? "Select the base branch for file diffs"}
    >
      <span class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-tertiary">
        {renderBranchIcon()}
      </span>
      <select
        value={selectedBranchValue()}
        disabled={
          props.contextId === null ||
          !props.isGitRepo ||
          (isLoadingBranches() && branchOptions().length === 0)
        }
        aria-label="Select diff base branch"
        class="min-w-[12rem] max-w-[18rem] appearance-none rounded-md border border-border-default bg-bg-primary py-2 pl-9 pr-8 text-xs font-medium text-text-primary outline-none transition hover:bg-bg-hover focus:border-accent-emphasis"
        onChange={(event) =>
          void props.onSelectBaseBranch(event.currentTarget.value)
        }
      >
        <option value="" disabled>
          {isLoadingBranches() ? "Loading branches..." : "Select base branch"}
        </option>
        {branchOptions().map((branchInfo) => (
          <option value={branchInfo.name}>
            {formatBranchLabel(branchInfo, props.defaultBaseBranch)}
          </option>
        ))}
      </select>
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
        {renderSelectChevronIcon()}
      </span>
    </label>
  );
}
