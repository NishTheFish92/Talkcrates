// Typed error hierarchy for the storage layer (decided in CLAUDE.md), so
// calling code can catch/branch on `instanceof NotFoundError` etc. instead
// of string-matching an error message.
//
// StorageError is the base class and is also used directly for the
// generic cases (I/O failures, serialization problems, calling a storage
// function before init() has run). The three subclasses below cover more
// specific, expected situations where calling code is likely to want to
// react differently.

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

// Thrown when a lookup (thread, participant, message) doesn't exist —
// e.g. getThread() called with an id that isn't in the database.
export class NotFoundError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// Thrown when the caller's input itself is invalid — e.g. addMessage()
// called with a participantId that doesn't belong to the given threadId.
export class ValidationError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Thrown specifically by importBytes() when the uploaded bytes aren't a
// valid SQLite file, or are missing the tables this app expects.
export class ImportError extends StorageError {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}
