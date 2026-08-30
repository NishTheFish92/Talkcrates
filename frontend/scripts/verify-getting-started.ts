// Scratch verification for gettingStartedThread.ts — same idea as the
// other verify-*.ts scripts, run directly in Node to prove the real code
// works before relying on it from the UI.
//
// Run with: npx tsx scripts/verify-getting-started.ts

import "fake-indexeddb/auto";
import path from "node:path";
import { initDb } from "../src/storage/db.ts";
import { getThread, getThreads } from "../src/storage/queries.ts";
import { seedGettingStartedThread } from "../src/gettingStartedThread.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const wasmPath = (file: string) =>
  path.join(import.meta.dirname, "../node_modules/sql.js/dist", file);

async function main() {
  await initDb(wasmPath);

  await seedGettingStartedThread("Alex");

  const threads = await getThreads();
  assert(threads.length === 1, `expected 1 thread, got ${threads.length}`);
  assert(threads[0]!.title === "Getting started", "title should be 'Getting started'");

  const detail = await getThread(threads[0]!.id);
  assert(detail.participants[0]!.role === "Alex", "slot 1 role should be the plain name");
  assert(
    detail.participants[1]!.role === "Rational Alex",
    "slot 2 role should be 'Rational {name}'",
  );
  assert(detail.messages.length === 10, `expected 10 messages, got ${detail.messages.length}`);
  assert(
    detail.messages[0]!.participantId === detail.participants[0]!.id,
    "first message should be from slot 1 (the user themselves)",
  );
  assert(
    detail.messages[detail.messages.length - 1]!.participantId === detail.participants[0]!.id,
    "last message should also be from slot 1 (lands on 'moving on', not a plan)",
  );
  for (const m of detail.messages) {
    assert(!m.content.includes("—"), `message contains an em dash: "${m.content}"`);
  }

  console.log("All assertions passed.");
  console.log(`Thread: "${detail.title}"`);
  console.log(`Participants: "${detail.participants[0]!.role}" / "${detail.participants[1]!.role}"`);
  console.log(`Messages: ${detail.messages.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
