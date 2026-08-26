// Scratch verification for M3a ("IndexedDB load-on-startup"). Same idea as
// verify-m1.ts/verify-m2.ts: a throwaway script, not part of the app, run
// directly in Node to prove the real code works before any UI exists.
//
// Run with: npx tsx scripts/verify-m3.ts
//
// Node has no IndexedDB of its own — it's a browser API — so the very
// first import below pulls in `fake-indexeddb/auto`, a polyfill that
// defines a working `indexedDB` global for this script only. The app's
// real, browser-served code never touches this; it's purely so this
// Node script can exercise idb.ts and db.ts's restore-on-init path.
//
// M3a only wires up *loading* a saved snapshot on startup — nothing calls
// saveSnapshot() automatically yet (that's M3b, hooking it into
// createThread()/addMessage()). So to prove the restore path works, this
// script does the save step by hand: create data, export the db, save it,
// then re-run initDb() (simulating a fresh page load) and confirm the
// data comes back.

import "fake-indexeddb/auto";
import path from "node:path";
import { initDb, getDb } from "../src/storage/db.ts";
import { saveSnapshot, loadSnapshot } from "../src/storage/idb.ts";
import { createThread, getThreads } from "../src/storage/queries.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const wasmPath = (file: string) =>
  path.join(import.meta.dirname, "../node_modules/sql.js/dist", file);

async function main() {
  // Nothing saved yet — loadSnapshot() should say so directly.
  const nothingSaved = await loadSnapshot();
  assert(nothingSaved === undefined, "loadSnapshot returns undefined before anything is saved");

  // First "app launch": no snapshot in IndexedDB, so initDb() should fall
  // back to creating a fresh schema-only database.
  await initDb(wasmPath);
  const threadsBeforeSave = await getThreads();
  assert(threadsBeforeSave.length === 0, "fresh database starts with no threads");

  // Make some real data using the actual production code path.
  const thread = await createThread("Should I move cities?", "Me", "Rational Me");
  console.log("Created thread:", thread);

  // M3b's job (not built yet) will do this automatically after every
  // write. For now, do it by hand to prove the restore side works:
  // export the live db to bytes, save those bytes to (fake) IndexedDB.
  await saveSnapshot(getDb().export());

  // Second "app launch": simulate a page reload by calling initDb() again.
  // This time a snapshot exists, so it should restore our thread instead
  // of starting empty.
  await initDb(wasmPath);
  const threadsAfterReload = await getThreads();
  assert(threadsAfterReload.length === 1, "restored database has the saved thread");
  assert(threadsAfterReload[0].title === "Should I move cities?", "restored thread's data is intact");
  console.log("Restored threads after simulated reload:", threadsAfterReload);

  console.log("M3a verification passed.");
}

main();
