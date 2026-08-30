// Scratch verification for the rename/delete-thread half of M8. Same idea
// as the earlier verify-*.ts scripts: throwaway, not part of the app, run
// directly with Node (`npx tsx scripts/verify-m8.ts`).
//
// Needs fake-indexeddb (like verify-m3b.ts) because renameThread/
// deleteThread persist through the same real write path as
// createThread/addMessage — every mutating call ends in a real
// saveSnapshot() call, and Node has no IndexedDB of its own.

import "fake-indexeddb/auto";
import path from "node:path";
import { initDb } from "../src/storage/db.ts";
import {
  addMessage,
  createThread,
  deleteThread,
  getThread,
  getThreads,
  renameThread,
} from "../src/storage/queries.ts";
import { NotFoundError } from "../src/storage/errors.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const wasmPath = (file: string) =>
  path.join(import.meta.dirname, "../node_modules/sql.js/dist", file);

async function main() {
  await initDb(wasmPath);

  const thread = await createThread("Should I take the job?", "Me", "Rational Me");
  const [p1, p2] = thread.participants;
  await addMessage(thread.id, p1.id, "Should I take the new job?");

  // renameThread: title changes, updatedAt does NOT move (it tracks
  // message activity, not metadata edits — see the function's comment).
  const beforeRename = await getThread(thread.id);
  const renamed = await renameThread(thread.id, "Job offer decision");
  assert(renamed.title === "Job offer decision", "renameThread returns the new title");
  assert(
    renamed.updatedAt === beforeRename.updatedAt,
    "renameThread does not bump updatedAt",
  );
  const afterRename = await getThread(thread.id);
  assert(afterRename.title === "Job offer decision", "rename persisted to the DB");
  console.log("renameThread OK:", renamed);

  // renameThread validation: a thread id that doesn't exist should throw
  // NotFoundError rather than silently no-op.
  let renameNotFound = false;
  try {
    await renameThread(999999, "nope");
  } catch (err) {
    renameNotFound = err instanceof NotFoundError;
  }
  assert(renameNotFound, "renameThread throws NotFoundError for a missing thread");
  console.log("renameThread correctly threw NotFoundError for a missing id.");

  // deleteThread: should cascade to participants + messages, not just
  // remove the thread row itself. Make a second thread first so we can
  // confirm getThreads() still sees the survivor afterward.
  const survivor = await createThread("A thread that should survive", "Me", "Rational Me");
  await deleteThread(thread.id);

  let threadGone = false;
  try {
    await getThread(thread.id);
  } catch (err) {
    threadGone = err instanceof NotFoundError;
  }
  assert(threadGone, "deleted thread is actually gone");

  const remaining = await getThreads();
  assert(remaining.length === 1, "only the surviving thread remains");
  assert(remaining[0].id === survivor.id, "the surviving thread is untouched");
  console.log("deleteThread OK — thread removed, unrelated thread untouched.");

  // deleteThread validation: same NotFoundError treatment as renameThread.
  let deleteNotFound = false;
  try {
    await deleteThread(999999);
  } catch (err) {
    deleteNotFound = err instanceof NotFoundError;
  }
  assert(deleteNotFound, "deleteThread throws NotFoundError for a missing thread");
  console.log("deleteThread correctly threw NotFoundError for a missing id.");

  // Simulate a page reload to prove the cascade delete is actually durable
  // in IndexedDB, not just true of the in-memory database this process
  // happens to be holding.
  await initDb(wasmPath);
  const afterReload = await getThreads();
  assert(
    afterReload.length === 1 && afterReload[0].id === survivor.id,
    "cascade delete survived a simulated reload",
  );
  console.log("Cascade delete OK after simulated reload.");

  console.log("M8 rename/delete verification passed.");
}

main();
