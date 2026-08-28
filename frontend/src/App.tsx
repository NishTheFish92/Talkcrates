// App's job: get the storage layer initialized once on startup, and
// gate on whether a name has been captured yet. Once both are true, it
// hands off entirely to Home, which owns the actual thread list and
// navigation between screens — App itself never fetches threads.

import { useEffect, useState } from "react";
import { getConfig, init, updateConfig } from "./storage";
import { NameCapture } from "./components/NameCapture";
import { Home } from "./components/Home";
import "./App.css";

// A small state machine instead of separate loading/error/data booleans —
// this way the render code below can only ever be in exactly one of these
// four states, never e.g. "loading" and "error" at once.
type Status =
  | { kind: "loading" }
  | { kind: "needsName" }
  | { kind: "ready"; name: string }
  | { kind: "error"; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  // Runs once when App first mounts (empty dependency array). init() loads
  // the sql.js engine and restores any saved IndexedDB snapshot; getConfig()
  // then checks whether a name has already been captured.
  useEffect(() => {
    // React can unmount this component before the async work below
    // finishes (e.g. StrictMode's dev-mode double-invoke). `cancelled`
    // stops a late response from calling setState on an unmounted
    // component.
    let cancelled = false;

    async function load() {
      try {
        await init();
        const config = await getConfig();
        if (!cancelled) {
          setStatus(
            config.name
              ? { kind: "ready", name: config.name }
              : { kind: "needsName" },
          );
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

  // Called once the user submits the name-capture form.
  async function handleNameSubmit(name: string) {
    try {
      await updateConfig({ name });
      setStatus({ kind: "ready", name });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong saving your name.",
      });
    }
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
  if (status.kind === "needsName") {
    return <NameCapture onSubmit={handleNameSubmit} />;
  }
  return <Home name={status.name} />;
}

export default App;
