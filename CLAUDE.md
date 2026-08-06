# TalkCrates

A chat-interface web app for structured self-dialogue and introspection. Instead of a one-sided diary, the user has a back-and-forth conversation with themselves by switching between two distinct voices — **Questioner** and **Answerer** — rendered as a familiar two-participant chat UI. Used for working through decisions, debating with oneself, or venting in a structured way.

## Product Concept (finalized)

**Core interaction model**
- Both sides of every conversation are self-authored by the user — there is no LLM generating messages. The app's only job is to visually separate the "Questioner" and "Answerer" as distinct chat participants (like a real 2-person conversation), so the user can mentally context-switch between roles instead of it reading as one continuous monologue.
- Roles are fixed for v1: exactly two, Questioner and Answerer. No custom personas yet (see Deferred).

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

- **File inside the zip is a SQLite database** (roughly: `threads` + `messages` tables), not JSON.
- **Client-side engine is not finalized yet — leaning sql.js** (SQLite compiled to WASM, in-memory, no built-in persistence) over a persistent OPFS-backed engine (e.g. wa-sqlite), because OPFS needs a Web Worker and has rough edges on Safari/iOS, which this app must support well. Whichever engine we pick, all access must go through an **async-first interface** (`getThreads()`, `addMessage()`, `exportBytes()`, `importBytes()` — all return Promises) so swapping engines later doesn't force a sync→async rewrite across the UI.
- **Export/import is 100% client-side — no FastAPI involvement, no network call.** The zip is built, encrypted, decrypted, and parsed entirely in-browser. Zip encryption must be real **AES-256** (e.g. `zip.js`), not legacy ZipCrypto.

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
