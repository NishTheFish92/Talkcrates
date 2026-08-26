// Scratch verification for M3b ("write queue + auto-save"). Same idea as
// the earlier verify-*.ts scripts: throwaway, not part of the app, run
// directly with Node (`npx tsx scripts/verify-m3b.ts`).
//
// Two separate things to prove:
//
//  1. writeQueue.ts's enqueueWrite() actually serializes — operations run
//     in the order they were *enqueued*, not the order they'd otherwise
//     finish in. Tested directly and deterministically, without touching
//     sql.js/IndexedDB at all, by making an earlier operation
//     artificially slower than a later one and recording the order they
//     actually complete in.
//
//  2. createThread()/addMessage() now persist automatically. Unlike
//     verify-m3.ts, this script never calls saveSnapshot() by hand.
//     Several mutating calls are fired without waiting for each one
//     individually, then initDb() is called again (simulating a page
//     reload) to prove everything survived in one piece.

import "fake-indexeddb/auto";
import path from "node:path";
import { enqueueWrite } from "../src/storage/writeQueue.ts";
import { initDb } from "../src/storage/db.ts";
import { addMessage, createThread, getThread } from "../src/storage/queries.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyQueueOrdering() {
  const order: number[] = [];

  // Enqueue three operations back-to-back without awaiting each one. The
  // first is deliberately the slowest and the last is instant — if
  // enqueueWrite() let them run independently, the instant one would very
  // plausibly finish first. If it's actually serializing them, the
  // recorded order has to match enqueue order regardless of how long each
  // one takes.
  const p1 = enqueueWrite(async () => {
    await delay(30);
    order.push(1);
  });
  const p2 = enqueueWrite(async () => {
    await delay(10);
    order.push(2);
  });
  const p3 = enqueueWrite(async () => {
    order.push(3);
  });

  await Promise.all([p1, p2, p3]);
  assert(
    order.join(",") === "1,2,3",
    `writes ran in enqueue order, got [${order.join(",")}]`,
  );
  console.log("Queue ordering OK — ran in enqueue order despite differing delays:", order);
}

const wasmPath = (file: string) =>
  path.join(import.meta.dirname, "../node_modules/sql.js/dist", file);

async function verifyAutoPersist() {
  await initDb(wasmPath);
  const thread = await createThread("Should I switch teams?", "Me", "Rational Me");
  const [p1, p2] = thread.participants;

  // Fire several writes without awaiting each one individually — no
  // manual saveSnapshot() call anywhere in this function, unlike
  // verify-m3.ts. If auto-persist and the queue are both working
  // correctly, all three should still land safely.
  await Promise.all([
    addMessage(thread.id, p1.id, "Should I switch teams?"),
    addMessage(thread.id, p2.id, "What's actually pulling you toward it?"),
    addMessage(thread.id, p1.id, "The team lead I'd get to work with."),
  ]);

  // Simulate a page reload: a fresh initDb() call, with no manual save
  // step in between. If auto-persist is wired correctly, all three
  // messages above should already be sitting in IndexedDB.
  await initDb(wasmPath);
  const restored = await getThread(thread.id);
  assert(
    restored.messages.length === 3,
    `all 3 messages survived a simulated reload, got ${restored.messages.length}`,
  );
  console.log(
    "Auto-persist OK — messages written with no manual save survived a simulated reload:",
    restored.messages,
  );
}

async function main() {
  await verifyQueueOrdering();
  await verifyAutoPersist();
  console.log("M3b verification passed.");
}

main();
