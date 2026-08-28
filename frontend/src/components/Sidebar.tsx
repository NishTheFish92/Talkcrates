// The sidebar/thread-list — M4's whole job. Purely presentational: it's
// handed the threads App.tsx already fetched and just renders them. No
// storage calls in here, and no click handling yet — opening a thread is
// M6's job, creating one is M5's.

import type { Thread } from "../storage";

interface SidebarProps {
  threads: Thread[];
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

export function Sidebar({ threads }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Chats</h1>
      </div>
      {threads.length === 0 ? (
        <div className="sidebar-empty">No chats yet.</div>
      ) : (
        <ul className="thread-list">
          {threads.map((thread) => (
            <li key={thread.id} className="thread-item">
              <span className="thread-title">{thread.title}</span>
              <span className="thread-meta">
                Updated {timeAgo(thread.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
