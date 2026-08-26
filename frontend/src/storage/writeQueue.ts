// Serializes the storage layer's mutating operations (createThread,
// addMessage, ...) so they run one at a time, in the order they were
// called — including each one's IndexedDB save, not just its database
// mutation. This is the "internal queue" decided in CLAUDE.md under
// "IndexedDB write-through cache."
//
// Why this matters: mutating sql.js (INSERT/UPDATE) is synchronous, but
// persisting afterward (export() -> saveSnapshot()) is not — it's real
// IndexedDB, which takes an unpredictable amount of time to finish. If two
// mutating calls ran independently, their saves could finish out of
// order: an older call's slower save could complete *after* a newer
// call's faster one, leaving IndexedDB holding stale data even though the
// newer write happened more recently. Chaining every mutating call onto
// the same promise closes that gap — the next call's operation can't even
// start running until the previous call's entire operation (mutation +
// persist) has settled.

let tail: Promise<unknown> = Promise.resolve();

// Runs `operation` only after every previously-enqueued operation has
// fully settled (succeeded or failed), and returns a promise for this
// specific operation's own result (or its own error, independently of
// whether earlier operations succeeded).
export function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation);
  // The queue's own chain must never become a rejected promise — if it
  // did, every future `.then()` on it would skip straight past without
  // running, permanently wedging the queue after one failure. Swallowing
  // the error here only affects this internal bookkeeping; the actual
  // caller of this write still sees the real failure through `result`.
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
