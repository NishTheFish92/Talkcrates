// Public storage-layer interface (see CLAUDE.md → "Storage-layer
// interface"). This is the only module the rest of the app (UI code) should
// import storage from — everything else in this folder (db.ts, schema.ts,
// errors.ts) is an implementation detail reached through here.
//
// M1 scope: just init(). The CRUD functions (getThreads, createThread,
// addMessage, ...) get added in M2 on top of the same getDb() this uses.

import { initDb } from "./db";

export async function init(): Promise<void> {
  await initDb();
}

export * from "./types";
export * from "./errors";
