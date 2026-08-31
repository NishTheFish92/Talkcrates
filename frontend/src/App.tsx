// App's job: get the storage layer initialized once on startup, own the
// two pieces of state that live above any single screen (which "gate"
// screen is showing, and the active theme), and hand off to Home once
// both storage is ready and a name is known. Home owns everything after
// that — the actual thread list and navigation between its screens.

import { useEffect, useState } from "react";
import { getConfig, importBytes, init, updateConfig } from "./storage";
import type { Config } from "./storage";
import { parseBackupZip } from "./backup/zip";
import { SessionChoice } from "./components/SessionChoice";
import { NameCapture } from "./components/NameCapture";
import { Home } from "./components/Home";
import { seedGettingStartedThread } from "./gettingStartedThread";
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
  // Only ever set by a failed "Import Existing Session" attempt on
  // SessionChoice — shown there so the user can see what went wrong and
  // try a different file, without leaving that screen or hitting the
  // full-page error state (that's reserved for storage itself being
  // broken, not "picked the wrong file").
  const [importError, setImportError] = useState<string | null>(null);

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

  // SessionChoice's "Import Existing Session" — `zipBytes` is the raw
  // uploaded file, already read off disk by SessionChoice but not yet
  // looked at. Unzipping (parseBackupZip) and validating/swapping in the
  // SQLite bytes (importBytes) can each fail on a bad file, so both are
  // inside the same try/catch: either failure means "show an error and
  // stay on this screen," never "proceed with half-imported data."
  //
  // No overwrite-confirm dialog here — unlike Settings' import (Home.tsx),
  // this path only ever runs while status.kind is "selecting", which only
  // happens when config.name is empty (see the load() effect below) — i.e.
  // always into a blank session with nothing to lose. See CLAUDE.md ->
  // "Data storage & privacy" for why the two entry points differ here.
  async function handleImportSession(zipBytes: Uint8Array) {
    setImportError(null);
    try {
      const { sqliteBytes, config } = await parseBackupZip(zipBytes);
      await importBytes(sqliteBytes);
      // Restore the whole config (not just name) so theme comes back too,
      // exactly as it was in the backup.
      await updateConfig({ name: config.name, theme: config.theme });
      setTheme(config.theme);
      setStatus({ kind: "ready", name: config.name });
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Something went wrong importing that file.",
      );
    }
  }

  // Called once the user submits the name-capture form — the tail end of
  // the "New Session" path (see the Status type comment above). Unlike
  // handleImportDummy, this is the one place that knows both "this is a
  // genuinely new user" and "here's their name", so it's the right spot to
  // seed the example thread. Seeding happens *before* setStatus flips to
  // "ready" and Home mounts, not after — Home loads its thread list once,
  // on mount, so if the seed thread were still being written in the
  // background the sidebar would render empty and never pick it up without
  // a reload.
  //
  // If saving the name itself fails, that's a real storage problem and
  // still surfaces the error screen as before. If the name saves fine but
  // seeding the example thread fails, that's a lower-stakes, nice-to-have
  // failure, so it's logged and swallowed rather than blocking the user
  // from reaching an otherwise-working app.
  async function handleNameSubmit(name: string) {
    try {
      await updateConfig({ name });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong saving your name.",
      });
      return;
    }

    try {
      await seedGettingStartedThread(name);
    } catch (err) {
      console.warn("Couldn't seed the Getting started thread:", err);
    }

    setStatus({ kind: "ready", name });
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
        onImport={handleImportSession}
        importError={importError}
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
