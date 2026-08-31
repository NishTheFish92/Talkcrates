// The sidebar/thread-list. Purely presentational: it's handed the threads
// Home already fetched, plus callbacks for everything you can do from here
// — open a thread, start a new one, rename/delete an existing one, and now
// export. No storage calls of its own, same split every other screen
// component uses — Home is the one that actually calls
// renameThread/deleteThread/exportBytes.
//
// Export used to live behind the Settings menu; moved here (right next to
// "+") since exporting shouldn't be hidden behind a menu — it's the
// user's only durable copy of their data (see CLAUDE.md -> "Data storage
// & privacy"), so it stays one tap away regardless of which screen you're
// on. It tracks its own pending/error state locally (like SessionChoice's
// `importing`) rather than lifting that up to Home, since nothing outside
// this button cares about it.

import { useRef, useState } from "react";
import type { Thread } from "../storage";

interface SidebarProps {
  threads: Thread[];
  name: string;
  onSelectThread: (threadId: number) => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  onRenameThread: (threadId: number, title: string) => void;
  onDeleteThread: (threadId: number) => void;
  onExport: () => Promise<void>;
}

// How long a touch has to be held before the "⋯" button reveals itself on
// phone (where there's no `:hover` to reveal it the way there is on
// desktop — see the CSS comment on .thread-more-btn).
const LONG_PRESS_MS = 500;

