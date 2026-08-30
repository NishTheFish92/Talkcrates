// Low-level wrapper around sql.js: loading the WASM engine and holding the
// single live Database instance every other storage function reads and
// writes through. This module doesn't know anything about threads,
// participants, or messages — that's index.ts's job (the public
// storage-layer interface). This module's only concern is "get me a
// working sql.js Database object".

import initSqlJs, { type Database } from "sql.js";
import { SCHEMA_SQL } from "./schema";
import { StorageError } from "./errors";
import { loadSnapshot } from "./idb";

// Holds the one Database instance for the app's lifetime, once init() has
// run successfully. Undefined before that (or if init() failed).
let db: Database | undefined;

// Loads the sql.js WASM engine, then either restores a previously-saved
// database from IndexedDB (a returning user) or creates a brand-new one
// with our schema applied (a first-time user, or nothing's been saved
// yet).
//
// `locateFile` tells sql.js where to find its .wasm binary (the engine
// itself ships as two files: a small JS loader, bundled normally via the
// `sql.js` import above, and a separate .wasm file fetched at runtime). It
// defaults to the app's real answer — `/sql-wasm.wasm`, which Vite serves
// as-is because we copied the file into public/ — but takes a parameter
// instead of hardcoding that, so a Node scratch script (which has no dev
// server to fetch a URL from) can point it at the file's actual path on
// disk instead. App code never needs to pass this; only scripts do.
export async function initDb(
  locateFile: (file: string) => string = (file) => `/${file}`,
): Promise<void> {
  const SQL = await initSqlJs({ locateFile });

  const saved = await loadSnapshot();
  if (saved) {
    // sql.js's Database constructor can take an existing database's bytes
    // and load them straight in, instead of starting empty — this is how
    // a returning user's data comes back.
    db = new SQL.Database(saved);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  }

  // SQLite ignores every ON DELETE CASCADE in schema.ts unless foreign key
  // enforcement is turned on for the connection — and it's off by default.
  // This isn't something the schema file itself can set: it's a per-
  // connection setting, not something stored in the database bytes, so it
  // has to be re-applied here every time a Database is opened (both the
  // fresh-schema branch above and the restored-from-snapshot one).
  // Without this, deleteThread()'s single `DELETE FROM threads` would
  // leave that thread's participants/messages behind as orphaned rows.
  db.run("PRAGMA foreign_keys = ON;");
}

// Every other storage function calls this to get the live database, rather
// than importing the `db` variable directly. Throws instead of silently
// handing back `undefined` if init() hasn't been called (or hasn't
// finished) yet — that's a bug in the calling code, not a normal runtime
// state, so it's a thrown StorageError rather than e.g. a null check.
export function getDb(): Database {
  if (!db) {
    throw new StorageError("Storage not initialized — call init() first.");
  }
  return db;
}
