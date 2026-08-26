// Thin wrapper around the browser's IndexedDB API, used for exactly one
// job: persisting the entire serialized SQLite database as a single blob
// of bytes, and reading that blob back on startup.
//
// IndexedDB's native API predates Promises — it hands back a `request`
// object and reports success/failure via `.onsuccess`/`.onerror`
// callbacks, rather than returning something `await`-able. Every function
// below wraps that in a `new Promise` that resolves/rejects from the
// relevant event, bridging IndexedDB's callback style into a Promise the
// rest of the storage layer can just `await`. This is the only place that
// bridge has to happen; everything above this file (db.ts and up) only
// ever sees plain async functions.
//
// We don't use IndexedDB for what it's normally good at (many records,
// indexes, range queries) — sql.js already gives us a full relational
// database in memory. IndexedDB here is just "a place in the browser that
// can hold binary data across page reloads," which is all a write-through
// cache needs.

const DB_NAME = "talkcrates";
const DB_VERSION = 1;
const STORE_NAME = "sqlite";
const SNAPSHOT_KEY = "snapshot";

// Opens (or creates) our IndexedDB database, creating the object store the
// first time it's ever opened. `onupgradeneeded` only fires when the
// database doesn't exist yet or DB_VERSION goes up — it's IndexedDB's own
// setup step, not to be confused with the SQLite schema in schema.ts.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Persists the given bytes as the one saved snapshot, overwriting whatever
// was saved before. There's only ever one row in this store — we always
// write it under the same fixed key, since this app has exactly one
// database to save, not many.
export async function saveSnapshot(bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(bytes, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Reads back the saved snapshot, or undefined if nothing has been saved
// yet — the normal case for a first-time user with no prior data.
export async function loadSnapshot(): Promise<Uint8Array | undefined> {
  const db = await openDb();
  const bytes = await new Promise<Uint8Array | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve(request.result as Uint8Array | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return bytes;
}
