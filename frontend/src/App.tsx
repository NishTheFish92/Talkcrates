// App's job right now: get the storage layer initialized once on startup,
// fetch the thread list, and hand it to Sidebar. Everything about *how*
// threads get rendered lives in Sidebar — App just owns the async
// loading/error state around the storage calls.

import { useEffect, useState } from "react";
import { getThreads, init } from "./storage";
import type { Thread } from "./storage";
import { Sidebar } from "./components/Sidebar";
import "./App.css";

// A small state machine instead of separate loading/error/data booleans —
// this way the render code below can only ever be in exactly one of these
// three states, never e.g. "loading" and "error" at once.
type Status =
  | { kind: "loading" }
  | { kind: "ready"; threads: Thread[] }
  | { kind: "error"; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  // Runs once when App first mounts (empty dependency array). init() loads
  // the sql.js engine and restores any saved IndexedDB snapshot;
  // getThreads() then reads the sidebar list out of that database.
  useEffect(() => {
    // React can unmount this component before the async work below
    // finishes (e.g. StrictMode's dev-mode double-invoke). `cancelled`
    // stops a late response from calling setState on an unmounted
    // component.
    let cancelled = false;

    async function load() {
      try {
        await init();
        const threads = await getThreads();
        if (!cancelled) {
          setStatus({ kind: "ready", threads });
        }
      } catch (err) {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message:
              err instanceof Error
                ? err.message
                : "Something went wrong loading your chats.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
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
  return <Sidebar threads={status.threads} />;
}

export default App;
