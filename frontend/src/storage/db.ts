// Low-level wrapper around sql.js: loading the WASM engine and holding the
// single live Database instance every other storage function reads and
// writes through. This module doesn't know anything about threads,
// participants, or messages — that's index.ts's job (the public
// storage-layer interface). This module's only concern is "get me a
// working sql.js Database object".

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { SCHEMA_SQL } from "./schema";
import { ImportError, StorageError } from "./errors";
import { loadSnapshot, saveSnapshot } from "./idb";
import { enqueueWrite } from "./writeQueue";

// Holds the one Database instance for the app's lifetime, once init() has
// run successfully. Undefined before that (or if init() failed).
let db: Database | undefined;

// The sql.js *engine* itself (as opposed to `db`, one particular database
// opened with it). initDb() originally only needed this as a local
// variable — load it, use it once to build the initial Database, done.
// importBytes() below needs it again later, to build a *second* Database
// from uploaded bytes, so it has to be kept around at module scope too.
let SQL: SqlJsStatic | undefined;

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
  SQL = await initSqlJs({ locateFile });

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

// Every table our schema creates. importBytes() below checks the uploaded
// database has all of them before accepting it — not a full column-by-
// column schema check, just enough to reject "this isn't a TalkCrates
// backup" (some unrelated SQLite file, or a zip entry that happens to
// parse but isn't ours) up front, with a clear error, instead of letting
// it in and having the UI fail confusingly the first time it queries a
// table that was never there.
const EXPECTED_TABLES = ["threads", "participants", "messages"];

function hasExpectedTables(database: Database): boolean {
  // sql.js's exec() returns one QueryExecResult per statement, but only
  // for statements that produced rows — a query matching zero tables
  // comes back as `[]` rather than a result with empty `values`, hence
  // the `?? []` fallback below.
  const result = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  const tableNames = new Set(result[0]?.values.map((row) => row[0]) ?? []);
  return EXPECTED_TABLES.every((name) => tableNames.has(name));
}

// Serializes the live database to raw SQLite file bytes. This is one half
// of the export/import round trip — the other half, bundling these bytes
// into a zip alongside config.json, happens one layer up (see CLAUDE.md ->
// "Storage & Data Format"), not here. sql.js's own .export() is actually
// synchronous, but this function stays `async` anyway to match the
// storage layer's async-first contract (see CLAUDE.md) — callers await it
// like everything else, so nothing here has to change if the underlying
// engine ever moves to a Worker.
export async function exportBytes(): Promise<Uint8Array> {
  return getDb().export();
}

// Replaces the live database with the one encoded in `bytes` — an
// uploaded backup, already unzipped one layer up by the time it reaches
// here. Validates first (real SQLite file, has our tables) so a bad
// upload fails loudly with ImportError rather than silently corrupting
// the current session.
//
// Runs through enqueueWrite() like every mutating call in queries.ts,
// even though this isn't row-level CRUD: it still has to be serialized
// against them, otherwise a write already in flight from just before the
// import (e.g. a slow addMessage()) could finish afterward and persist
// its change against a database that's already been swapped out from
// under it.
export async function importBytes(bytes: Uint8Array): Promise<void> {
  if (!SQL) {
    throw new StorageError("Storage not initialized — call init() first.");
  }
  // Captured into a local so the closure below has a type TypeScript can
  // still prove is defined — `SQL` itself is a `let`, so TS can't assume
  // it's still non-undefined by the time an *inner* async function
  // actually runs, even right after this check.
  const sqlEngine = SQL;

  return enqueueWrite(async () => {
    // sql.js's Database constructor doesn't actually validate `bytes` —
    // garbage bytes construct "successfully" and only fail once you try
    // to run a query against them. So both the construction *and* the
    // table-check query below have to be inside this one try/catch;
    // whichever step first discovers `bytes` isn't real, that's where the
    // failure surfaces.
    let candidate: Database;
    try {
      candidate = new sqlEngine.Database(bytes);
      if (!hasExpectedTables(candidate)) {
        candidate.close();
        throw new ImportError(
          "Uploaded file doesn't look like a TalkCrates backup (missing expected tables).",
        );
      }
    } catch (err) {
      if (err instanceof ImportError) throw err;
      throw new ImportError(
        `Uploaded file isn't a valid SQLite database: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Same reasoning as initDb() — foreign-key enforcement is a per-
    // connection setting, not something carried in the database bytes
    // themselves, so it has to be turned on again for this new connection.
    candidate.run("PRAGMA foreign_keys = ON;");

    db?.close();
    db = candidate;

    await saveSnapshot(db.export());
  });
}
