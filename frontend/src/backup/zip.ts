// Bundles the storage layer's raw bytes into the actual zip file the user
// downloads/uploads — the "one layer up" packaging CLAUDE.md's "Storage &
// Data Format" describes. This module knows about zip.js and the two-file
// layout (talkcrates.sqlite + config.json); it doesn't know anything about
// sql.js or IndexedDB — it only ever touches the plain Uint8Array/Config
// values that storage/'s exportBytes()/importBytes()/getConfig() already
// deal in.
//
// Currently unencrypted (see CLAUDE.md -> "Deferred" -> zip encryption):
// no password is passed to either ZipWriter or ZipReader below. Re-adding
// it later is a `password` option on these same calls, not a different
// library or a rewrite of this module's shape.

import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  TextReader,
  TextWriter,
} from "@zip.js/zip.js";
import type { Config } from "../storage";
import { ImportError, VALID_THEMES } from "../storage";

const SQLITE_ENTRY_NAME = "talkcrates.sqlite";
const CONFIG_ENTRY_NAME = "config.json";

// Bundles the SQLite bytes and the config object into one zip file's
// bytes, ready to hand to the browser as a download.
export async function buildBackupZip(
  sqliteBytes: Uint8Array,
  config: Config,
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  await zipWriter.add(SQLITE_ENTRY_NAME, new Uint8ArrayReader(sqliteBytes));
  await zipWriter.add(
    CONFIG_ENTRY_NAME,
    new TextReader(JSON.stringify(config)),
  );
  return zipWriter.close();
}

// What comes back out of an uploaded zip: the raw SQLite bytes (still
// unvalidated at this point — storage.importBytes() is what actually
// checks they're a real TalkCrates database) plus the parsed config.
export interface ParsedBackup {
  sqliteBytes: Uint8Array;
  config: Config;
}

// The reverse of buildBackupZip(): pulls both entries back out of an
// uploaded zip's bytes. Checked here: the zip actually opens, and both
// entries exist with parseable/valid-shaped content — without that much,
// there's nothing to even hand to storage.importBytes() next. NOT checked
// here: whether the SQLite bytes are actually a TalkCrates database — that
// deeper check already lives in storage.importBytes() and there's no
// reason to duplicate it.
export async function parseBackupZip(
  zipBytes: Uint8Array,
): Promise<ParsedBackup> {
  const zipReader = new ZipReader(new Uint8ArrayReader(zipBytes));

  let entries;
  try {
    entries = await zipReader.getEntries();
  } catch (err) {
    throw new ImportError(
      `Uploaded file isn't a valid zip: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const sqliteEntry = entries.find((e) => e.filename === SQLITE_ENTRY_NAME);
  const configEntry = entries.find((e) => e.filename === CONFIG_ENTRY_NAME);
  // `directory` narrows Entry (a DirectoryEntry | FileEntry union) down to
  // FileEntry, which is the half that actually has getData() — a
  // directory entry named e.g. "talkcrates.sqlite/" is a malformed zip we
  // want to reject anyway, so folding that case into "missing" is fine.
  if (!sqliteEntry || sqliteEntry.directory) {
    throw new ImportError(
      `Zip is missing "${SQLITE_ENTRY_NAME}" — this doesn't look like a TalkCrates backup.`,
    );
  }
  if (!configEntry || configEntry.directory) {
    throw new ImportError(
      `Zip is missing "${CONFIG_ENTRY_NAME}" — this doesn't look like a TalkCrates backup.`,
    );
  }

  const sqliteBytes = await sqliteEntry.getData(new Uint8ArrayWriter());
  const configText = await configEntry.getData(new TextWriter());
  await zipReader.close();

  return { sqliteBytes, config: parseConfigJson(configText) };
}

// config.json's contents are user-provided (well, this-app-provided, but
// arriving over an upload, not a compile-time-checked call) — parsed and
// shape-checked the same way importBytes() shape-checks the uploaded
// SQLite bytes, rather than trusted as-is.
function parseConfigJson(text: string): Config {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ImportError(
      `config.json in the zip isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ImportError("config.json in the zip isn't a JSON object.");
  }
  const { version, name, theme } = parsed as Record<string, unknown>;
  if (typeof version !== "number") {
    throw new ImportError("config.json in the zip is missing a numeric \"version\".");
  }
  if (typeof name !== "string") {
    throw new ImportError("config.json in the zip is missing a \"name\" string.");
  }
  if (typeof theme !== "string" || !VALID_THEMES.includes(theme as Config["theme"])) {
    throw new ImportError(
      `config.json in the zip has an invalid "theme" — expected one of ${VALID_THEMES.join(", ")}.`,
    );
  }

  return { version, name, theme: theme as Config["theme"] };
}
