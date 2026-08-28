// Small-settings storage: the user's name and theme preference, kept
// entirely separate from the SQLite database (see CLAUDE.md → "Config
// file") since neither fits a relational schema and both are read/written
// as one whole value, not rows.
//
// Cached in localStorage rather than IndexedDB. The database uses
// IndexedDB because sql.js only knows how to read/write it as an opaque
// byte blob through an async API. Config here is a handful of plain
// values with no such requirement — localStorage is synchronous and
// needs no schema, a better fit for something this small. It's still just
// the *ephemeral* in-session cache, same role IndexedDB plays for the
// database — the zip export remains the only durable copy.

import { StorageError, ValidationError } from "./errors";
import type { Config } from "./types";

const STORAGE_KEY = "talkcrates:config";

const DEFAULT_CONFIG: Config = {
  version: 1,
  name: "",
  theme: "vibrant",
};

const VALID_THEMES: Config["theme"][] = ["vibrant", "light", "dark"];

// Reads the saved config. Falls back to DEFAULT_CONFIG if nothing's been
// saved yet (a first-time user — the normal case, not an error) or if
// what's saved can't be parsed. A corrupted settings blob is treated the
// same as "nothing saved" rather than a hard failure — this is low-stakes
// data, not worth crashing the app over.
export async function getConfig(): Promise<Config> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    throw new StorageError(
      `Could not read config from localStorage: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!raw) {
    return DEFAULT_CONFIG;
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Merges `patch` into whatever's currently saved (or the defaults, if
// nothing is) and saves the result. A patch rather than a full replace —
// so setting just the theme doesn't require also re-sending the name.
export async function updateConfig(
  patch: Partial<Omit<Config, "version">>,
): Promise<Config> {
  if (patch.theme !== undefined && !VALID_THEMES.includes(patch.theme)) {
    throw new ValidationError(
      `Invalid theme "${patch.theme}" — expected one of ${VALID_THEMES.join(", ")}`,
    );
  }

  const current = await getConfig();
  const next: Config = { ...current, ...patch };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    throw new StorageError(
      `Could not save config to localStorage: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return next;
}
