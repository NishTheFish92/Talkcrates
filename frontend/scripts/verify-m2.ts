// Scratch verification for M2 ("Read/write CRUD"). Same idea as
// verify-m1.ts: a throwaway script, not part of the app, run directly in
// Node to prove the real storage functions work end-to-end before any UI
// exists to click through.
//
// Run with: npx tsx scripts/verify-m2.ts
//
// Unlike verify-m1.ts (which drove sql.js directly), this goes through the
// actual production code path: db.ts's initDb() and the CRUD functions in
// queries.ts. The only Node-specific bit is telling initDb() where to find
// the .wasm file on disk, since there's no dev server here to serve it
// from a URL.

import path from "node:path";
import { initDb } from "../src/storage/db.ts";
import {
  addMessage,
  createThread,
  getThread,
  getThreads,
} from "../src/storage/queries.ts";
import { NotFoundError, ValidationError } from "../src/storage/errors.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  await initDb((file) =>
    path.join(import.meta.dirname, "../node_modules/sql.js/dist", file),
  );

  // createThread: should create the thread AND both participants at once.
  const thread = await createThread("Should I take the job?", "Me", "Rational Me");
  assert(thread.title === "Should I take the job?", "thread title round-trips");
  assert(thread.participants.length === 2, "createThread makes exactly 2 participants");
  assert(thread.participants[0].slot === 1, "first participant is slot 1");
  assert(thread.participants[1].slot === 2, "second participant is slot 2");
  assert(thread.messages.length === 0, "new thread has no messages yet");
  console.log("createThread OK:", thread);

  // getThreads: sidebar list should include what we just made.
  const threads = await getThreads();
  assert(threads.length === 1, "getThreads sees the one thread we made");
  assert(threads[0].id === thread.id, "getThreads returns matching id");
  console.log("getThreads OK:", threads);

  // addMessage: from each participant, and confirm updatedAt actually
  // moves forward (or at least doesn't go backwards) on the thread.
  const [p1, p2] = thread.participants;
  const msg1 = await addMessage(thread.id, p1.id, "Should I take the new job?");
  const msg2 = await addMessage(thread.id, p2.id, "What's actually holding you back?");
  assert(msg1.participantId === p1.id, "message 1 attributed to participant 1");
  assert(msg2.participantId === p2.id, "message 2 attributed to participant 2");
  console.log("addMessage OK:", msg1, msg2);

  // addMessage validation: a participant id from nowhere (or the wrong
  // thread) must be rejected, not silently accepted.
  let rejected = false;
  try {
    await addMessage(thread.id, 999999, "this participant doesn't exist");
  } catch (err) {
    rejected = err instanceof ValidationError;
  }
  assert(rejected, "addMessage rejects a participantId that isn't in this thread");
  console.log("addMessage correctly rejected a bad participantId.");

  // getThread: full detail, messages in order, thread's updatedAt moved.
  const detail = await getThread(thread.id);
  assert(detail.messages.length === 2, "getThread returns both messages");
  assert(detail.messages[0].id === msg1.id, "messages come back oldest-first");
  assert(detail.updatedAt >= detail.createdAt, "updatedAt moved when messages were added");
  console.log("getThread OK:", detail);

  // getThread validation: a thread id that doesn't exist should throw
  // NotFoundError, not return something half-empty.
  let notFound = false;
  try {
    await getThread(999999);
  } catch (err) {
    notFound = err instanceof NotFoundError;
  }
  assert(notFound, "getThread throws NotFoundError for a missing thread");
  console.log("getThread correctly threw NotFoundError for a missing id.");

  console.log("M2 verification passed.");
}

main();
