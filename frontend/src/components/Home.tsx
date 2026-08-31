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
import {
  createThread,
  deleteThread,
  exportBytes,
  getConfig,
  getThreads,
  importBytes,
  renameThread,
} from "../storage";
import type { Config, Thread } from "../storage";
import { buildBackupZip, parseBackupZip } from "../backup/zip";
import { downloadBytes } from "../backup/browserFile";
import { Sidebar } from "./Sidebar";
import { CreateThread } from "./CreateThread";
import { ChatView } from "./ChatView";
import { Settings } from "./Settings";

interface HomeProps {
  name: string;
  onNameChange: (name: string) => void;
  theme: Config["theme"];
  onThemeChange: (theme: Config["theme"]) => void;
}

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "thread"; threadId: number };

type LoadStatus =
  | { kind: "loading" }
  | { kind: "ready"; threads: Thread[] }
  | { kind: "error"; message: string };

export function Home({ name, onNameChange, theme, onThemeChange }: HomeProps) {
  const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
  const [view, setView] = useState<View>({ kind: "list" });
  // The settings overlay floats above whichever view is active (list,
  // create, or an open thread) rather than being one of the View kinds
  // above — it's a modal, not a screen you navigate to and from.
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Renaming just needs a re-fetch afterward — the thread being renamed
  // isn't necessarily the one currently open, so there's no view-state
  // change to make (unlike delete, below).
  async function handleRenameThread(threadId: number, title: string) {
    try {
      await renameThread(threadId, title);
      await reloadThreads();
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong renaming that chat.",
      });
    }
  }

  // If the thread being deleted is the one currently open in ChatView,
  // navigate back to the list first — otherwise ChatView would keep
  // showing a thread that no longer exists in storage (its own effect
  // only re-fetches when `threadId` itself changes, not on a delete
  // happening elsewhere).
  async function handleDeleteThread(threadId: number) {
    try {
      await deleteThread(threadId);
      if (view.kind === "thread" && view.threadId === threadId) {
        setView({ kind: "list" });
      }
      await reloadThreads();
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong deleting that chat.",
      });
    }
  }

  // Sidebar's export button — gathers the two pieces a backup needs (the
  // SQLite bytes and the config object), zips them, and hands the result
  // to the browser as a download. Errors (any of these three steps) are
  // deliberately left to propagate rather than caught here — Sidebar's
  // own handler catches them and shows the message inline, since a
  // failed export shouldn't blow away the rest of Home the way
  // handleRenameThread/handleDeleteThread's errors do above.
  async function handleExport() {
    const [sqliteBytes, config] = await Promise.all([
      exportBytes(),
      getConfig(),
    ]);
    const zipBytes = await buildBackupZip(sqliteBytes, config);
    const date = new Date().toISOString().slice(0, 10);
    downloadBytes(zipBytes, `talkcrates-backup-${date}.zip`, "application/zip");
  }

  // Settings' "Import" — the counterpart to handleImportSession in
  // App.tsx, for an *existing* session rather than a brand new one. The
  // overwrite-confirm dialog (this path can actually destroy data,
  // unlike App.tsx's) lives in Settings.tsx itself, right before it calls
  // this — by the time this runs, the user has already agreed.
  //
  // onNameChange/onThemeChange are the same callbacks Settings' own
  // Personalization tab uses to edit the name/theme one field at a time
  // (they already persist to config via App.tsx) — reused here rather
  // than duplicating a "write the whole config" storage call, since
  // calling both restores every field a Config has.
  async function handleImportZip(zipBytes: Uint8Array) {
    const { sqliteBytes, config } = await parseBackupZip(zipBytes);
    await importBytes(sqliteBytes);
    onNameChange(config.name);
    onThemeChange(config.theme);
    await reloadThreads();
    // The view may be pointing at a thread (or the create-thread form)
    // that no longer means anything post-import — back to a plain list.
    setView({ kind: "list" });
  }

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
          name={name}
          onSelectThread={(threadId) => setView({ kind: "thread", threadId })}
          onNewThread={() => setView({ kind: "create" })}
          onOpenSettings={() => setSettingsOpen(true)}
          onRenameThread={handleRenameThread}
          onDeleteThread={handleDeleteThread}
          onExport={handleExport}
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

      {settingsOpen && (
        <Settings
          name={name}
          onNameChange={onNameChange}
          theme={theme}
          onThemeChange={onThemeChange}
          onClose={() => setSettingsOpen(false)}
          onImportZip={handleImportZip}
        />
      )}
    </div>
  );
}
