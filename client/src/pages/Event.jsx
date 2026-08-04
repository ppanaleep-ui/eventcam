import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getGuestName } from '../lib/guest.js';
import Camera from '../components/Camera.jsx';
import Album from '../components/Album.jsx';
import Invite from '../components/Invite.jsx';
import NameGate from '../components/NameGate.jsx';
import Toast from '../components/Toast.jsx';

export default function Event() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notfound
  const [tab, setTab] = useState(params.get('invite') ? 'invite' : 'camera');
  const [photos, setPhotos] = useState([]);
  const [count, setCount] = useState(0);
  const [live, setLive] = useState(false);
  const [guest, setGuest] = useState(getGuestName());
  const [toast, setToast] = useState('');
  const seen = useRef(new Set());

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(''), 2200);
  }, []);

  // Add a photo, newest-first, de-duplicated (SSE + our own upload can race).
  const addPhoto = useCallback((p) => {
    if (!p || seen.current.has(p.id)) return false;
    seen.current.add(p.id);
    setPhotos((prev) => [p, ...prev]);
    setCount((c) => c + 1);
    return true;
  }, []);

  // Load event + first page of photos.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ev = await api.getEvent(id);
        if (!alive) return;
        setEvent(ev);
        setCount(ev.photoCount);
        setStatus('ready');
        const { items, total } = await api.listPhotos(id, { limit: 60 });
        if (!alive) return;
        for (const p of items) seen.current.add(p.id);
        setPhotos(items);
        if (typeof total === 'number') setCount(total);
      } catch {
        if (alive) setStatus('notfound');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Live updates via Server-Sent Events (auto-reconnects on drop).
  useEffect(() => {
    if (status !== 'ready') return;
    const es = new EventSource(`/api/events/${id}/stream`);
    es.addEventListener('hello', () => setLive(true));
    es.addEventListener('photo', (e) => {
      try {
        addPhoto(JSON.parse(e.data));
      } catch {}
    });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [id, status, addPhoto]);

  if (status === 'loading') {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (status === 'notfound') {
    return (
      <div className="center-screen">
        <div>
          <div style={{ fontSize: 46 }}>📷</div>
          <h2>Event not found</h2>
          <p style={{ color: 'var(--muted)' }}>This camera link doesn't exist or has ended.</p>
          <Link to="/" className="btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
            Create your own
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="event">
        <header className="topbar">
          <div className="title">
            <b>{event.name}</b>
            <span>
              {live && <span className="live-dot" />}
              {live ? 'Live' : 'Connecting…'}
            </span>
          </div>
          <div className="count-pill">{count} 📸</div>
        </header>

        <div className="tab-body">
          {tab === 'camera' && (
            <Camera eventId={id} guestName={guest} onUploaded={addPhoto} onToast={showToast} />
          )}
          {tab === 'album' && <Album eventId={id} photos={photos} setPhotos={setPhotos} count={count} />}
          {tab === 'invite' && <Invite event={event} onToast={showToast} />}
        </div>

        <nav className="tabbar">
          <TabBtn active={tab === 'camera'} onClick={() => setTab('camera')} ico="📷" label="Camera" />
          <TabBtn active={tab === 'album'} onClick={() => setTab('album')} ico="🖼️" label={`Album`} />
          <TabBtn active={tab === 'invite'} onClick={() => setTab('invite')} ico="🔗" label="Invite" />
        </nav>
      </div>

      {!guest && (
        <NameGate
          onSave={(name) => {
            setGuest(name);
          }}
        />
      )}

      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function TabBtn({ active, onClick, ico, label }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <span className="ico">{ico}</span>
      {label}
    </button>
  );
}
