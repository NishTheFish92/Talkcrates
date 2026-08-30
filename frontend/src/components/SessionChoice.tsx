// Wireframe screen 2, "What would you like to do?" — shown once, before
// any name is known (see App.tsx's "selecting" status), offering a fresh
// start vs. restoring a previously exported session. Also carries the
// theme picker, same as the wireframe puts it here.
//
// Neither button does real storage work yet — the zip-based import/export
// pipeline (CLAUDE.md -> exportBytes()/importBytes()) isn't built (see
// ../iterations.MD -> M9/M10), so:
//   - "New Session" hands off to the real, already-working name-capture
//     screen (App.tsx's needsName status) — that flow only touches
//     localStorage config, not zip import, so there's nothing to defer.
//   - "Import Existing Session" is a placeholder for now: a real import
//     would restore a name/theme/threads that already exist, skipping
//     straight past name-capture — so the placeholder does the same
//     (jumps straight to the main app), it just doesn't read a file yet.

import type { Config } from "../storage";
import { ThemePicker } from "./ThemePicker";

interface SessionChoiceProps {
  theme: Config["theme"];
  onThemeChange: (theme: Config["theme"]) => void;
  onNewSession: () => void;
  onImport: () => void;
}

export function SessionChoice({
  theme,
  onThemeChange,
  onNewSession,
  onImport,
}: SessionChoiceProps) {
  return (
    <div className="session-choice">
      <h1>What would you like to do?</h1>

      <div className="session-choice-actions">
        <button
          type="button"
          className="session-choice-primary"
          onClick={onNewSession}
        >
          <span aria-hidden="true">+</span>
          New Session
        </button>
        <button
          type="button"
          className="session-choice-secondary"
          onClick={onImport}
        >
          Import Existing Session
        </button>
      </div>

      <div className="session-choice-theme">
        <div className="session-choice-theme-label">Theme</div>
        <ThemePicker value={theme} onChange={onThemeChange} size="large" />
      </div>
    </div>
  );
}
