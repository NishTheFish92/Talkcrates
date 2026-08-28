// M7's message input: a text field + send button, appended to whichever
// thread is currently open. Doesn't call addMessage() itself — ChatView
// owns that, same "dumb component, parent owns storage" split used
// throughout (Sidebar, CreateThread).

import { useState, type FormEvent } from "react";

interface MessageComposerProps {
  placeholder: string;
  onSend: (content: string) => void;
}

export function MessageComposer({ placeholder, onSend }: MessageComposerProps) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <input
        className="composer-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="submit"
        className="composer-send"
        aria-label="Send"
        disabled={!value.trim()}
      >
        →
      </button>
    </form>
  );
}