// Turns a unix-seconds timestamp into a short "how long ago" label, e.g.
// "2h ago". This stands in for the wireframe's per-thread preview line
// ("6 messages") — getThreads() deliberately doesn't fetch message data
// (see storage/queries.ts), so there's no message count or last-message
// text available here without a heavier query. Relative time is what we
// have on hand from Thread alone.
function timeAgo(unixSeconds: number): string {
  const diffSeconds = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function Sidebar({
  threads,
  name,
  onSelectThread,
  onNewThread,
  onOpenSettings,
  onRenameThread,
  onDeleteThread,
  onExport,
}: SidebarProps) {
  // Which thread's "⋯" action menu (Rename / Delete) is currently open —
  // at most one at a time, so an id rather than a per-thread boolean.
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  // Which thread's "⋯" button is force-visible because of an in-progress
  // (or just-finished) long press on phone. Desktop never needs this —
  // there .thread-row:hover in App.css reveals the button on its own.
  const [revealedId, setRevealedId] = useState<number | null>(null);
  // The thread currently being renamed, if any — non-null shows the
  // rename dialog. Holding the whole Thread (not just an id) so the
  // dialog can prefill its input with the current title.
  const [renamingThread, setRenamingThread] = useState<Thread | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // The thread pending a delete confirmation, if any.
  const [deletingThread, setDeletingThread] = useState<Thread | null>(null);
  // Export's own pending/error state — local here rather than lifted to
  // Home, same reasoning as SessionChoice's `importing`: nothing outside
  // this button cares whether an export is mid-flight, only that it
  // either finished (the browser's own download UI takes over from
  // there) or failed (shown right here).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportClick() {
    setExportError(null);
    setExporting(true);
    try {
      await onExport();
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Something went wrong exporting your chats.",
      );
    } finally {
      setExporting(false);
    }
  }

  // Long-press bookkeeping. `timer` is the pending setTimeout (so a touch
  // ending early can cancel it); `fired` records whether that timeout
  // already ran for the touch currently in progress. Refs, not state —
  // neither needs to trigger a render on its own, only the state updates
  // they cause (setRevealedId) do.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  function startLongPress(threadId: number) {
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setRevealedId(threadId);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // A touchend fires its own click right after — without this check, the
  // long press that just revealed the "⋯" button would also open the
  // thread it was pressed on, since .thread-item's onClick fires for that
  // same tap. Swallow exactly that one click, then let normal taps
  // through as usual.
  function handleThreadItemClick(threadId: number) {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onSelectThread(threadId);
  }

  function closeMenu() {
    setOpenMenuId(null);
    setRevealedId(null);
  }

  function handleRenameSubmit(threadId: number) {
    const title = renameValue.trim();
    if (!title) return;
    onRenameThread(threadId, title);
    setRenamingThread(null);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Chats</h1>
        <button
          type="button"
          className="sidebar-settings-button"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          ☰
        </button>
      </div>
      {threads.length === 0 ? (
        <div className="sidebar-empty">
          <p className="sidebar-empty-message">
            {name ? `Hi ${name},` : "Hi there,"}
            <br />
            start a new chat
          </p>
          <div className="sidebar-empty-actions">
            <button
              type="button"
              className="sidebar-new-button sidebar-new-button--empty"
              onClick={onNewThread}
              aria-label="New chat"
            >
              +
            </button>
            <button
              type="button"
              className="sidebar-export-button sidebar-export-button--empty"
              onClick={handleExportClick}
              disabled={exporting}
              aria-label="Export chats"
              title="Export chats"
            >
              ⬇
            </button>
          </div>
          {exportError && <p className="sidebar-export-error">{exportError}</p>}
        </div>
      ) : (
        <>
          <ul className="thread-list">
            {threads.map((thread) => (
              <li
                key={thread.id}
                className={`thread-row ${openMenuId === thread.id ? "thread-row--menu-open" : ""} ${revealedId === thread.id ? "thread-row--revealed" : ""}`}
              >
                <button
                  type="button"
                  className="thread-item"
                  onClick={() => handleThreadItemClick(thread.id)}
                  onTouchStart={() => startLongPress(thread.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  <span className="thread-title">{thread.title}</span>
                  <span className="thread-meta">
                    Updated {timeAgo(thread.updatedAt)}
                  </span>
                </button>

                <button
                  type="button"
                  className="thread-more-btn"
                  aria-label={`More options for ${thread.title}`}
                  onClick={() => setOpenMenuId(thread.id)}
                >
                  ⋯
                </button>

                {openMenuId === thread.id && (
                  <div className="thread-dialog-overlay">
                    <button
                      type="button"
                      className="thread-dialog-backdrop"
                      aria-label="Close menu"
                      onClick={closeMenu}
                    />
                    <div className="thread-dialog-panel thread-dialog-panel--menu">
                      <button
                        type="button"
                        className="thread-dialog-menu-item"
                        onClick={() => {
                          setRenamingThread(thread);
                          setRenameValue(thread.title);
                          closeMenu();
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="thread-dialog-menu-item thread-dialog-menu-item--danger"
                        onClick={() => {
                          setDeletingThread(thread);
                          closeMenu();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="sidebar-export-button sidebar-export-button--floating"
            onClick={handleExportClick}
            disabled={exporting}
            aria-label="Export chats"
            title="Export chats"
          >
            ⬇
          </button>
          <button
            type="button"
            className="sidebar-new-button sidebar-new-button--floating"
            onClick={onNewThread}
            aria-label="New chat"
          >
            +
          </button>
          {exportError && <p className="sidebar-export-error">{exportError}</p>}
        </>
      )}

      {renamingThread && (
        <div className="thread-dialog-overlay">
          <button
            type="button"
            className="thread-dialog-backdrop"
            aria-label="Cancel rename"
            onClick={() => setRenamingThread(null)}
          />
          <form
            className="thread-dialog-panel"
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameSubmit(renamingThread.id);
            }}
          >
            <h2 className="thread-dialog-title">Rename chat</h2>
            <input
              className="create-thread-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Name this thread"
              autoFocus
            />
            <div className="thread-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRenamingThread(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!renameValue.trim()}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingThread && (
        <div className="thread-dialog-overlay">
          <button
            type="button"
            className="thread-dialog-backdrop"
            aria-label="Cancel delete"
            onClick={() => setDeletingThread(null)}
          />
          <div className="thread-dialog-panel">
            <h2 className="thread-dialog-title">
              Delete "{deletingThread.title}"?
            </h2>
            <p className="thread-dialog-body">This can't be undone.</p>
            <div className="thread-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingThread(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onDeleteThread(deletingThread.id);
                  setDeletingThread(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
