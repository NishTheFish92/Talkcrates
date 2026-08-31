// The two DOM-only mechanics export/import need: handing the user a file
// to save, and reading one they picked back into bytes. Kept separate from
// zip.ts on purpose — zip.ts stays pure Uint8Array-in/out so it can run
// from a plain Node script (see scripts/verify-backup-zip.ts); Blob,
// URL.createObjectURL, and File all require a real browser.

// Triggers a "Save As" for `bytes` with no server round trip — the
// standard trick is to point a temporary, invisible link at an object URL
// for the data and click it programmatically. The link never gets
// attached to the page; creating it is enough for `.click()` to work.
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  // Blob only accepts a Uint8Array whose buffer is a plain ArrayBuffer,
  // not the wider ArrayBuffer | SharedArrayBuffer that TypeScript's own
  // `Uint8Array` type allows in general — copying through the constructor
  // guarantees a plain one, matching what both callers (sql.js's export(),
  // zip.js's close()) already hand back in practice anyway.
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Object URLs aren't garbage-collected on their own (they'd otherwise
  // keep the blob alive in memory for the page's whole lifetime) — this
  // releases it now that the download has been handed off.
  URL.revokeObjectURL(url);
}

// Reads a file the user picked (from a file input's FileList) into the
// raw bytes zip.js's parseBackupZip() expects.
export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
