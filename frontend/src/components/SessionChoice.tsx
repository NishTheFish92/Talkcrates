// Wireframe screen 2, "What would you like to do?" — shown once, before
// any name is known (see App.tsx's "selecting" status), offering a fresh
// start vs. restoring a previously exported session. Also carries the
// theme picker, same as the wireframe puts it here.
//
// "New Session" hands off to the real, already-working name-capture
// screen (App.tsx's needsName status) — that flow only touches
// localStorage config, so there's nothing zip-related to it.
//
// "Import Existing Session" is real now (M9/M10, see ../iterations.MD):
// this component's own job is just picking the file and reading it into
// bytes — a plain DOM concern, same as any other form input here — while
// App.tsx (which already owns every other storage call this screen
// triggers) does the actual unzip/import/error-handling behind onImport.

import { useRef, useState, type ChangeEvent } from "react";
import type { Config } from "../storage";
import { readFileBytes } from "../backup/browserFile";
import { ThemePicker } from "./ThemePicker";

interface SessionChoiceProps {
  theme: Config["theme"];
  onThemeChange: (theme: Config["theme"]) => void;
  onNewSession: () => void;
  onImport: (zipBytes: Uint8Array) => Promise<void>;
  importError: string | null;
}

export function SessionChoice({
  theme,
  onThemeChange,
  onNewSession,
  onImport,
  importError,
}: SessionChoiceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Local, not lifted to App.tsx — nothing outside this component cares
  // whether an import is mid-flight, only that its outcome (importError,
  // or App.tsx moving on to "ready") eventually shows up.
  const [importing, setImporting] = useState(false);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the *same* file again still fires this handler —
    // browsers only fire `change` on a value actually changing otherwise.
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const bytes = await readFileBytes(file);
      await onImport(bytes);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="session-choice">
      <h1>What would you like to do?</h1>

      <div className="session-choice-actions">
        <button
          type="button"
          className="session-choice-primary"
          onClick={onNewSession}
          disabled={importing}
        >
          <span aria-hidden="true">+</span>
          New Session
        </button>
        <button
          type="button"
          className="session-choice-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? "Importing…" : "Import Existing Session"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />
      </div>

      {importError && <p className="session-choice-error">{importError}</p>}

      <div className="session-choice-theme">
        <div className="session-choice-theme-label">Theme</div>
        <ThemePicker value={theme} onChange={onThemeChange} size="large" />
      </div>
    </div>
  );
}
