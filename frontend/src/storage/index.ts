// Public storage-layer interface (see CLAUDE.md → "Storage-layer
// interface"). This is the only module the rest of the app (UI code) should
// import storage from — everything else in this folder (db.ts, schema.ts,
// errors.ts) is an implementation detail reached through here.
//
// M2 adds the CRUD functions (getThreads, getThread, createThread,
// addMessage) on top of the same getDb() init() sets up. Still no
// IndexedDB persistence (M3) and no UI (M4+) — everything here operates on
// the in-memory database only.

import { initDb } from "./db";

export async function init(): Promise<void> {
  await initDb();
}

export * from "./types";
export * from "./errors";
export * from "./queries";
