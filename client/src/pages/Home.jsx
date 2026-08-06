import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { authApi } from '../lib/authApi.js';
import { setGuestName } from '../lib/guest.js';
import { addMyEvent } from '../lib/admin.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from '../components/Icon.jsx';

export default function Home() {
  const { user, loading, refresh, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="pc center">
        <div className="spinner" />
      </div>
    );
  }

  const approved = user.role === 'owner' || user.status === 'approved';
  const doLogout = () => logout().then(() => navigate('/login'));

  return (
    <div className="pc">
      {approved
        ? <Dashboard user={user} onLogout={doLogout} />
        : <PendingPanel onRefresh={refresh} onLogout={doLogout} />}
    </div>
  );
}

function Dashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [state, setState] = useState('loading');
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);
  const menuRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { events } = await authApi.myEvents();
      setEvents(events);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const empty = state === 'ready' && events.length === 0;

  return (
    <>
      <header className="pc-top">
        <h1>My events</h1>
        <div className="pc-profile-wrap" ref={menuRef}>
          <button className="pc-profile" onClick={() => setMenu((m) => !m)} aria-label="Account">
            <Icon name="user" size={20} />
          </button>
          {menu && (
            <div className="pc-menu">
              <div className="pc-menu-head">
                <b>{user.name || 'My account'}</b>
                <span>{user.email}</span>
              </div>
              {user.role === 'owner' && (
                <Link to="/owner" className="pc-menu-item"><Icon name="shield" size={18} /> Approve members</Link>
              )}
              <Link to="/admin" className="pc-menu-item"><Icon name="images" size={18} /> Manage events (QR · ZIP · Delete)</Link>
              <button className="pc-menu-item danger" onClick={onLogout}><Icon name="logout" size={18} /> Log out</button>
            </div>
          )}
        </div>
      </header>

      <div className="pc-body">
        {state === 'loading' && <div className="spinner" style={{ margin: '60px auto' }} />}
        {state === 'error' && <p className="pc-note">Couldn’t load your events — try refreshing</p>}

        {empty && (
          <div className="pc-aurora">
            <div className="pc-aurora-in">
              <h2>No events yet</h2>
              <p>Create a shared camera for your event, then let guests scan the QR and shoot into one album 💫</p>
            </div>
          </div>
        )}

        {state === 'ready' && events.length > 0 && (
          <div className="pc-events">
            {events.map((e) => (
              <button className="pc-event" key={e.id} onClick={() => navigate(`/e/${e.id}`)}>
                <div className="pc-event-thumb"><Icon name="camera" size={22} /></div>
                <div className="pc-event-info">
                  <b>{e.name}</b>
                  <span>{e.photoCount} items · tap to open</span>
                </div>
                <Icon name="chevronRight" size={22} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pc-foot">
        <button className="pc-cta" onClick={() => setCreating(true)}>
          <Icon name="imagePlus" size={22} />
          {empty ? 'Create your first event' : 'Create new event'}
        </button>
        <Link to="/admin" className="pc-link">See all events / manage</Link>
      </div>

      {creating && <CreateSheet onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateSheet({ onClose }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ev = await api.createEvent({ name: name.trim() || 'My event' });
      addMyEvent({ id: ev.id, token: ev.adminToken, name: ev.name });
      if (ev.hostName) setGuestName(ev.hostName);
      navigate(`/e/${ev.id}?invite=1`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="pc-sheet-scrim" onClick={onClose}>
      <form className="pc-sheet" onClick={(e) => e.stopPropagation()} onSubmit={create}>
        <div className="pc-sheet-grip" />
        <h2>Create new event</h2>
        <p>Name your event and we’ll make a QR for guests to scan and join right away.</p>
        <input
          type="text"
          placeholder="e.g. Karntida ♥ Krisada Wedding"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoFocus
        />
        {error && <p className="pc-err">{error}</p>}
        <button className="pc-cta" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
        <button type="button" className="pc-link" onClick={onClose}>Cancel</button>
      </form>
    </div>
  );
}

function PendingPanel({ onRefresh, onLogout }) {
  return (
    <div className="pc-body">
      <header className="pc-top"><h1>Pending approval</h1></header>
      <div className="pc-aurora">
        <div className="pc-aurora-in">
          <div className="pc-pending-ic"><Icon name="clock" size={30} /></div>
          <h2>Your account is pending approval</h2>
          <p>The owner will review and approve your account soon. Once approved, you can create events right away.</p>
        </div>
      </div>
      <div className="pc-foot">
        <button className="pc-cta" onClick={onRefresh}><Icon name="refresh" size={20} /> Check status again</button>
        <button className="pc-link" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
