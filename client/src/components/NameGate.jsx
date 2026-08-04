import { useState } from 'react';
import { setGuestName } from '../lib/guest.js';

// First-time gate: ask the guest for a name so the album can show who snapped
// what. Stored on-device only.
export default function NameGate({ onSave }) {
  const [name, setName] = useState('');

  function save(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setGuestName(n);
    onSave(n);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <h3>Welcome to the party 🎉</h3>
        <p>What should we call you? This shows on the photos you add.</p>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
        />
        <button className="btn" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </div>
  );
}
