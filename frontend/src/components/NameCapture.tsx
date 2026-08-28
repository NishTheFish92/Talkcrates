// First-run name capture. Shown once, before the sidebar, whenever no name
// has been saved yet (storage/config.ts's `name` field starts as `""` and
// nothing else in the app sets it — there's no separate onboarding flow).
// The name captured here is what the role picker (M5) will read to
// compute the `{Name}` / `Rational {Name}` presets — see CLAUDE.md →
// "Preset defaults". This component itself doesn't touch storage; it just
// hands the trimmed name to whatever `onSubmit` does with it.

import { useState, type FormEvent } from "react";

interface NameCaptureProps {
  onSubmit: (name: string) => void;
}

export function NameCapture({ onSubmit }: NameCaptureProps) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form className="name-capture" onSubmit={handleSubmit}>
      <h1>Welcome! What's your name?</h1>
      <div className="name-capture-row">
        <input
          className="name-capture-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          autoFocus
        />
        <button
          type="submit"
          className="name-capture-submit"
          aria-label="Continue"
          disabled={!trimmed}
        >
          →
        </button>
      </div>
    </form>
  );
}
