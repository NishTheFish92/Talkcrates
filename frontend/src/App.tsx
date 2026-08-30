// App's job: get the storage layer initialized once on startup, own the
// two pieces of state that live above any single screen (which "gate"
// screen is showing, and the active theme), and hand off to Home once
// both storage is ready and a name is known. Home owns everything after
// that — the actual thread list and navigation between its screens.

import { useEffect, useState } from "react";
import { getConfig, init, updateConfig } from "./storage";
import type { Config } from "./storage";
import { SessionChoice } from "./components/SessionChoice";
import { NameCapture } from "./components/NameCapture";
import { Home } from "./components/Home";
import "./App.css";

// A small state machine instead of separate loading/error/data booleans —
// this way the render code below can only ever be in exactly one of these
// five states, never e.g. "loading" and "error" at once.
//
// "selecting" and "needsName" are both pre-Home, first-run-only states
// (config.name starts as "" until one of them sets it) — "selecting" is
// the wireframe's "New Session / Import Existing Session" screen, shown
// first; picking "New Session" moves to "needsName" (the real, already-
// working name-capture screen). Picking "Import Existing Session" skips
// straight to "ready" — see SessionChoice.tsx's comment for why.
type Status =
  | { kind: "loading" }
  | { kind: "selecting" }
  | { kind: "needsName" }
  | { kind: "ready"; name: string }
  | { kind: "error"; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // Lives outside Status because it applies regardless of which screen
  // above is showing — the theme picker appears both pre-Home (on
  // SessionChoice) and inside Home (Settings' Personalization tab), and
  // the page needs to render in the right theme even before a name/Home
  // is reached at all.
  const [theme, setTheme] = useState<Config["theme"]>("vibrant");

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
          setTheme(config.theme);
          setStatus(
            config.name
              ? { kind: "ready", name: config.name }
              : { kind: "selecting" },
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

  // Keeps <html data-theme="..."> in sync with `theme` — this is the one
  // line that actually makes theme switching visible: index.css defines
  // :root[data-theme='dark']/[data-theme='light'] overrides that only
  // apply once this attribute is set (plain :root, no attribute, is
  // "vibrant"). Runs on every theme change, including the very first one
  // once load() above learns the saved theme from config.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Shared by SessionChoice and Settings (via Home) — updates the theme
  // immediately (optimistic) so the picker feels instant, then persists
  // it. Applied the same way regardless of which screen changed it.
  async function handleThemeChange(next: Config["theme"]) {
    setTheme(next);
    try {
      await updateConfig({ theme: next });
    } catch {
      // Low-stakes setting — not worth surfacing a full error screen over.
      // The next successful write (or reload from the saved config) will
      // catch up.
    }
  }

  // SessionChoice's "New Session" — moves on to the real name-capture
  // screen, unchanged from before this screen existed.
  function handleStartNewSession() {
    setStatus({ kind: "needsName" });
  }

  // SessionChoice's "Import Existing Session" — see SessionChoice.tsx's
  // comment. No real import yet, so this just proceeds into the app the
  // way a real import eventually will (skipping name-capture), without
  // actually restoring anything. config.name is still "" at this point,
  // and Home/Sidebar already render sensibly with an empty name.
  function handleImportDummy() {
    setStatus({ kind: "ready", name: "" });
  }

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

  // Settings' Personalization tab editing the name after the fact —
  // same underlying save as handleNameSubmit, but fires on every
  // keystroke (matching the wireframe's input) rather than on a form
  // submit, and updates state in place instead of transitioning screens.
  async function handleNameChange(name: string) {
    if (status.kind !== "ready") return;
    setStatus({ kind: "ready", name });
    try {
      await updateConfig({ name });
    } catch {
      // Same reasoning as handleThemeChange — low-stakes, best-effort.
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
  if (status.kind === "selecting") {
    return (
      <SessionChoice
        theme={theme}
        onThemeChange={handleThemeChange}
        onNewSession={handleStartNewSession}
        onImport={handleImportDummy}
      />
    );
  }
  if (status.kind === "needsName") {
    return <NameCapture onSubmit={handleNameSubmit} />;
  }
  return (
    <Home
      name={status.name}
      onNameChange={handleNameChange}
      theme={theme}
      onThemeChange={handleThemeChange}
    />
  );
}

export default App;
