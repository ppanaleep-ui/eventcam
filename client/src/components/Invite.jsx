import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Invite({ event, isHost, adminToken, onToast }) {
  const [copied, setCopied] = useState(false);
  const url = event.joinUrl || `${window.location.origin}/e/${event.id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onToast?.('Link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onToast?.('Copy failed — long-press the link');
    }
  }

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: event.name,
          text: `Join the photo album for "${event.name}"`,
          url,
        });
      } else {
        copy();
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="invite">
      <h2 style={{ margin: '4px 0 4px' }}>
        Invite <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--accent)' }}>friends</span>
      </h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Guests scan to join. No download required 🔥</p>

      <div className="qr-card">
        {/* SVG QR served by the backend */}
        <img src={api.qrUrl(event.id)} alt="Scan to join the event camera" />
        <div className="no-dl">No app download required</div>
      </div>

      <div className="link-row">
        <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn secondary" style={{ width: 'auto', padding: '0 18px' }} onClick={copy}>
          {copied ? '✓' : 'Copy'}
        </button>
      </div>

      <button className="btn" onClick={shareLink}>
        Share link
      </button>

      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
        Anyone with this link can view the album and add photos. Keep it to your guests.
      </p>

      {isHost && (
        <div className="host-panel">
          <span className="host-tag">★ Host controls</span>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
            You created this event on this device. Download every photo as a ZIP, or remove any
            photo from the album (tap a photo, then 🗑).
          </p>
          <a
            className="btn"
            href={api.downloadAllUrl(event.id, adminToken)}
            style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
          >
            ⬇ Download all photos (.zip)
          </a>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
            Host access lives only in this browser — keep using this device to manage the event.
          </p>
        </div>
      )}
    </div>
  );
}
