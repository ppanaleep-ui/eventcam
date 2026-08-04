import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { setGuestName } from '../lib/guest.js';

export default function Home() {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ev = await api.createEvent({ name: name.trim() || 'My Event', hostName: host.trim() });
      if (host.trim()) setGuestName(host.trim());
      // Remember we host this event on this device.
      try {
        localStorage.setItem(`eventcam.admin.${ev.id}`, ev.adminToken);
      } catch {}
      navigate(`/e/${ev.id}?invite=1`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <h1>EventCam</h1>
        </div>

        <div className="hero">
          <h2>
            Capture <span className="serif">the party</span>
          </h2>
          <p>
            A digital disposable camera for your event. Guests scan a QR code, snap
            retro-filtered photos, and everything lands in one live shared album — no
            app download.
          </p>
        </div>

        <form className="card" onSubmit={create}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ev">Event name</label>
            <input
              id="ev"
              type="text"
              placeholder="Alex & Sam's Wedding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="host">Your name (optional)</label>
            <input
              id="host"
              type="text"
              placeholder="Host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              maxLength={60}
            />
          </div>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 14, margin: '0 0 12px' }}>{error}</p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create event camera'}
          </button>
        </form>

        <div className="features">
          <Feature ico="📷" title="Digital disposable camera">
            That nostalgic film look, saved instantly to a shared album.
          </Feature>
          <Feature ico="🔗" title="QR code sharing">
            Guests scan and join in seconds. No complicated setup, no downloads.
          </Feature>
          <Feature ico="🖼️" title="One shared album">
            See the whole event through everyone's eyes, updating live.
          </Feature>
          <Feature ico="👥" title="Built for a crowd">
            Designed to handle 2,000+ guests snapping at the same time.
          </Feature>
        </div>
      </div>
    </div>
  );
}

function Feature({ ico, title, children }) {
  return (
    <div className="feature">
      <div className="ico">{ico}</div>
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
