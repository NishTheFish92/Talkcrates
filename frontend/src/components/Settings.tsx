// The Settings overlay from wireframe screen 5 (the gear/☰ icon next to
// "Chats"). Two levels, tracked as local subView state since neither needs
// to survive the overlay closing: a root menu (Personalization / About)
// and Personalization itself — name + theme, the only settings that exist
// so far (About is a reserved-but-empty tab in the wireframe too).
//
// No storage calls in here — same "presentational component, parent owns
// storage" split every other screen component uses. Every edit saves
// immediately as you make it (onNameChange fires per keystroke,
// onThemeChange per tap, both handled by App.tsx), so there's no
// save/cancel step — closing the overlay never discards anything.

import { useState } from "react";
import type { Config } from "../storage";
import { ThemePicker } from "./ThemePicker";

interface SettingsProps {
  name: string;
  onNameChange: (name: string) => void;
  theme: Config["theme"];
  onThemeChange: (theme: Config["theme"]) => void;
  onClose: () => void;
}

type SubView = "root" | "personalization" | "about";

export function Settings({
  name,
  onNameChange,
  theme,
  onThemeChange,
  onClose,
}: SettingsProps) {
  const [subView, setSubView] = useState<SubView>("root");

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
