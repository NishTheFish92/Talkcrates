# TalkCrates

*(pronounced "Talk-cra-teez", like Socrates, but with "Talk" instead of "So")*

TalkCrates is a chat app for talking to yourself, on purpose, and in a structured way.

## Why

Socratic questioning is a technique used in Cognitive Behavioral Therapy (CBT): instead of accepting a thought at face value, you question it, and work toward a healthier or clearer one through that questioning. Most people never actually do this. Thoughts stay a murky, half-formed pool in your head instead of something you actually examine. Most people also know a lot less about themselves than they think they do.

TalkCrates gives that process a place to happen. You split into two personas and have an actual back-and-forth with yourself, rendered as a normal two-person chat, instead of one continuous, murky monologue. There's no fixed "right" way to use it: confront a thinking pattern, argue out a decision, or just vent and talk yourself down. The point is putting it down somewhere and actually looking at it, in your own words, as a conversation rather than a diary entry.

## How it works

- Every conversation is a **thread**, with exactly two participants.
- Each participant has a **role**, a persona you're speaking as (e.g. yourself, a more rational version of yourself, or any custom label you want), chosen per thread, not fixed app-wide.
- You write both sides yourself. There's no AI generating anything, the app's only job is to visually separate the two voices as distinct chat bubbles, so it's easier to actually context-switch between them instead of it reading as one continuous thought.
- You can flip your point of view mid-thread to see the whole conversation from the other persona's side.

## Your data stays yours

There's no account and no server-side database. Everything you write lives in your browser only. When you want a durable backup, or want to move your conversations to another device, you export them as a plain zip file and import it back in wherever you want it.

## Tech stack

- **Frontend**: React + TypeScript, built with Vite.
- **Storage**: [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly) running entirely in the browser, cached to IndexedDB so it survives a page reload. There's no backend database; the SQLite file itself *is* your data, and exporting is just zipping that file up (via [zip.js](https://gildas-lormeau.github.io/zip.js/)) for you to download.
- **Backend**: FastAPI (Python), currently just a thin layer for serving the built frontend and a health-check endpoint. No app data ever passes through it.
- **Hosting**: static build deployed to GitHub Pages via GitHub Actions.
- The design, architecture, and storage decisions (the data model, the client-side-only approach, the export/import format) were mine. Claude Code handled the nitty-gritty of turning those decisions into working code, built incrementally in small pieces that were explained and understood along the way rather than generated wholesale and taken on faith.

## Status

Actively in development, built incrementally in small, understandable pieces rather than all at once. This README will grow as the app does.
