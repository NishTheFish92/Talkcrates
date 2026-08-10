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
- Web application, responsive — must work well on both desktop and mobile. Native apps are out of scope.

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
- Decoupled SPA architecture — frontend talks to FastAPI over REST/WebSocket, no server-side templating.

## Storage & Data Format (decided, details TBD as we build)

- **File inside the zip is a SQLite database**, not JSON. Three tables: `threads`, `participants`, `messages`.
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

## Status

Concept-finalization stage. No application code yet. Next step is design (UI/UX, then technical architecture) before implementation begins. Once the MVP is fully built, containerize it.

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
