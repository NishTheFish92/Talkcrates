// The sidebar/thread-list. Purely presentational: it's handed the threads
// Home already fetched, plus two callbacks for the two things you can do
// from here — open a thread or start a new one. No storage calls of its
// own, same split every other screen component uses.

import type { Thread } from "../storage";

interface SidebarProps {
  threads: Thread[];
  onSelectThread: (threadId: number) => void;
  onNewThread: () => void;
}

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

export function Sidebar({ threads, onSelectThread, onNewThread }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Chats</h1>
      </div>
      {threads.length === 0 ? (
        <div className="sidebar-empty">
          <p>No chats yet.</p>
          <button
            type="button"
            className="sidebar-new-button sidebar-new-button--empty"
            onClick={onNewThread}
            aria-label="New chat"
          >
            +
          </button>
        </div>
      ) : (
        <>
          <ul className="thread-list">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className="thread-item"
                  onClick={() => onSelectThread(thread.id)}
                >
                  <span className="thread-title">{thread.title}</span>
                  <span className="thread-meta">
                    Updated {timeAgo(thread.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="sidebar-new-button sidebar-new-button--floating"
            onClick={onNewThread}
            aria-label="New chat"
          >
            +
          </button>
        </>
      )}
    </div>
  );
}
