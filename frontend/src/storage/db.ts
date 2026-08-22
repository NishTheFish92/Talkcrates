// Low-level wrapper around sql.js: loading the WASM engine and holding the
// single live Database instance every other storage function reads and
// writes through. This module doesn't know anything about threads,
// participants, or messages — that's index.ts's job (the public
// storage-layer interface). This module's only concern is "get me a
// working sql.js Database object".

import initSqlJs, { type Database } from "sql.js";
import { SCHEMA_SQL } from "./schema";
import { StorageError } from "./errors";

// Holds the one Database instance for the app's lifetime, once init() has
// run successfully. Undefined before that (or if init() failed).
let db: Database | undefined;

// Loads the sql.js WASM engine and creates a brand-new, empty database with
// our schema already applied.
//
// Note: this always starts fresh. Restoring a previously-saved database
// from IndexedDB (so a returning user doesn't lose their data) is M3's job,
// not this one — M1 is only about proving sql.js + our schema work at all.
export async function initDb(): Promise<void> {
  const SQL = await initSqlJs({
    // sql.js ships its engine as two files: a small JS loader (bundled
    // normally, via the `sql.js` import above) and a separate .wasm binary
    // that has to be fetched at runtime. locateFile tells it where to find
    // that binary. We copied sql-wasm.wasm into public/, which Vite serves
    // as-is at the site root, so this URL resolves to it.
    locateFile: (file) => `/${file}`,
  });

  db = new SQL.Database();
  db.run(SCHEMA_SQL);
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
