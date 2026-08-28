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

import { useEffect, useState } from "react";
import { addMessage, getThread } from "../storage";
import type { Message, ThreadDetail } from "../storage";
import { MessageComposer } from "./MessageComposer";

interface ChatViewProps {
  threadId: number;
  onBack: () => void;
}

type LoadStatus =
  | { kind: "loading" }
  | { kind: "ready"; thread: ThreadDetail }
  | { kind: "error"; message: string };

export function ChatView({ threadId, onBack }: ChatViewProps) {
  const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
  // Index into thread.participants — 0 is slot 1, matching "opening a
  // thread always starts viewing it from slot 1's point of view".
  const [pov, setPov] = useState<0 | 1>(0);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    setPov(0);
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
          onClick={() => setPov(pov === 0 ? 1 : 0)}
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
            return (
              <div
                key={message.id}
                className={`chat-bubble-row ${isMine ? "chat-bubble-row--sent" : "chat-bubble-row--recv"}`}
              >
                <div
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
