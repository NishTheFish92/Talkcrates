// Scratch verification for the storage-layer half of M9/M10 —
// exportBytes()/importBytes() in db.ts. Same idea as the earlier
// verify-*.ts scripts: throwaway, not part of the app, run directly with
// Node (`npx tsx scripts/verify-export-import-bytes.ts`).
//
// Needs fake-indexeddb because importBytes() persists through the same
// real saveSnapshot() path as every other mutating call, and Node has no
// IndexedDB of its own.

import "fake-indexeddb/auto";
import path from "node:path";
import initSqlJs from "sql.js";
import { exportBytes, importBytes, initDb } from "../src/storage/db.ts";
import { createThread, getThread, getThreads } from "../src/storage/queries.ts";
import { ImportError } from "../src/storage/errors.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const wasmDir = path.join(import.meta.dirname, "../node_modules/sql.js/dist");
const wasmPath = (file: string) => path.join(wasmDir, file);

async function main() {
  await initDb(wasmPath);

  const thread = await createThread("Should I move cities?", "Me", "Rational Me");
  const [p1] = thread.participants;
  await createThread("A second thread", "Me", "Rational Me");

  // exportBytes(): should hand back real bytes, not an empty/placeholder
  // array — sql.js's own serialized format always starts with SQLite's
  // fixed 16-byte magic header string.
  const bytes = await exportBytes();
  assert(bytes instanceof Uint8Array, "exportBytes returns a Uint8Array");
  assert(bytes.length > 100, "exported bytes look like a real database, not empty");
  const header = Buffer.from(bytes.slice(0, 16)).toString("utf8");
  assert(header === "SQLite format 3\0", "exported bytes carry the SQLite file header");
  console.log("exportBytes OK —", bytes.length, "bytes.");

  // importBytes() validation: garbage that isn't a SQLite file at all.
  let rejectedGarbage = false;
  try {
    await importBytes(new Uint8Array([1, 2, 3, 4, 5]));
  } catch (err) {
    rejectedGarbage = err instanceof ImportError;
  }
  assert(rejectedGarbage, "importBytes throws ImportError on non-SQLite bytes");
  console.log("importBytes correctly rejected garbage bytes.");

  // importBytes() validation: a real SQLite file, just not one of ours
  // (no threads/participants/messages tables) — proves the table check
  // does something beyond "did sql.js parse it".
  const SQL = await initSqlJs({ locateFile: wasmPath });
  const emptyDb = new SQL.Database();
  emptyDb.run("CREATE TABLE unrelated (id INTEGER PRIMARY KEY);");
  const unrelatedBytes = emptyDb.export();
  emptyDb.close();

  let rejectedWrongShape = false;
  try {
    await importBytes(unrelatedBytes);
  } catch (err) {
    rejectedWrongShape = err instanceof ImportError;
  }
  assert(rejectedWrongShape, "importBytes throws ImportError on a non-TalkCrates SQLite file");
  console.log("importBytes correctly rejected a valid-but-wrong-shape SQLite file.");

  // A rejected import must not have touched the live database — both
  // original threads should still be exactly as they were.
  const stillThere = await getThreads();
  assert(stillThere.length === 2, "rejected imports leave the current database untouched");
  console.log("Rejected imports left the live database untouched.");

  // The real round trip: export the current (2-thread) database, wipe down
  // to a completely fresh one, import the exported bytes back in, and
  // confirm both original threads (and their message) come back. Deleting
  // fake-indexeddb's backing database directly (rather than just calling
  // initDb() again) is what actually simulates "a brand new browser" —
  // otherwise initDb() would just reload the same 2-thread snapshot idb.ts
  // already saved during createThread() above, and this wouldn't be
  // testing an import into an empty session at all.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("talkcrates");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  await initDb(wasmPath); // fresh, empty database — simulates a brand new session
  const beforeImport = await getThreads();
  assert(beforeImport.length === 0, "fresh session starts empty");

  await importBytes(bytes);
  const afterImport = await getThreads();
  assert(afterImport.length === 2, "both threads came back after import");
  const restored = await getThread(thread.id);
  assert(restored.title === "Should I move cities?", "restored thread has the right title");
  assert(restored.participants[0].id === p1.id, "restored participant ids are preserved");
  console.log("Round trip OK — export then import into a fresh session restored both threads.");

  // Simulate a page reload to prove the imported database is actually
  // durable in IndexedDB, not just true of the in-memory database this
  // process happens to be holding right after the import call returns.
  await initDb(wasmPath);
  const afterReload = await getThreads();
  assert(afterReload.length === 2, "imported data survived a simulated reload");
  console.log("Imported data survived a simulated reload.");

  console.log("exportBytes/importBytes verification passed.");
}

main();
