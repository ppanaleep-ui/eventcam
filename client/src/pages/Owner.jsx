import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/authApi.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from '../components/Icon.jsx';

export default function Owner() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [state, setState] = useState('loading');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const { users } = await authApi.listUsers();
      setUsers(users);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) return navigate('/login');
    if (user.role !== 'owner') return navigate('/');
    load();
  }, [loading, user, navigate, load]);

  async function act(id, action) {
    try {
      await authApi.setUserStatus(id, action);
      setToast(action === 'approve' ? 'Approved' : 'Updated');
      window.setTimeout(() => setToast(''), 1600);
      load();
    } catch (e) {
      setToast(e.message || 'Something went wrong');
    }
  }

  const pending = users.filter((u) => u.status === 'pending');
  const others = users.filter((u) => u.status !== 'pending');

  return (
    <div className="app">
      <div className="landing">
        <div className="brand" style={{ justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/favicon.svg" alt="" />
            <h1 style={{ fontSize: 20 }}>Approve members</h1>
          </div>
          <Link to="/" className="btn ghost" style={{ width: 'auto', padding: '8px 14px', textDecoration: 'none' }}>
            Home
          </Link>
        </div>

        {state === 'loading' && <div className="spinner" style={{ margin: '40px auto' }} />}
        {state === 'error' && <p style={{ color: 'var(--danger)' }}>Couldn’t load members</p>}

        {state === 'ready' && (
          <>
            <Section title={`Pending (${pending.length})`}>
              {pending.length === 0 ? (
                <p className="muted-note">No pending requests 🎉</p>
              ) : (
                pending.map((u) => (
                  <UserRow key={u.id} u={u}>
                    <button className="btn" style={btn} onClick={() => act(u.id, 'approve')}>
                      <Icon name="check" size={16} /> Approve
                    </button>
                    <button className="btn danger" style={btn} onClick={() => act(u.id, 'reject')}>
                      Reject
                    </button>
                  </UserRow>
                ))
              )}
            </Section>

            <Section title={`All members (${others.length})`}>
              {others.map((u) => (
                <UserRow key={u.id} u={u}>
                  {u.role === 'owner' ? (
                    <span className="badge owner">Owner</span>
                  ) : u.status === 'approved' ? (
                    <button className="btn secondary" style={btn} onClick={() => act(u.id, 'reject')}>
                      Suspend
                    </button>
                  ) : (
                    <button className="btn" style={btn} onClick={() => act(u.id, 'approve')}>
                      <Icon name="check" size={16} /> Reactivate
                    </button>
                  )}
                </UserRow>
              ))}
            </Section>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const btn = { width: 'auto', padding: '8px 14px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 };

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <h2 className="section-eyebrow">{title}</h2>
      <div className="admin-list">{children}</div>
    </div>
  );
}

function UserRow({ u, children }) {
  return (
    <div className="admin-card user-row">
      <div style={{ minWidth: 0 }}>
        <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {u.name || u.email}
        </b>
        <span className="admin-sub">{u.email}</span>{' '}
        <span className={`badge ${u.status}`}>{statusLabel(u.status)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function statusLabel(s) {
  return s === 'approved' ? 'Approved' : s === 'pending' ? 'Pending' : 'Rejected';
}
