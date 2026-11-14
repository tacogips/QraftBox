import type { FilesTab } from "../../../../client-shared/src/contracts/navigation";
import type { JSX } from "solid-js";

function renderSearchIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5" />
      <path
        d="M10.5 10.5 14 14"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}

function renderFilesTabIcon(filesTab: FilesTab): JSX.Element {
  if (filesTab === "file") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 1.75A1.75 1.75 0 0 0 2.25 3.5v9A1.75 1.75 0 0 0 4 14.25h8A1.75 1.75 0 0 0 13.75 12.5V6.414a1.75 1.75 0 0 0-.513-1.237L10.573 2.51A1.75 1.75 0 0 0 9.336 2H4Z"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
        <path
          d="M9.25 2.25V5a1 1 0 0 0 1 1H13"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M5.5 8.25h5M5.5 10.75h3.5"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    );
  }

  return renderSearchIcon();
}

export interface FilesTabToggleProps {
  readonly filesTab: FilesTab;
  readonly onChangeFilesTab: (filesTab: FilesTab) => void;
}

export function FilesTabToggle(props: FilesTabToggleProps): JSX.Element {
  return (
    <div class="inline-flex w-fit rounded-lg border border-border-default bg-bg-secondary p-0.5">
      <button
        type="button"
        class={
          props.filesTab === "file"
            ? "rounded-md bg-accent-emphasis p-2 text-text-on-emphasis"
            : "rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
        }
        aria-label="File tab"
        title="File"
        onClick={() => props.onChangeFilesTab("file")}
      >
        {renderFilesTabIcon("file")}
      </button>
      <button
        type="button"
        class={
          props.filesTab === "search"
            ? "rounded-md bg-accent-emphasis p-2 text-text-on-emphasis"
            : "rounded-md p-2 text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
        }
        aria-label="Regex search tab"
        title="Regex Search"
        onClick={() => props.onChangeFilesTab("search")}
      >
        {renderFilesTabIcon("search")}
      </button>
    </div>
  );
}
