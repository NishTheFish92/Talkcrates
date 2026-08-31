// The Settings overlay from wireframe screen 5 (the gear/☰ icon next to
// "Chats"). Two levels, tracked as local subView state since neither needs
// to survive the overlay closing: a root menu (Personalization / About /
// Import) and Personalization itself — name + theme, the only per-field
// settings that exist so far (About is a reserved-but-empty tab in the
// wireframe too).
//
// Export used to live here too, but moved out to a standalone icon button
// in Sidebar.tsx (next to "+") — exporting shouldn't be hidden behind a
// menu. Import stays here: unlike export (a one-click action with nothing
// to confirm), import can destroy the current session's data, which reads
// more like a Settings-tier action than something to expose as casually as
// the "+" button.
//
// Import is the one exception to "no storage calls in here" below —
// Home.tsx still owns the actual importBytes()/zip calls (onImportZip),
// but picking a file and deciding whether to even attempt the import (the
// confirm() dialog) are treated as this component's own interaction
// logic, same as any other form input here.
//
// Every Personalization edit saves immediately as you make it
// (onNameChange fires per keystroke, onThemeChange per tap, both handled
// by App.tsx), so there's no save/cancel step for those — closing the
// overlay never discards anything. Import instead tracks its own
// pending/error state locally, shown right under its button, since that's
// the one action here that can actually fail.

import { useRef, useState, type ChangeEvent } from "react";
import type { Config } from "../storage";
import { readFileBytes } from "../backup/browserFile";
import { ThemePicker } from "./ThemePicker";

interface SettingsProps {
  name: string;
  onNameChange: (name: string) => void;
  theme: Config["theme"];
  onThemeChange: (theme: Config["theme"]) => void;
  onClose: () => void;
  onImportZip: (zipBytes: Uint8Array) => Promise<void>;
}

type SubView = "root" | "personalization" | "about";

export function Settings({
  name,
  onNameChange,
  theme,
  onThemeChange,
  onClose,
  onImportZip,
}: SettingsProps) {
  const [subView, setSubView] = useState<SubView>("root");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // The one path (unlike App.tsx's SessionChoice import) where an
    // import can actually destroy data — this is an existing session, not
    // a blank one. See CLAUDE.md -> "Data storage & privacy".
    const confirmed = window.confirm(
      "Importing will replace your current chats and settings with this backup. This can't be undone. Continue?",
    );
    if (!confirmed) return;

    setImportError(null);
    setImporting(true);
    try {
      const bytes = await readFileBytes(file);
      await onImportZip(bytes);
      // Nothing left to look at in Settings — the imported data (and
      // possibly a new name/theme) is already showing behind it.
      onClose();
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Something went wrong importing that file.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="settings-overlay">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-panel">
        {subView === "root" && (
          <>
            <div className="settings-header">
              <span className="settings-title">Settings</span>
              <button
                type="button"
                className="settings-close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              className="settings-row"
              onClick={() => setSubView("personalization")}
            >
              Personalization
              <span aria-hidden="true" className="settings-row-chevron">
                ›
              </span>
            </button>
            <button
              type="button"
              className="settings-row"
              onClick={() => setSubView("about")}
            >
              About
              <span aria-hidden="true" className="settings-row-chevron">
                ›
              </span>
            </button>

            {/* Import doesn't navigate to a subview like the two rows
                above — it fires an action directly — so it doesn't get
                the "›" chevron; that affordance means "opens another
                screen," which isn't what happens here. */}
            <button
              type="button"
              className="settings-row"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? "Importing…" : "Import"}
            </button>
            {importError && <p className="settings-error">{importError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelected}
              style={{ display: "none" }}
            />
          </>
        )}

        {subView === "personalization" && (
          <>
            <div className="settings-back-row">
              <button
                type="button"
                className="settings-back"
                onClick={() => setSubView("root")}
                aria-label="Back"
              >
                ←
              </button>
              <span className="settings-subtitle">Personalization</span>
            </div>

            <div className="field">
              <label htmlFor="settings-name">Name</label>
              <input
                id="settings-name"
                className="create-thread-input"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="field">
              <label>Theme</label>
              <ThemePicker value={theme} onChange={onThemeChange} size="small" />
            </div>
          </>
        )}

        {subView === "about" && (
          <>
            <div className="settings-back-row">
              <button
                type="button"
                className="settings-back"
                onClick={() => setSubView("root")}
                aria-label="Back"
              >
                ←
              </button>
              <span className="settings-subtitle">About</span>
            </div>
            <div className="settings-about-spacer" />
          </>
        )}
      </div>
    </div>
  );
}
