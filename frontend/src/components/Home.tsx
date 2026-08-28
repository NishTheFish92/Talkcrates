// Once App has confirmed storage is ready and a name is known, Home owns
// everything else: navigation between the three main screens (the thread
// list, creating a new thread, an open thread's chat view) and the thread
// list data all of them read from or need refreshed after. Sidebar,
// CreateThread, and ChatView stay presentational — no storage calls of
// their own — same split each of them already uses individually.
//
// Layout: both the sidebar and the "detail" area (whatever CreateThread /
// ChatView / an empty placeholder currently is) are always rendered —
// which one is actually visible is a CSS question, not a JS one. Below a
// laptop-width breakpoint, exactly one pane shows at a time (phone-style
// single-screen navigation, via the app-shell--list/--detail modifier
// class below). Past that breakpoint, both show permanently side by side
// (ChatGPT/Claude-style) — see the media query in App.css.

import { useEffect, useState } from "react";
import { createThread, getThreads } from "../storage";
import type { Thread } from "../storage";
import { Sidebar } from "./Sidebar";
import { CreateThread } from "./CreateThread";
import { ChatView } from "./ChatView";

interface HomeProps {
  name: string;
}

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "thread"; threadId: number };

type LoadStatus =
  | { kind: "loading" }
  | { kind: "ready"; threads: Thread[] }
  | { kind: "error"; message: string };

export function Home({ name }: HomeProps) {
  const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
  const [view, setView] = useState<View>({ kind: "list" });

  async function reloadThreads() {
    try {
      const threads = await getThreads();
      setStatus({ kind: "ready", threads });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong loading your chats.",
      });
    }
  }

  useEffect(() => {
    reloadThreads();
  }, []);

  if (status.kind === "loading") {
    return <div className="status-message">Loading your chats…</div>;
  }
  if (status.kind === "error") {
    return (
      <div className="status-message status-message--error">
        {status.message}
      </div>
    );
  }

  // On the single-pane (phone) layout this decides which of the two panes
  // is actually visible. On the two-pane (laptop) layout both panes are
  // always shown regardless of this class — see App.css.
  const shellModifier = view.kind === "list" ? "app-shell--list" : "app-shell--detail";

  return (
    <div className={`app-shell ${shellModifier}`}>
      <div className="app-sidebar-pane">
        <Sidebar
          threads={status.threads}
          onSelectThread={(threadId) => setView({ kind: "thread", threadId })}
          onNewThread={() => setView({ kind: "create" })}
        />
      </div>

      <div className="app-detail-pane">
        {view.kind === "create" && (
          <CreateThread
            name={name}
            onCancel={() => setView({ kind: "list" })}
            onCreate={async (title, role1, role2) => {
              await createThread(title, role1, role2);
              await reloadThreads();
              setView({ kind: "list" });
            }}
          />
        )}
        {view.kind === "thread" && (
          <ChatView
            threadId={view.threadId}
            onBack={async () => {
              // A message sent in there may have bumped updatedAt, which
              // reorders the sidebar — reload rather than reuse the
              // threads this component already had.
              await reloadThreads();
              setView({ kind: "list" });
            }}
            // Keeps the sidebar's "Updated Xm ago" live while the chat
            // stays open next to it (two-pane layout only — on the
            // single-pane layout the sidebar isn't visible to be stale in
            // the first place, so this just does a harmless extra fetch).
            onMessageSent={reloadThreads}
          />
        )}
        {view.kind === "list" && (
          <div className="app-detail-empty">
            <p>Select a chat, or start a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
