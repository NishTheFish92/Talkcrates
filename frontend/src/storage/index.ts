// Public storage-layer interface (see CLAUDE.md → "Storage-layer
// interface"). This is the only module the rest of the app (UI code) should
// import storage from — everything else in this folder (db.ts, schema.ts,
// errors.ts, config.ts) is an implementation detail reached through here.
//
// Two independent stores live behind this one module: the SQLite database
// (queries.ts, via db.ts/idb.ts — thread/participant/message data) and the
// small settings file (config.ts, via localStorage — name/theme). They're
// separate on disk (see CLAUDE.md → "Config file") and separate here too,
// just re-exported from the same place so UI code has one import to reach
// for regardless of which store it needs.

import { initDb } from "./db";

export async function init(): Promise<void> {
  await initDb();
}

export * from "./types";
export * from "./errors";
export * from "./queries";
export * from "./config";
