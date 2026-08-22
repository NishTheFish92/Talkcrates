// The SQLite schema, as decided in CLAUDE.md. This raw SQL gets run once,
// against a fresh in-memory sql.js database, whenever there's no existing
// database cached in IndexedDB yet (i.e. a brand new user/browser).

export const SCHEMA_SQL = `
CREATE TABLE threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE participants (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    slot      INTEGER NOT NULL CHECK (slot IN (1, 2)),
    role      TEXT NOT NULL,
    UNIQUE (thread_id, slot)
);

CREATE TABLE messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id      INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    content        TEXT NOT NULL,
    created_at     INTEGER NOT NULL
);

CREATE INDEX idx_messages_thread     ON messages(thread_id, id);
CREATE INDEX idx_participants_thread ON participants(thread_id);
`;
