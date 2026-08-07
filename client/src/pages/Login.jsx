import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Icon from '../components/Icon.jsx';

export default function Login() {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login({ email, password });
      else await register({ email, password, name });
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-card glass">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" />
          <span>EventCam</span>
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create a host account'}</h1>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Log in to create and manage events'
            : 'Sign up to request host access — the owner approves before you start'}
        </p>

        <div className="seg">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            Log in
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label className="field">
              <Icon name="user" size={18} />
              <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </label>
          )}
          <label className="field">
            <Icon name="mail" size={18} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <Icon name="lock" size={18} />
            <input
              type="password"
              placeholder={mode === 'register' ? 'Password (at least 8 characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <p className="auth-foot">Guests don’t need to sign up — just scan the QR and start adding photos</p>
      </div>
    </div>
  );
}
