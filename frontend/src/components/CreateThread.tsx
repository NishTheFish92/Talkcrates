// M5's "New chat" screen: a title field and two role pickers, defaulting
// to the {Name} / Rational {Name} presets (CLAUDE.md -> "Preset
// defaults"), each swappable to free-typed custom text via RolePicker.
// No storage calls in here — the collected values get handed up through
// onCreate, same "presentational component, parent owns storage" split
// Sidebar already uses.

import { useState, type FormEvent } from "react";
import { RolePicker } from "./RolePicker";

interface CreateThreadProps {
  name: string;
  onCreate: (
    title: string,
    participant1Role: string,
    participant2Role: string,
  ) => void;
  onCancel: () => void;
}

export function CreateThread({ name, onCreate, onCancel }: CreateThreadProps) {
  const person1Preset = name;
  const person2Preset = `Rational ${name}`;

  const [title, setTitle] = useState("");
  const [role1, setRole1] = useState(person1Preset);
  const [role2, setRole2] = useState(person2Preset);

  const canCreate =
    title.trim() !== "" && role1.trim() !== "" && role2.trim() !== "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    onCreate(title.trim(), role1.trim(), role2.trim());
  }

  return (
    <form className="create-thread" onSubmit={handleSubmit}>
      <h1>New chat</h1>

      <div className="field">
        <label htmlFor="thread-title">Chat name</label>
        <input
          id="thread-title"
          className="create-thread-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name this thread"
          autoFocus
        />
      </div>

      <RolePicker
        label="Person 1"
        preset={person1Preset}
        value={role1}
        onChange={setRole1}
      />
      <RolePicker
        label="Person 2"
        preset={person2Preset}
        value={role2}
        onChange={setRole2}
      />

      <div className="create-thread-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          Create
        </button>
      </div>
    </form>
  );
}
