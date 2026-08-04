import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getGuestName } from '../lib/guest.js';
import { getAdminToken } from '../lib/admin.js';
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
  const pollRef = useRef(null);
  const adminToken = getAdminToken(id);
  const isHost = !!adminToken;

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

  // Remove a photo everywhere (host deleted it).
  const removePhoto = useCallback((photoId) => {
    seen.current.delete(photoId);
    setPhotos((prev) => {
      if (!prev.some((p) => p.id === photoId)) return prev;
      setCount((c) => Math.max(0, c - 1));
      return prev.filter((p) => p.id !== photoId);
    });
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

  // Live updates via Server-Sent Events (auto-reconnects on drop). If the SSE
  // connection can't hold — strict proxies, flaky venue wifi, huge crowds — we
  // fall back to polling so guests still see new photos, just less instantly.
  useEffect(() => {
    if (status !== 'ready') return;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const { items } = await api.listPhotos(id, { limit: 60 });
          for (const p of items) addPhoto(p);
        } catch {}
      }, 6000);
    };

    const es = new EventSource(`/api/events/${id}/stream`);
    es.addEventListener('hello', () => {
      setLive(true);
      stopPolling(); // SSE is healthy; no need to poll
    });
    es.addEventListener('photo', (e) => {
      try {
        addPhoto(JSON.parse(e.data));
      } catch {}
    });
    es.addEventListener('delete', (e) => {
      try {
        removePhoto(JSON.parse(e.data).id);
      } catch {}
    });
    es.addEventListener('event', (e) => {
      try {
        const { name } = JSON.parse(e.data);
        if (name) setEvent((ev) => (ev ? { ...ev, name } : ev));
      } catch {}
    });
    es.addEventListener('event-deleted', () => {
      setStatus('notfound');
    });
    es.onerror = () => {
      setLive(false);
      startPolling();
    };

    return () => {
      es.close();
      stopPolling();
    };
  }, [id, status, addPhoto, removePhoto]);

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
          {tab === 'album' && (
            <Album
              eventId={id}
              photos={photos}
              setPhotos={setPhotos}
              count={count}
              isHost={isHost}
              adminToken={adminToken}
              onDeleted={removePhoto}
              onToast={showToast}
            />
          )}
          {tab === 'invite' && (
            <Invite event={event} isHost={isHost} adminToken={adminToken} onToast={showToast} />
          )}
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
