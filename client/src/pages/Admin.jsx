import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { authApi } from '../lib/authApi.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from '../components/Icon.jsx';

export default function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [state, setState] = useState('loading');
  const [qrFor, setQrFor] = useState(null);
  const [toast, setToast] = useState('');

  const flash = useCallback((m) => {
    setToast(m);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(''), 1800);
  }, []);

  const load = useCallback(async () => {
    try {
      const { events } = await authApi.myEvents();
      setEvents(events);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate('/login');
    load();
  }, [loading, user, navigate, load]);

  async function rename(e) {
    const name = window.prompt('New event name', e.name);
    if (!name || !name.trim()) return;
    try {
      await api.renameEvent(e.id, name.trim(), e.adminToken);
      flash('Renamed');
      load();
    } catch (err) {
      flash(err.message || 'Something went wrong');
    }
  }

  async function del(e) {
    if (!window.confirm('Permanently delete this event and all its photos/videos?')) return;
    try {
      await api.deleteEvent(e.id, e.adminToken);
      flash('Event deleted');
      load();
    } catch (err) {
      flash(err.message || 'Something went wrong');
    }
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="brand" style={{ justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/favicon.svg" alt="" />
            <h1 style={{ fontSize: 20 }}>My events</h1>
          </div>
          <Link to="/" className="chip-btn"><Icon name="plus" size={18} /> Create event</Link>
        </div>

        {state === 'loading' && <div className="spinner" style={{ margin: '40px auto' }} />}
        {state === 'error' && <p style={{ color: 'var(--danger)' }}>Couldn’t load your events</p>}

        {state === 'ready' &&
          (events.length === 0 ? (
            <div className="empty" style={{ padding: '40px 10px' }}>
              <div className="empty-ic"><Icon name="images" size={30} /></div>
              <b>No events yet</b>
              <span style={{ color: 'var(--muted)' }}>Create your first event now</span>
              <Link to="/" className="btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none', maxWidth: 220 }}>
                Create event
              </Link>
            </div>
          ) : (
            <div className="admin-list">
              {events.map((e) => (
                <div className="admin-card" key={e.id}>
                  <div className="admin-head">
                    <b title={e.name}>{e.name}</b>
                    <span className="admin-sub">{e.photoCount} items · /e/{e.id}</span>
                  </div>
                  <div className="admin-actions">
                    <Link className="btn secondary" to={`/e/${e.id}`}>Open</Link>
                    <button className="btn secondary" onClick={() => setQrFor(qrFor === e.id ? null : e.id)}>
                      <Icon name="qr" size={16} /> QR
                    </button>
                    <a className="btn secondary" href={api.downloadAllUrl(e.id, e.adminToken)}>
                      <Icon name="download" size={16} /> ZIP
                    </a>
                    <button className="btn secondary" onClick={() => rename(e)}>Rename</button>
                    <button className="btn danger" onClick={() => del(e)}>
                      <Icon name="trash" size={16} /> Delete
                    </button>
                  </div>
                  {qrFor === e.id && (
                    <div className="admin-qr">
                      <img src={api.qrUrl(e.id)} alt={`QR code for ${e.name}`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
