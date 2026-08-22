// Shared shapes for everything the storage layer hands back to the rest of
// the app. These mirror the SQLite schema (see schema.ts) but use
// camelCase field names — the storage layer is where we translate between
// the DB's snake_case columns and the JS/TS convention the UI code expects.

export interface Thread {
  id: number;
  title: string;
  createdAt: number; // unix epoch seconds
  updatedAt: number; // unix epoch seconds
}

export interface Participant {
  id: number;
  threadId: number;
  slot: 1 | 2; // which "seat" this participant occupies in the thread — see schema.ts for what slot means
  role: string; // free text, e.g. "Questioner", "Rational Alex", or anything custom-typed
}

export interface Message {
  id: number;
  threadId: number;
  participantId: number;
  content: string;
  createdAt: number; // unix epoch seconds
}

// The full detail needed to render a single open thread: its own fields,
// both participants (always exactly 2 — hence the tuple type instead of
// Participant[]), and every message in it.
export interface ThreadDetail extends Thread {
  participants: [Participant, Participant];
  messages: Message[];
}
