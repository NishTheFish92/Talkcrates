// One participant's role field in the create-thread screen: a dropdown
// offering the computed preset ({Name} or Rational {Name} — the caller
// passes the already-resolved string) plus a "custom" option that swaps
// to a free-text input. Per CLAUDE.md -> "Preset defaults", custom text
// must always be reachable regardless of how many presets exist, so
// "preset vs. custom" is a real fork here, not just a suggestion.

import { useState } from "react";

interface RolePickerProps {
  label: string;
  preset: string;
  value: string;
  onChange: (value: string) => void;
}

const CUSTOM = "__custom__";

export function RolePicker({ label, preset, value, onChange }: RolePickerProps) {
  // Tracked as its own bit of state rather than derived from `value ===
  // preset` — that comparison would misfire if a custom-typed role ever
  // happened to match the preset string exactly, flipping the field back
  // to the dropdown mid-typing.
  const [mode, setMode] = useState<"preset" | "custom">(
    value === preset ? "preset" : "custom",
  );

  return (
    <div className="role-picker">
      <span className="role-picker-label">{label}</span>
      {mode === "custom" ? (
        <input
          className="role-picker-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a custom role"
        />
      ) : (
        <select
          className="role-picker-select"
          value={preset}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setMode("custom");
              onChange("");
            }
          }}
        >
          <option value={preset}>{preset}</option>
          <option value={CUSTOM}>Type a custom role…</option>
        </select>
      )}
    </div>
  );
}
