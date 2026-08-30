// The actual CRUD functions from the storage-layer interface (see
// CLAUDE.md → "Storage-layer interface"). Everything here talks to the
// database only through db.ts's getDb() — this file doesn't know or care
// how sql.js was loaded, just that a live Database is available.

import type { BindParams, Database, ParamsObject } from "sql.js";
import { getDb } from "./db";
import { NotFoundError, StorageError, ValidationError } from "./errors";
import type { Message, Participant, Thread, ThreadDetail } from "./types";
import { saveSnapshot } from "./idb";
import { enqueueWrite } from "./writeQueue";

// ---- small internal helpers -----------------------------------------
//
// sql.js's raw API is lower-level than what we want to repeat in every
// function below: prepare a statement, bind params, step through rows,
// read each row as a plain object keyed by column name, then free the
// statement. queryAll() wraps that loop once; every SELECT below is just
// "run this SQL, turn each row into a Thread/Participant/Message".

function queryAll<T>(
  database: Database,
  sql: string,
  params: BindParams,
  mapRow: (row: ParamsObject) => T,
): T[] {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(mapRow(stmt.getAsObject()));
  }
  stmt.free();
  return rows;
}

// After an INSERT, sql.js doesn't hand back the new row's id directly —
// you ask SQLite for it separately via this built-in function, which
// reports the rowid of the most recent successful insert on this
// connection.
function lastInsertRowId(database: Database): number {
  const result = database.exec("SELECT last_insert_rowid() AS id");
  return result[0].values[0][0] as number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// The M3b half of the write-through cache: serialize the live sql.js
// database to bytes and save those bytes to IndexedDB. Every mutating
// function below calls this once its own INSERT/UPDATE statements are
// done, so a write is only considered complete once it's durable in
// IndexedDB too — not just applied to the in-memory database.
async function persist(database: Database): Promise<void> {
  await saveSnapshot(database.export());
}

// Row -> our camelCase types. The DB gives back snake_case columns
// (row.created_at); these are the one place that translation happens.
function rowToThread(row: ParamsObject): Thread {
  return {
    id: row.id as number,
    title: row.title as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToParticipant(row: ParamsObject): Participant {
  return {
    id: row.id as number,
    threadId: row.thread_id as number,
    slot: row.slot as 1 | 2,
    role: row.role as string,
  };
}

function rowToMessage(row: ParamsObject): Message {
  return {
    id: row.id as number,
    threadId: row.thread_id as number,
    participantId: row.participant_id as number,
    content: row.content as string,
    createdAt: row.created_at as number,
  };
}

// ---- public storage-layer functions -----------------------------------

// Sidebar list: every thread, most recently active first. Deliberately
// lightweight — no participants or messages, just enough to render the
// thread list.
export async function getThreads(): Promise<Thread[]> {
  const database = getDb();
  return queryAll(
    database,
    "SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC",
    [],
    rowToThread,
  );
}

// Full detail for opening one thread: the thread itself, both its
// participants (ordered by slot, so [0] is always slot 1), and every
// message in it, oldest first.
export async function getThread(threadId: number): Promise<ThreadDetail> {
  const database = getDb();

  const threads = queryAll(
    database,
    "SELECT id, title, created_at, updated_at FROM threads WHERE id = ?",
    [threadId],
    rowToThread,
  );
  const thread = threads[0];
  if (!thread) {
    throw new NotFoundError(`Thread ${threadId} not found`);
  }

  const participants = queryAll(
    database,
    "SELECT id, thread_id, slot, role FROM participants WHERE thread_id = ? ORDER BY slot",
    [threadId],
    rowToParticipant,
  );
  // The schema guarantees exactly one participant per slot (1 and 2) via
  // UNIQUE (thread_id, slot) + CHECK (slot IN (1,2)), so this should be
  // impossible in practice. It's checked anyway rather than trusting that
  // guarantee silently — if it ever fails, that's a real bug worth a loud
  // error, not a UI crash from participants[1] being undefined.
  if (participants.length !== 2) {
    throw new StorageError(
      `Thread ${threadId} has ${participants.length} participants, expected 2`,
    );
  }

  const messages = queryAll(
    database,
    "SELECT id, thread_id, participant_id, content, created_at FROM messages WHERE thread_id = ? ORDER BY id",
    [threadId],
    rowToMessage,
  );

  return {
    ...thread,
    participants: [participants[0]!, participants[1]!],
    messages,
  };
}

// Creates a thread and both its participants together — a thread can never
// exist with fewer than 2 participants, so there's no separate
// "addParticipant" call; this is the only way a thread comes into being.
export async function createThread(
  title: string,
  participant1Role: string,
  participant2Role: string,
): Promise<ThreadDetail> {
  // The whole body runs inside enqueueWrite() so this call's mutation +
  // persist can't interleave with any other mutating call's — see
  // writeQueue.ts for why that matters.
  return enqueueWrite(async () => {
    const database = getDb();
    const now = nowSeconds();

    database.run(
      "INSERT INTO threads (title, created_at, updated_at) VALUES (?, ?, ?)",
      [title, now, now],
    );
    const threadId = lastInsertRowId(database);

    database.run(
      "INSERT INTO participants (thread_id, slot, role) VALUES (?, 1, ?)",
      [threadId, participant1Role],
    );
    const participant1Id = lastInsertRowId(database);

    database.run(
      "INSERT INTO participants (thread_id, slot, role) VALUES (?, 2, ?)",
      [threadId, participant2Role],
    );
    const participant2Id = lastInsertRowId(database);

    await persist(database);

    return {
      id: threadId,
      title,
      createdAt: now,
      updatedAt: now,
      participants: [
        { id: participant1Id, threadId, slot: 1, role: participant1Role },
        { id: participant2Id, threadId, slot: 2, role: participant2Role },
      ],
      messages: [],
    };
  });
}

// Renames a thread. Deliberately does not touch updated_at — that column
// tracks message activity (see addMessage), not metadata edits, so
// renaming a thread shouldn't reorder the sidebar the way sending a
// message does.
export async function renameThread(
  threadId: number,
  title: string,
): Promise<Thread> {
  return enqueueWrite(async () => {
    const database = getDb();

    const threads = queryAll(
      database,
      "SELECT id, title, created_at, updated_at FROM threads WHERE id = ?",
      [threadId],
      rowToThread,
    );
    const thread = threads[0];
    if (!thread) {
      throw new NotFoundError(`Thread ${threadId} not found`);
    }

    database.run("UPDATE threads SET title = ? WHERE id = ?", [
      title,
      threadId,
    ]);

    await persist(database);

    return { ...thread, title };
  });
}

// Deletes a thread and, via the schema's ON DELETE CASCADE (see schema.ts
// and db.ts's `PRAGMA foreign_keys = ON`), everything that references it:
// both participants and every message in the thread. Nothing else in this
// file has to delete those rows itself.
export async function deleteThread(threadId: number): Promise<void> {
  return enqueueWrite(async () => {
    const database = getDb();

    const threads = queryAll(
      database,
      "SELECT id FROM threads WHERE id = ?",
      [threadId],
      (row) => row.id as number,
    );
    if (threads.length === 0) {
      throw new NotFoundError(`Thread ${threadId} not found`);
    }

    database.run("DELETE FROM threads WHERE id = ?", [threadId]);

    await persist(database);
  });
}

// Adds one message and bumps the thread's updatedAt (so it jumps to the
// top of the sidebar's most-recently-active ordering). Validates that
// participantId actually belongs to threadId first — without this check, a
// caller bug (e.g. a stale participant id left over from a different
// thread) would silently attribute a message to the wrong conversation.
export async function addMessage(
  threadId: number,
  participantId: number,
  content: string,
): Promise<Message> {
  return enqueueWrite(async () => {
    const database = getDb();

    const participants = queryAll(
      database,
      "SELECT id, thread_id, slot, role FROM participants WHERE id = ?",
      [participantId],
      rowToParticipant,
    );
    const participant = participants[0];
    if (!participant || participant.threadId !== threadId) {
      throw new ValidationError(
        `Participant ${participantId} does not belong to thread ${threadId}`,
      );
    }

    const now = nowSeconds();
    database.run(
      "INSERT INTO messages (thread_id, participant_id, content, created_at) VALUES (?, ?, ?, ?)",
      [threadId, participantId, content, now],
    );
    const messageId = lastInsertRowId(database);

    database.run("UPDATE threads SET updated_at = ? WHERE id = ?", [
      now,
      threadId,
    ]);

    await persist(database);

    return {
      id: messageId,
      threadId,
      participantId,
      content,
      createdAt: now,
    };
  });
}
