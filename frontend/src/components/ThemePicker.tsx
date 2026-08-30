// The 3-swatch theme picker from the wireframe (Vibrant / Light / Dark).
// Used in two places — the session-choice screen and Settings'
// Personalization tab — so it lives as its own small component instead of
// being written out twice. Purely presentational: it's handed the current
// theme and a callback, same "no storage calls of its own" split every
// other screen component in this app uses (App.tsx owns the actual
// updateConfig() call and the live document.documentElement swap).

import type { Config } from "../storage";

interface ThemeOption {
  id: Config["theme"];
  label: string;
  // CSS `background` value for the swatch circle — a gradient rather than
  // a flat color so each option reads as a little preview of its theme
  // rather than just a color chip, matching the wireframe.
  gradient: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "vibrant",
    label: "Vibrant",
    gradient:
      "conic-gradient(from 210deg, #ff6e7f, #ff8f5e, #ffd166, #22c7b8, #7b61ff, #ff6e7f)",
  },
  {
    id: "light",
    label: "Light",
    gradient: "linear-gradient(145deg, #ffffff, #d7d9e6)",
  },
  {
    id: "dark",
    label: "Dark",
    gradient: "linear-gradient(145deg, #22242f, #0c0d14)",
  },
];

interface ThemePickerProps {
  value: Config["theme"];
  onChange: (theme: Config["theme"]) => void;
  // "large" on the session-choice screen, "small" inside the Settings
  // panel — same two sizes the wireframe uses for the same control.
  size?: "large" | "small";
}

export function ThemePicker({ value, onChange, size = "large" }: ThemePickerProps) {
  return (
    <div className={`theme-picker theme-picker--${size}`}>
      {THEME_OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            className={`theme-swatch ${selected ? "theme-swatch--selected" : ""}`}
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
          >
            <span
              className="theme-swatch-circle"
              style={{ background: option.gradient }}
            />
            <span className="theme-swatch-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
