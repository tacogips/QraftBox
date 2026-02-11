/**
 * Comments store types and functions
 *
 * Provides the comment data structures and store for managing
 * the comments component's state, including git-xnotes integration.
 */

/**
 * Comment author information
 */
export interface Author {
  readonly name: string;
  readonly email: string;
}

/**
 * Comment reply in a thread
 */
export interface CommentReply {
  readonly id: string;
  readonly author: Author;
  readonly content: string;
  readonly createdAt: string;
}

/**
 * Full comment with optional replies
 */
export interface Comment {
  readonly id: string;
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd: number | undefined;
  readonly author: Author;
  readonly content: string;
  readonly createdAt: string;
  readonly replies: readonly CommentReply[];
}

/**
 * New comment input (for creating)
 */
export interface NewComment {
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd?: number;
  readonly author: Author;
  readonly content: string;
}

/**
 * Sync status for git-xnotes
 */
export interface SyncStatus {
  readonly mode: "local" | "remote" | "synced";
  readonly localCount: number;
  readonly remoteCount: number;
  readonly lastSync: string | undefined;
}

/**
 * Comments store state
 */
export interface CommentsStoreState {
  /**
   * Map of commit hash to comments array
   */
  readonly comments: ReadonlyMap<string, readonly Comment[]>;

  /**
   * Whether comments are currently loading
   */
  readonly loading: boolean;

  /**
   * Current sync status (null if not loaded)
   */
  readonly syncStatus: SyncStatus | null;

  /**
   * Error message if operation failed
   */
  readonly error: string | null;
}

/**
 * Comments store actions
 */
export interface CommentsStoreActions {
  /**
   * Load comments for a specific commit
   */
  loadComments(commit: string): Promise<void>;

  /**
   * Add a new comment to a commit
   */
  addComment(commit: string, comment: NewComment): Promise<Comment>;

  /**
   * Reply to an existing comment
   */
  replyToComment(
    commit: string,
    parentId: string,
    content: string,
    author: Author,
  ): Promise<CommentReply>;

  /**
   * Update an existing comment's content
   */
  updateComment(
    commit: string,
    commentId: string,
    content: string,
  ): Promise<void>;

  /**
   * Delete a comment
   */
  deleteComment(commit: string, commentId: string): Promise<void>;

  /**
   * Refresh the sync status from git-xnotes
   */
  refreshSyncStatus(): Promise<void>;

  /**
   * Push local notes to remote
   */
  pushNotes(): Promise<void>;

  /**
   * Pull remote notes to local
   */
  pullNotes(): Promise<void>;

  /**
   * Reset the store to initial state
   */
  reset(): void;
}

/**
 * Combined comments store type
 */
export type CommentsStore = CommentsStoreState & CommentsStoreActions;

/**
 * Initial state for the comments store
 */
export const initialCommentsState: CommentsStoreState = {
  comments: new Map(),
  loading: false,
  syncStatus: null,
  error: null,
};

/**
 * Generate a unique ID for comments
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a comments store
 *
 * The actual store implementation using Svelte stores will be added
 * when implementing the full client core. Currently stubbed with TODO
 * markers for API integration.
 */
