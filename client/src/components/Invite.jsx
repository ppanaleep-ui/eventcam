import { useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

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
      onToast?.('Couldn’t copy — press and hold the link');
    }
  }

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, text: `Join the album for "${event.name}"`, url });
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
        Invite <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'var(--accent-strong)' }}>friends</span>
      </h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Guests scan to join — no app to download.</p>

      <div className="qr-card">
        <img src={api.qrUrl(event.id)} alt="Scan to join the event camera" />
        <div className="no-dl">No app to install</div>
      </div>

      <div className="link-row">
        <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn secondary icon-btn" style={{ width: 'auto', padding: '0 16px' }} onClick={copy}>
          {copied ? <Icon name="check" size={18} /> : <Icon name="copy" size={18} />}
        </button>
      </div>

      <button className="btn icon-btn" onClick={shareLink}>
        <Icon name="share" size={18} /> Share link
      </button>

      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
        Anyone with this link can view the album and add photos — share it only with your guests.
      </p>

      {isHost && (
        <div className="host-panel">
          <span className="host-tag"><Icon name="shield" size={14} /> Host controls</span>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
            Download the whole event as a ZIP, or delete any photo (tap a photo, then the trash icon).
          </p>
          <a
            className="btn icon-btn"
            href={api.downloadAllUrl(event.id, adminToken)}
            style={{ display: 'inline-flex', width: '100%', textDecoration: 'none', justifyContent: 'center' }}
          >
            <Icon name="download" size={18} /> Download whole event (.zip)
          </a>
        </div>
      )}
    </div>
  );
}
