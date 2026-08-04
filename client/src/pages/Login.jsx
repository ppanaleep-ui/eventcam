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
        <h1>{mode === 'login' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีผู้จัดงาน'}</h1>
        <p className="auth-sub">
          {mode === 'login'
            ? 'เข้าสู่ระบบเพื่อสร้างและจัดการอีเวนต์'
            : 'สมัครเพื่อขอสิทธิ์จัดงาน — เจ้าของเว็บจะอนุมัติก่อนเริ่มใช้งาน'}
        </p>

        <div className="seg">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            เข้าสู่ระบบ
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
            สมัครสมาชิก
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label className="field">
              <Icon name="user" size={18} />
              <input type="text" placeholder="ชื่อของคุณ" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </label>
          )}
          <label className="field">
            <Icon name="mail" size={18} />
            <input type="email" placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            <Icon name="lock" size={18} />
            <input
              type="password"
              placeholder={mode === 'register' ? 'รหัสผ่าน (อย่างน้อย 8 ตัว)' : 'รหัสผ่าน'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="btn" disabled={busy}>
            {busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
        </form>

        <p className="auth-foot">แขกที่มาร่วมงานไม่ต้องสมัคร — แค่สแกน QR ก็ลงรูปได้เลย</p>
      </div>
    </div>
  );
}