export function createCommentsStore(): CommentsStore {
  let state: CommentsStoreState = { ...initialCommentsState };
  const listeners: Set<() => void> = new Set();

  /**
   * Notify all listeners of state change
   */
  function notifyListeners(): void {
    listeners.forEach((listener) => listener());
  }

  /**
   * Update state immutably
   */
  function updateState(updates: Partial<CommentsStoreState>): void {
    state = { ...state, ...updates };
    notifyListeners();
  }

  /**
   * Update comments map immutably
   */
  function updateCommentsMap(
    commit: string,
    updater: (comments: readonly Comment[]) => readonly Comment[],
  ): void {
    const currentComments = state.comments.get(commit) ?? [];
    const updatedComments = updater(currentComments);
    const newMap = new Map(state.comments);
    newMap.set(commit, updatedComments);
    updateState({ comments: newMap });
  }

  return {
    get comments(): ReadonlyMap<string, readonly Comment[]> {
      return state.comments;
    },
    get loading(): boolean {
      return state.loading;
    },
    get syncStatus(): SyncStatus | null {
      return state.syncStatus;
    },
    get error(): string | null {
      return state.error;
    },

    async loadComments(commit: string): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/comments/${commit}`);
        // if (!response.ok) {
        //   throw new Error(`Failed to load comments: ${response.statusText}`);
        // }
        // const data = await response.json();
        // const comments = data as Comment[];

        // Stubbed: empty comments for now
        const comments: readonly Comment[] = [];

        const newMap = new Map(state.comments);
        newMap.set(commit, comments);
        updateState({ comments: newMap, loading: false });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to load comments";
        updateState({ loading: false, error: errorMessage });
      }
    },

    async addComment(commit: string, comment: NewComment): Promise<Comment> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/comments/${commit}`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(comment),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to add comment: ${response.statusText}`);
        // }
        // const newComment = await response.json() as Comment;

        // Stubbed: create a new comment locally
        const newComment: Comment = {
          id: generateId(),
          filePath: comment.filePath,
          lineStart: comment.lineStart,
          lineEnd: comment.lineEnd,
          author: comment.author,
          content: comment.content,
          createdAt: new Date().toISOString(),
          replies: [],
        };

        updateCommentsMap(commit, (comments) => [...comments, newComment]);
        updateState({ loading: false });

        return newComment;
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to add comment";
        updateState({ loading: false, error: errorMessage });
        throw e;
      }
    },

    async replyToComment(
      commit: string,
      parentId: string,
      content: string,
      author: Author,
    ): Promise<CommentReply> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/comments/${commit}/${parentId}/replies`, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ content, author }),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to add reply: ${response.statusText}`);
        // }
        // const newReply = await response.json() as CommentReply;

        // Stubbed: create a new reply locally
        const newReply: CommentReply = {
          id: generateId(),
          author,
          content,
          createdAt: new Date().toISOString(),
        };

        updateCommentsMap(commit, (comments) =>
          comments.map((comment) =>
            comment.id === parentId
              ? { ...comment, replies: [...comment.replies, newReply] }
              : comment,
          ),
        );
        updateState({ loading: false });

        return newReply;
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to add reply";
        updateState({ loading: false, error: errorMessage });
        throw e;
      }
    },

    async updateComment(
      commit: string,
      commentId: string,
      content: string,
    ): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/comments/${commit}/${commentId}`, {
        //   method: 'PATCH',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ content }),
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to update comment: ${response.statusText}`);
        // }

        // Stubbed: update comment locally
        updateCommentsMap(commit, (comments) =>
          comments.map((comment) =>
            comment.id === commentId ? { ...comment, content } : comment,
          ),
        );
        updateState({ loading: false });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to update comment";
        updateState({ loading: false, error: errorMessage });
        throw e;
      }
    },

    async deleteComment(commit: string, commentId: string): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/comments/${commit}/${commentId}`, {
        //   method: 'DELETE',
        // });
        // if (!response.ok) {
        //   throw new Error(`Failed to delete comment: ${response.statusText}`);
        // }

        // Stubbed: delete comment locally
        updateCommentsMap(commit, (comments) =>
          comments.filter((comment) => comment.id !== commentId),
        );
        updateState({ loading: false });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to delete comment";
        updateState({ loading: false, error: errorMessage });
        throw e;
      }
    },

    async refreshSyncStatus(): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/notes/status');
        // if (!response.ok) {
        //   throw new Error(`Failed to refresh sync status: ${response.statusText}`);
        // }
        // const syncStatus = await response.json() as SyncStatus;

        // Stubbed: return a placeholder sync status
        const syncStatus: SyncStatus = {
          mode: "local",
          localCount: 0,
          remoteCount: 0,
          lastSync: undefined,
        };

        updateState({ syncStatus, loading: false });
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to refresh sync status";
        updateState({ loading: false, error: errorMessage });
      }
    },

    async pushNotes(): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/notes/push', { method: 'POST' });
        // if (!response.ok) {
        //   throw new Error(`Failed to push notes: ${response.statusText}`);
        // }

        // Stubbed: update sync status to synced
        if (state.syncStatus !== null) {
          updateState({
            syncStatus: {
              mode: "synced",
              localCount: state.syncStatus.localCount,
              remoteCount: state.syncStatus.localCount,
              lastSync: new Date().toISOString(),
            },
            loading: false,
          });
        } else {
          updateState({ loading: false });
        }
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to push notes";
        updateState({ loading: false, error: errorMessage });
      }
    },

    async pullNotes(): Promise<void> {
      updateState({ loading: true, error: null });

      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/notes/pull', { method: 'POST' });
        // if (!response.ok) {
        //   throw new Error(`Failed to pull notes: ${response.statusText}`);
        // }

        // Stubbed: update sync status to synced
        if (state.syncStatus !== null) {
          updateState({
            syncStatus: {
              mode: "synced",
              localCount: state.syncStatus.remoteCount,
              remoteCount: state.syncStatus.remoteCount,
              lastSync: new Date().toISOString(),
            },
            loading: false,
          });
        } else {
          updateState({ loading: false });
        }
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : "Failed to pull notes";
        updateState({ loading: false, error: errorMessage });
      }
    },

    reset(): void {
      state = { ...initialCommentsState };
      notifyListeners();
    },
  };
}
