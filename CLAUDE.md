# TalkCrates

A chat-interface web app for structured self-dialogue and introspection. Instead of a one-sided diary, the user has a back-and-forth conversation with themselves by switching between two distinct voices — **Questioner** and **Answerer** — rendered as a familiar two-participant chat UI. Used for working through decisions, debating with oneself, or venting in a structured way.

## Product Concept (finalized)

**Core interaction model**
- Both sides of every conversation are self-authored by the user — there is no LLM generating messages. The app's only job is to visually separate the two participants as distinct chat bubbles (like a real 2-person conversation), so the user can mentally context-switch between roles instead of it reading as one continuous monologue.
- Roles are per-thread, not a global fixed pair (revised from the original "exactly Questioner/Answerer" decision after reviewing the wireframe, 2026-08-09). When creating a thread, each of the two participants gets a role chosen from presets or free-typed custom text — presets are a convenience only, custom text must always be available regardless of how many presets exist. Still exactly **2** participants per thread for v1 — only the role labels are flexible, not the participant count (see Deferred for group chat / N participants).
- This means `role` is a string column on the thread's participant data, not a fixed enum — keep the schema free-text from the start so this doesn't require a migration later.
- **Preset defaults (decided 2026-08-09):** Person 1 defaults to the user's own name (`{Name}` — "talk as yourself"). Person 2 defaults to `Rational {Name}`, computed at render time from the name captured during onboarding. Both are persistent, re-selectable presets in the picker (like the wireframe's `{{name}}` entry) — not one-time prefilled text that disappears once you pick something else.
- Beyond `{Name}` and `Rational {Name}` plus free-typed custom text, **no other presets are decided yet** (the wireframe's Questioner / Answerer / Devil's advocate options were Claude Design's placeholders, not a confirmed list). Exact additional presets TBD later — keep the preset list easy to extend, don't hardcode it as final.

**Conversation structure**
- Multiple named conversations/threads, sidebar-style (like ChatGPT/Claude) — not a single continuous log. Each thread is its own topic, decision, or venting session.

**Platform**
- Web application, responsive — must work well on both desktop and mobile. Native apps are out of scope for v1 (see Deferred: Capacitor mobile-app wrap).

**Audience & accounts**
- Built as a multi-user product from the start (architecture should assume multiple accounts eventually), but real auth/account system is **post-MVP**. For MVP, the password-protected zip file *is* the user's identity/data — see Data storage & privacy.

**AI/LLM involvement**
- Zero AI in v1. Pure self-chat UI over user-typed content. No AI-generated titles, summaries, or insights in the initial version.

**Data storage & privacy (MVP, decided)**
- Zip-based, user-owned persistence. No server-side database stores conversation content, and the backend never sees plaintext content.
- Working conversation data lives client-side only (e.g. browser localStorage/IndexedDB as an ephemeral in-session cache) while the app is open.
- **Export**: user downloads their data as a password-protected (encrypted) zip file whenever they want a durable copy.
- **Import**: user uploads that zip to restore everything immediately, client-side.
- This zip file effectively *is* the user's identity/data for MVP — no login/auth needed (see Audience & accounts).
- Optionally adding real server-side persistent storage later (e.g. a "let the server keep my data" mode) is a distinct future phase requiring its own dedicated security/privacy deliberation — not to be casually bolted onto this model.

## Tech Stack (decided)

- **Backend**: FastAPI (Python).
- **Frontend**: React + Vite, TypeScript.
- Decoupled SPA architecture — frontend talks to FastAPI over REST/WebSocket, no server-side templating (not exercised in v1, see below).

**Backend's job for v1 (decided, 2026-08-10):** no app-data REST endpoints — storage/export/import are all client-side. FastAPI just (1) serves the built frontend as static files with SPA fallback (`index.html` for unmatched routes), (2) exposes `/api/health` for container liveness checks, (3) reserves the `/api/*` prefix for future phases (auth, server-side storage). No CORS needed in v1 — no cross-origin calls.

## Storage & Data Format (decided, details TBD as we build)

- **The zip contains two files**: a SQLite database (`talkcrates.sqlite` — three tables: `threads`, `participants`, `messages`) and a small config file (`config.json` — see "Config file" below). Conversation data and small per-user settings are deliberately split into two files rather than one, since the config bits (name, theme) don't fit a relational schema and don't need one.
- **Client-side engine: sql.js (decided)** — SQLite compiled to WASM, in-memory, no built-in persistence — over OPFS-backed wa-sqlite, because OPFS needs a Web Worker and has rough edges on Safari/iOS, which this app must support well. All access goes through an **async-first interface** (`getThreads()`, `addMessage()`, `exportBytes()`, `importBytes()` — all return Promises) so moving to a Worker/different engine later doesn't force a rewrite across the UI.
- **IndexedDB write-through cache (decided):** every mutating call (`addMessage()`, `createThread()`, etc.) persists before resolving — mutate sql.js → `export()` → write bytes to IndexedDB, all inside one awaited chain. No debouncing/timers; writes are cheap at this app's scale and correctness matters more than write count. This is the "ephemeral in-session cache" mentioned above — not the durable copy, which is still the zip.
- **Writes are serialized via an internal queue** in the storage layer (each call chains onto the previous call's promise) so save order always matches call order, regardless of how close together calls happen — prevents a slow write from overwriting a newer one.
- **Export/import is 100% client-side — no FastAPI involvement, no network call.** Export is manual/user-triggered only (matches wireframe's always-present "Export Chats" button). The zip is built, encrypted, decrypted, and parsed entirely in-browser. Zip encryption must be real **AES-256** (e.g. `zip.js`), not legacy ZipCrypto.

### SQLite schema (decided, 2026-08-10)

```sql
CREATE TABLE threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    created_at INTEGER NOT NULL,   -- unix epoch seconds
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
```

- **`participants`** holds exactly 2 rows per thread — one per `slot` (1 or 2). `role` is free text (matches the "role is per-thread, not a fixed enum" decision above). `UNIQUE (thread_id, slot)` + `CHECK (slot IN (1,2))` makes "exactly one occupant per slot, per thread" a DB-level guarantee, not just an app-level assumption.
- **`slot`'s actual purpose**: it is *not* a fixed left/right rendering assignment, and it is *not* needed to tell the two participants apart (`participant_id`, the primary key, already does that robustly). What `slot` provides is explicit **order/position** — specifically, which participant is the *default* one: opening a thread always starts viewing it from `slot 1`'s point of view (confirmed against the wireframe's `toS7(){ this.setState({..., pov:0}) }`). Without `slot`, "which one is first" would have to be inferred from insertion order (lowest `id`), which is an implicit side effect rather than a stored fact, and could silently break if a row is ever deleted/recreated.
- **Bubble left/right rendering is computed live, client-side — not stored.** Confirmed against the wireframe logic (`const right = m.r === s.pov`): a message renders on the right if its author (`participant_id`) matches whichever participant the viewer is *currently* speaking/viewing as (`pov`, transient UI state, defaults to `slot 1` on thread open). Tapping "swap POV" flips `pov`, which reflows **every** message in the thread to the opposite side — including old ones — the same way viewing a real text thread from the other person's phone would. `messages.participant_id` itself never changes when this happens.
- **`messages.thread_id` is a deliberate denormalization** — it's derivable via `participant_id → participants.thread_id`, but storing it directly on `messages` avoids a join for the common "get all messages in thread X" query.
- **Ordering**: no separate sequence column. SQLite's `INTEGER PRIMARY KEY` (the rowid) is monotonically increasing on insert, so `ORDER BY id` on `messages` gives correct chronological order for free.
- **Timestamps** are `INTEGER` unix epoch seconds (not ISO8601 text) — smaller, sorts/compares as plain numbers, no string parsing needed.

### Config file (decided, 2026-08-28)

Small per-user settings that aren't conversation data — currently just the user's name and theme preference — don't belong in the SQLite schema (no relational shape to them, and they're read/written completely differently: one value at a time, not rows). They get their own file instead.

```json
{ "version": 1, "name": "", "theme": "vibrant" }
```

- `version` — schema-version field for this file specifically, same reasoning as keeping `participants.role` free text: cheap now, avoids a painful migration later if fields get added/renamed.
- `name` — the user's own name, captured during onboarding (see "Preset defaults" above — `{Name}` / `Rational {Name}` are computed from this at render time). Defaults to `""` until onboarding sets it (onboarding itself isn't in the build plan yet — see `../iterations.MD`).
- `theme` — one of `"vibrant" | "light" | "dark"`, matching the wireframe's theme picker (onboarding + settings screens). `"vibrant"` is the default and the only one actually styled for now; `"light"`/`"dark"` are picked up as a distinct later feature (the picker UI + actually switching tokens at runtime), not built alongside the sidebar/chat work.
- **Ephemeral in-session cache: `localStorage`, not IndexedDB.** The DB uses IndexedDB because sql.js needs to read/write it as an opaque byte blob through an async API. Config is a handful of primitives with no such requirement — `localStorage` is simpler (synchronous, no schema) and a better fit for something this small. Both are still just the *ephemeral* cache; the zip remains the only durable copy, per the storage model above.
- **Zip layout**: `config.json` sits alongside `talkcrates.sqlite` in the export zip, under the same AES-256 encryption — not a separate unencrypted file.

### Storage-layer interface (decided, 2026-08-10)

Async/Promise-based, per the async-first contract above. `snake_case` DB columns map to `camelCase` in these types — the storage layer is the translation point.

```ts
interface Thread { id: number; title: string; createdAt: number; updatedAt: number; }
interface Participant { id: number; threadId: number; slot: 1 | 2; role: string; }
interface Message { id: number; threadId: number; participantId: number; content: string; createdAt: number; }
interface ThreadDetail extends Thread { participants: [Participant, Participant]; messages: Message[]; }
interface Config { version: number; name: string; theme: "vibrant" | "light" | "dark"; }
```

- `init(): Promise<void>` — load cached DB from IndexedDB, or create a fresh one from schema. Call once on app start.
- `getConfig(): Promise<Config>` — reads from `localStorage`; returns the default config (`{ version: 1, name: "", theme: "vibrant" }`) if nothing's been saved yet, rather than throwing.
- `updateConfig(patch: Partial<Omit<Config, "version">>): Promise<Config>` — merges `patch` into the current config and saves it back to `localStorage`. A patch, not a full replace, so setting the theme doesn't require also re-passing the name.
- `getThreads(): Promise<Thread[]>` — sidebar list, ordered by `updatedAt` desc. No participants/messages (lightweight).
- `getThread(threadId): Promise<ThreadDetail>` — full detail (both participants + all messages) for opening a thread.
- `createThread(title, participant1Role, participant2Role): Promise<ThreadDetail>` — always creates both participants at once; a thread can't exist with fewer than 2.
- `renameThread(threadId, title): Promise<Thread>` — does **not** bump `updatedAt` (that field tracks message activity, not metadata edits).
- `deleteThread(threadId): Promise<void>` — cascades to participants/messages via `ON DELETE CASCADE`.
- `updateParticipantRole(participantId, role): Promise<Participant>` — role is editable anytime; since it's not duplicated per-message, past messages just inherit the new label.
- `addMessage(threadId, participantId, content): Promise<Message>` — bumps the thread's `updatedAt`; validates `participantId` actually belongs to `threadId`.
- `exportBytes(): Promise<Uint8Array>` — raw serialized SQLite file, handed to zip.js for AES-256 encryption one layer up (not the zip itself).
- `importBytes(bytes): Promise<void>` — takes already-decrypted bytes, validates it's a real SQLite file with the expected tables before swapping it in.

**Errors**: typed hierarchy, not bare strings — `StorageError` (base: I/O, serialization, not-initialized) → `NotFoundError`, `ValidationError`, `ImportError`. Every function above rejects with one of these.

**v1 scope confirmed (2026-08-10)**: threads can be renamed and deleted; messages are append-only (no edit/delete, matches a real chat/journal); participant roles are editable anytime.

## Implementation Approach (decided)

- This project is being built in **very small, bite-sized increments** — deliberately not "vibe coded." The user's priority is understanding every piece of code that goes into the codebase: what it does, why it's there, and how it interacts with other modules and why — not just having a working app.
- In practice this means: explain the reasoning behind code as it's written, keep each change small enough to actually walk through, and surface module boundaries/interactions explicitly rather than letting them stay implicit.
- The exact granularity of how implementation gets split into chunks/iterations is not decided yet — to be worked out when implementation actually begins.
- **Explain things simply.** The user is not familiar with frontend development and doesn't have advanced backend experience — avoid unexplained jargon, don't assume familiarity with framework-specific idioms, and favor plain explanations over dense technical shorthand.
- **UI/UX syntax specifically can be glossed over.** The user is fine with a high-level summary of typical UI/UX markup/styling code (JSX/CSS-type details) rather than a full walkthrough — their deep-understanding priority is everything else (data/storage, app logic, module interactions, backend).

## Deferred (not v1, but keep architecture from boxing these out)

> Note: "MVP" here means close to the final deployable release, not a rough first pass — everything below is post-release polish/upgrades, not missing core functionality.

- **Group chat / multi-persona mode**: after the 2-role 1:1 experience is robust, support a "group chat" with N participants, each assigned a role — freeform text or a dropdown of presets (e.g. "Inner Critic", "Future Me"). Avoid hardcoding "exactly 2 participants" deep in the data model if it's easy to avoid, but don't build for this now.
- **Auth / multi-tenant accounts**: after MVP.
- **Server-side persistent storage** (e.g. "let the server keep my data" instead of zip-only): a distinct future phase requiring its own dedicated security/privacy deliberation before design — not decided now.
- **AI extras**: not in v1; possible future addition (auto titles/summaries/insights), same priority tier as group chat — nice-to-have, not core.
- **Capacitor mobile-app wrap (decided direction, post-MVP):** after the web MVP is solid, wrap the same built web app with Capacitor to produce real Android/iOS app-store binaries — no UI rewrite, no Flutter/Kotlin port; the existing React bundle runs inside a native WebView shell as-is. The motivation is storage durability, not UI: an installed app's local storage persists like any other app's data on the device (cleared only on uninstall), unlike a browser tab's storage, which can be evicted or cleared by the user/OS. Web (plain browser, no install) stays the primary, fully-supported MVP target — export/import there remains effectively mandatory, since browser storage isn't reliably durable. Only once wrapped does export/import get to relax from *mandatory* (the user's only real backup) to *optional* (manual backup/portability, e.g. moving data to another device) — the underlying storage-layer code (sql.js + IndexedDB) doesn't change between the two, only the platform's storage durability guarantee, and consequently how urgently the UI should prompt users to export.

## Status

Implementation in progress. This file (`CLAUDE.md`) holds *what* has been decided — product and architecture. The *process* — phases, sequencing, and exactly which build-plan increment we're on right now — lives in `../iterations.MD` (one level up from this repo), which is the rough guideline for how we proceed step by step. Check it for current progress rather than treating the status line here as authoritative.

## Design Wireframes
The UI/UX has been decided. Refer below for the UI/UX.
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/b434978e-db5c-4922-af89-bdfeffc8e13f?file=TalkCrates.dc.html

Focus on these files (the whole project is readable):
- `TalkCrates.dc.html`

Also read these files the selection imports:
- `android-frame.jsx`
- `nocturne.css`
- `support.js`

Implement: `TalkCrates.dc.html`
