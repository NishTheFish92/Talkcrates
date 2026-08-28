// M6's chat view: one thread's messages rendered as bubbles, from the
// point of view of whichever participant is "you" right now (`pov`).
//
// `pov` is deliberately local component state, not stored anywhere —
// CLAUDE.md's schema notes call it "transient UI state" that always
// resets to slot 1 (participants[0]) when a thread is (re)opened.
// Swapping it just reflows which side existing messages render on;
// nothing in storage changes, and `messages.participantId` never does
// either (see CLAUDE.md -> SQLite schema -> "Bubble left/right rendering
// is computed live, client-side").

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addMessage, getThread } from "../storage";
import type { Message, ThreadDetail } from "../storage";
import { MessageComposer } from "./MessageComposer";

interface ChatViewProps {
  threadId: number;
  onBack: () => void;
  // Optional: called (fire-and-forget, not awaited) after a message is
  // sent. Home passes its reloadThreads here so the sidebar's "Updated
  // Xm ago" stays live on the two-pane desktop layout, where the sidebar
  // stays visible next to an open chat instead of being navigated away
  // from. Not required — ChatView works fine without it (onBack already
  // reloads regardless), this just keeps a visible sidebar fresher.
  onMessageSent?: () => void;
}

type LoadStatus =
  | { kind: "loading" }
  | { kind: "ready"; thread: ThreadDetail }
  | { kind: "error"; message: string };

export function ChatView({ threadId, onBack, onMessageSent }: ChatViewProps) {
  const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
  // Index into thread.participants — 0 is slot 1, matching "opening a
  // thread always starts viewing it from slot 1's point of view".
  const [pov, setPov] = useState<0 | 1>(0);
  // Which message (if any) should play the bubble-pop entrance animation
  // — only the one just sent, not every bubble on every render.
  const [justSentId, setJustSentId] = useState<number | null>(null);

  // FLIP animation state for the POV swap — this is what makes bubbles
  // actually slide from their old side to their new one, rather than
  // instantly snapping (the naive result of just changing which side
  // `justify-content` puts them on). "FLIP" = First, Last, Invert, Play:
  // record each bubble's position before the swap (First), let React
  // re-render into the new layout (Last), then immediately offset every
  // bubble back to where it used to be with no transition (Invert — so
  // the jump is invisible) and animate that offset back to zero (Play).
  // bubbleRefs holds the actual bubble DOM nodes (keyed by message id, so
  // a specific bubble can be found again after re-render); pendingRects
  // holds the "First" measurements between the click handler and the
  // effect that does "Invert, Play".
  const bubbleRefs = useRef(new Map<number, HTMLDivElement>());
  const pendingRects = useRef<Map<number, DOMRect> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    setPov(0);
    setJustSentId(null);
    getThread(threadId)
      .then((thread) => {
        if (!cancelled) setStatus({ kind: "ready", thread });
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message:
              err instanceof Error
                ? err.message
                : "Something went wrong loading this chat.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // The "Invert, Play" half of FLIP. Runs after every render where
  // handleSwapPov left measurements in pendingRects — useLayoutEffect
  // (not useEffect) specifically, because it fires synchronously after
  // the DOM updates but before the browser paints, so the "jump to the
  // old position" step below never actually becomes visible on screen.
  useLayoutEffect(() => {
    const before = pendingRects.current;
    if (!before) return;
    pendingRects.current = null;

    bubbleRefs.current.forEach((el, messageId) => {
      const oldRect = before.get(messageId);
      if (!oldRect) return; // a bubble sent after the measurement — nothing to flip
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      if (dx === 0) return;

      // Invert: jump back to the old position with no transition.
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
      // Force the browser to apply the above before the next line, or it
      // would just merge both style changes into one and never render
      // the "old position" starting point at all.
      void el.offsetWidth;
      // Play: animate from that offset back to the natural position.
      el.style.transition = "transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)";
      el.style.transform = "translateX(0)";
    });
  }, [pov]);

  if (status.kind === "loading") {
    return <div className="status-message">Loading…</div>;
  }
  if (status.kind === "error") {
    return (
      <div className="status-message status-message--error">
        {status.message}
      </div>
    );
  }

  const { thread } = status;
  const me = thread.participants[pov];
  const other = thread.participants[pov === 0 ? 1 : 0];

  async function handleSend(content: string) {
    const newMessage: Message = await addMessage(threadId, me.id, content);
    setStatus({
      kind: "ready",
      thread: { ...thread, messages: [...thread.messages, newMessage] },
    });
    setJustSentId(newMessage.id);
    onMessageSent?.();
  }

  function handleSwapPov() {
    // First: measure every bubble's current position before anything
    // changes. Stashed in a ref (not state) since this doesn't need to
    // trigger a render itself — the pov state update below already will.
    const rects = new Map<number, DOMRect>();
    bubbleRefs.current.forEach((el, messageId) => {
      rects.set(messageId, el.getBoundingClientRect());
    });
    pendingRects.current = rects;
    setJustSentId(null);
    setPov(pov === 0 ? 1 : 0);
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <button
          type="button"
          className="chat-back"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>
        <span className="chat-header-title">{other.role}</span>
        <button
          type="button"
          className="chat-swap"
          onClick={handleSwapPov}
          aria-label="Switch point of view"
        >
          ⇄
        </button>
      </div>

      <div className="chat-messages">
        {thread.messages.length === 0 ? (
          <div className="chat-empty">
            No messages yet — say something as {me.role}.
          </div>
        ) : (
          thread.messages.map((message) => {
            const isMine = message.participantId === me.id;
            const isNew = message.id === justSentId;
            return (
              <div
                key={message.id}
                className={`chat-bubble-row ${isMine ? "chat-bubble-row--sent" : "chat-bubble-row--recv"} ${isNew ? "chat-bubble-row--new" : ""}`}
              >
                <div
                  ref={(el) => {
                    if (el) bubbleRefs.current.set(message.id, el);
                    else bubbleRefs.current.delete(message.id);
                  }}
                  className={`chat-bubble ${isMine ? "chat-bubble--sent" : "chat-bubble--recv"}`}
                >
                  {message.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <MessageComposer
        placeholder={`Message as ${me.role}`}
        onSend={handleSend}
      />
    </div>
  );
}
