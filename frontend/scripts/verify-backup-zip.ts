// Scratch verification for backup/zip.ts — buildBackupZip()/
// parseBackupZip(). Same throwaway pattern as the other verify-*.ts
// scripts, run directly with Node (`npx tsx scripts/verify-backup-zip.ts`).
//
// This one doesn't touch sql.js/IndexedDB at all — buildBackupZip() and
// parseBackupZip() only deal in plain Uint8Array/Config values, so there's
// nothing here that needs the fake-indexeddb polyfill the storage-layer
// scripts use.

import { buildBackupZip, parseBackupZip } from "../src/backup/zip.ts";
import { ImportError } from "../src/storage/errors.ts";
import type { Config } from "../src/storage/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  const config: Config = { version: 1, name: "Alex", theme: "dark" };
  const sqliteBytes = new TextEncoder().encode("pretend this is a sqlite file");

  // Round trip: build a zip from known bytes/config, parse it back out,
  // confirm both entries survive byte-for-byte / value-for-value.
  const zipBytes = await buildBackupZip(sqliteBytes, config);
  assert(zipBytes instanceof Uint8Array, "buildBackupZip returns a Uint8Array");
  assert(zipBytes.length > 0, "built zip is non-empty");

  const parsed = await parseBackupZip(zipBytes);
  assert(
    Buffer.from(parsed.sqliteBytes).equals(Buffer.from(sqliteBytes)),
    "parsed sqlite bytes match what was zipped in",
  );
  assert(
    JSON.stringify(parsed.config) === JSON.stringify(config),
    "parsed config matches what was zipped in",
  );
  console.log("Round trip OK — build then parse restored both entries exactly.");

  // parseBackupZip() validation: not a zip at all.
  let rejectedNonZip = false;
  try {
    await parseBackupZip(new Uint8Array([1, 2, 3, 4, 5]));
  } catch (err) {
    rejectedNonZip = err instanceof ImportError;
  }
  assert(rejectedNonZip, "parseBackupZip throws ImportError on non-zip bytes");
  console.log("parseBackupZip correctly rejected non-zip bytes.");

  // parseBackupZip() validation: a real zip, just missing our entries
  // (e.g. some unrelated zip file the user picked by mistake).
  const { ZipWriter, Uint8ArrayWriter, TextReader } = await import(
    "@zip.js/zip.js"
  );
  const unrelatedWriter = new ZipWriter(new Uint8ArrayWriter());
  await unrelatedWriter.add("readme.txt", new TextReader("hello"));
  const unrelatedZip = await unrelatedWriter.close();

  let rejectedWrongShape = false;
  try {
    await parseBackupZip(unrelatedZip);
  } catch (err) {
    rejectedWrongShape = err instanceof ImportError;
  }
  assert(rejectedWrongShape, "parseBackupZip throws ImportError on a zip missing our entries");
  console.log("parseBackupZip correctly rejected a zip missing our entries.");

  // parseBackupZip() validation: our entries are present, but config.json
  // has a bad shape (invalid theme) — proves the config validation itself
  // actually runs, not just "is it JSON".
  const badConfigWriter = new ZipWriter(new Uint8ArrayWriter());
  const { Uint8ArrayReader } = await import("@zip.js/zip.js");
  await badConfigWriter.add(
    "talkcrates.sqlite",
    new Uint8ArrayReader(sqliteBytes),
  );
  await badConfigWriter.add(
    "config.json",
    new TextReader(JSON.stringify({ version: 1, name: "Alex", theme: "neon" })),
  );
  const badConfigZip = await badConfigWriter.close();

  let rejectedBadConfig = false;
  try {
    await parseBackupZip(badConfigZip);
  } catch (err) {
    rejectedBadConfig = err instanceof ImportError;
  }
  assert(rejectedBadConfig, "parseBackupZip throws ImportError on an invalid theme value");
  console.log("parseBackupZip correctly rejected an invalid config shape.");

  console.log("backup/zip.ts verification passed.");
}

main();
