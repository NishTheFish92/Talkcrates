// The one thread every brand-new user starts with: a short worked example
// of what a self-dialogue in this app actually looks like, so "New Session"
// doesn't drop someone into an empty sidebar with no sense of what to type
// or why. Only used from App.tsx's handleNameSubmit — the "New Session"
// path specifically, not "Import Existing Session" (see App.tsx), since an
// import is bringing in someone's real data and shouldn't have a fake demo
// thread mixed into it.
//
// Uses the same two storage calls (createThread, addMessage) any real
// thread is built from — nothing here reaches into the database directly.
// That also means it's exercised by the app's own normal write path, not a
// separate one, so there's no special case in storage/ for "seed data".

import { addMessage, createThread } from "./storage";

export const GETTING_STARTED_TITLE = "Getting started";

// Same two presets CreateThread.tsx defaults every new thread to (CLAUDE.md
// -> "Preset defaults"): Person 1 talks as the user themselves, Person 2 is
// "Rational {Name}". Using the real presets here, instead of inventing
// separate demo roles, is itself part of the point: this thread should look
// exactly like a thread the user could have made themselves.
export async function seedGettingStartedThread(name: string): Promise<void> {
  const thread = await createThread(GETTING_STARTED_TITLE, name, `Rational ${name}`);
  const [me, rational] = thread.participants;

  // A short, ordinary example, meant to read like an actual text
  // conversation with yourself, not a therapy transcript: lowercase,
  // terse, punctuation used where it'd naturally show up (a real question
  // mark, an apostrophe in a contraction) and skipped everywhere else.
  //
  // It's also deliberately small. This is the first thing a brand-new
  // user sees, so it's here to show the shape of the interaction, not to
  // be an emotionally heavy moment — a two-second awkward exchange with a
  // barista that got stuck on replay, poked at once, and let go of. No
  // big reveal, no advice, no plan of action.
  const script: Array<readonly [typeof me, string]> = [
    [me, "Still thinking about that thing I said earlier"],
    [me, "Probably not a big deal"],
    [rational, "What did you say?"],
    [me, 'Told the barista "you too" when she said enjoy your coffee'],
    [rational, "Right, but that's just a one time slip up."],
    [me, "I know but I keep thinking about it and feel really stupid"],
    [rational, "Why? Does it matter that much"],
    [me, "Probably not, but it still feels stupid when to make a mistake like that"],
    [rational, "It might feel stupid but she's most definitely not thinking about it anymore"],
    [rational, "People are far too busy with their own problems to think about every slip up someone else makes"],
    [me, "Prolly yeah"],
    [rational, "Anyways, this is just a getting started thread to show the user the ideal way this app can be used."],
    [me, "Yeah :D you can use this app however you like, everyone can have their own style of using this app."],
  ];

  // addMessage() bumps the thread's updatedAt with every call and persists
  // to IndexedDB each time (see CLAUDE.md's write-through cache) — the same
  // as if the user had actually typed these one at a time. No batching:
  // ten small writes at app startup is cheap, and matches how the rest
  // of the storage layer already prioritizes simplicity/correctness over
  // write count.
  for (const [participant, content] of script) {
    await addMessage(thread.id, participant.id, content);
  }
}
