// Scratch verification for M1 ("Storage core"). Not part of the app, not
// imported by anything — just a throwaway script to prove sql.js loads and
// our schema applies cleanly, run directly in Node instead of a browser.
//
// Run with: npx tsx scripts/verify-m1.ts
//
// This deliberately doesn't reuse db.ts's initDb(), because that function
// points sql.js at /sql-wasm.wasm — a URL that only resolves inside the
// Vite dev server. Here in plain Node there's no server, so we point
// locateFile at the .wasm file's actual path on disk instead.

import initSqlJs from "sql.js";
import path from "node:path";
import { SCHEMA_SQL } from "../src/storage/schema.ts";

async function main() {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(import.meta.dirname, "../node_modules/sql.js/dist", file),
  });

  const db = new SQL.Database();
  db.run(SCHEMA_SQL);

  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const tableNames = tables[0]?.values.flat() ?? [];
  console.log("Tables created:", tableNames);

  const expected = ["messages", "participants", "threads"];
  const ok = expected.every((t) => tableNames.includes(t));
  if (!ok) {
    throw new Error(`Expected tables ${expected}, got ${tableNames}`);
  }

  // Quick sanity check that the constraints from the schema are actually
  // live, not just that the tables exist: slot must be 1 or 2.
  let rejected = false;
  try {
    db.run(
      "INSERT INTO threads (id, title, created_at, updated_at) VALUES (1, 'x', 0, 0)",
    );
    db.run(
      "INSERT INTO participants (thread_id, slot, role) VALUES (1, 3, 'bad')",
    );
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("Expected CHECK (slot IN (1,2)) to reject slot=3");
  }
  console.log("CHECK constraint on participants.slot enforced correctly.");

  db.close();
  console.log("M1 verification passed.");
}

main();
