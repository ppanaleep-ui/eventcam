import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getGuestName, getGuestId } from '../lib/guest.js';
import { getAdminToken } from '../lib/admin.js';
import Camera from '../components/Camera.jsx';
import Album from '../components/Album.jsx';
import Invite from '../components/Invite.jsx';
import NameGate from '../components/NameGate.jsx';
import Toast from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

export default function Event() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  // Host = holds the admin token on this device, or is the signed-in owner
  // (the server confirms the latter via the session cookie in `event.isHost`).
  const isHost = !!adminToken || !!event?.isHost;

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

  // Patch a photo in place (live like / comment counts).
  const updatePhoto = useCallback((photoId, patch) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p)));
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
        const ev = await api.getEvent(id, adminToken);
        if (!alive) return;
        setEvent(ev);
        setCount(ev.photoCount);
        setStatus('ready');
        const { items, total } = await api.listPhotos(id, { limit: 60, token: adminToken });
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
          const { items } = await api.listPhotos(id, { limit: 60, token: adminToken });
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
    es.addEventListener('like', (e) => {
      try {
        const { id, likeCount } = JSON.parse(e.data);
        updatePhoto(id, { likeCount });
      } catch {}
    });
    es.addEventListener('comment', (e) => {
      try {
        const { id, commentCount } = JSON.parse(e.data);
        updatePhoto(id, { commentCount });
      } catch {}
    });
    es.addEventListener('visibility', (e) => {
      try {
        const dto = JSON.parse(e.data);
        const mine = dto.ownerId && dto.ownerId === getGuestId();
        if (dto.hidden && !mine && !isHost) {
          removePhoto(dto.id); // no longer visible to this viewer
        } else {
          // owner/host keep it (badge updates); a re-shared photo pops back in
          updatePhoto(dto.id, { hidden: dto.hidden });
          addPhoto(dto);
        }
      } catch {}
    });
    es.onerror = () => {
      setLive(false);
      startPolling();
    };

    return () => {
      es.close();
      stopPolling();
    };
  }, [id, status, addPhoto, removePhoto, updatePhoto, isHost]);

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
          <div className="topbar-left">
            {isHost && (
              <button className="topbar-home" onClick={() => navigate('/')} aria-label="Home" title="Home">
                <Icon name="home" size={20} />
              </button>
            )}
            <div className="title">
              <b>{event.name}</b>
              <span>
                {live && <span className="live-dot" />}
                {live ? 'Live' : 'Connecting…'}
              </span>
            </div>
          </div>
          <div className="count-pill"><Icon name="images" size={15} /> {count}</div>
        </header>

        <div className="tab-body" key={tab}>
          {tab === 'camera' && (
            <Camera eventId={id} guestName={guest} onUploaded={addPhoto} onToast={showToast} />
          )}
          {tab === 'album' && (
            <div className="tab-anim">
              <Album
                eventId={id}
                photos={photos}
                setPhotos={setPhotos}
                count={count}
                isHost={isHost}
                adminToken={adminToken}
                guestName={guest}
                onDeleted={removePhoto}
                onUpdate={updatePhoto}
                onUploaded={addPhoto}
                onToast={showToast}
              />
            </div>
          )}
          {tab === 'invite' && (
            <div className="tab-anim">
              <Invite event={event} isHost={isHost} adminToken={adminToken} onToast={showToast} />
            </div>
          )}
        </div>

        <nav className="tabbar glass">
          <TabBtn active={tab === 'camera'} onClick={() => setTab('camera')} ico="camera" label="Camera" />
          <TabBtn active={tab === 'album'} onClick={() => setTab('album')} ico="images" label="Album" />
          <TabBtn active={tab === 'invite'} onClick={() => setTab('invite')} ico="qr" label="Invite" />
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
      <span className="ico"><Icon name={ico} size={23} strokeWidth={active ? 2.4 : 2} /></span>
      {label}
    </button>
  );
}
