// Scratch verification for the config store (name/theme settings, kept
// separate from the SQLite database — see CLAUDE.md → "Config file").
// Same idea as verify-m1.ts etc.: a throwaway script, run directly in
// Node, to prove the real code works before any UI is wired to it.
//
// Run with: npx tsx scripts/verify-config.ts
//
// Node has no localStorage of its own — like IndexedDB, it's a browser
// API. Unlike IndexedDB (which has real async request/transaction
// semantics `fake-indexeddb` faithfully emulates), localStorage's actual
// behavior is just a synchronous key-value get/set, simple enough to
// stand in for directly below rather than pulling in a library for it.
// The real, browser-served app never touches this stand-in.

const fakeStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => fakeStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    fakeStore.set(key, value);
  },
  removeItem: (key: string) => {
    fakeStore.delete(key);
  },
  clear: () => fakeStore.clear(),
  key: (index: number) => Array.from(fakeStore.keys())[index] ?? null,
  get length() {
    return fakeStore.size;
  },
} as Storage;

import { getConfig, updateConfig } from "../src/storage/config.ts";
import { ValidationError } from "../src/storage/errors.ts";
import type { Config } from "../src/storage/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const defaults = await getConfig();
  console.log("Defaults (nothing saved yet):", defaults);
  assert(defaults.version === 1, "default version should be 1");
  assert(defaults.name === "", "default name should be empty");
  assert(defaults.theme === "vibrant", "default theme should be vibrant");

  const afterName = await updateConfig({ name: "Alex" });
  console.log("After setting name:", afterName);
  assert(afterName.name === "Alex", "name should update");
  assert(afterName.theme === "vibrant", "theme should be untouched");

  const afterTheme = await updateConfig({ theme: "dark" });
  console.log("After setting theme:", afterTheme);
  assert(afterTheme.name === "Alex", "a theme-only patch shouldn't drop the name");
  assert(afterTheme.theme === "dark", "theme should update");

  // Simulate a page reload: read again with no in-memory state carried
  // over, straight from the (fake) localStorage.
  const reread = await getConfig();
  console.log("Re-read after simulated reload:", reread);
  assert(reread.name === "Alex", "name should survive a reload");
  assert(reread.theme === "dark", "theme should survive a reload");

  let rejected = false;
  try {
    await updateConfig({ theme: "neon" as Config["theme"] });
  } catch (err) {
    rejected = err instanceof ValidationError;
  }
  assert(rejected, "an invalid theme should be rejected with a ValidationError");

  console.log("Config store verification passed.");
}

main();
