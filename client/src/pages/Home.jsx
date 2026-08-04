import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
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
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  const approved = user.role === 'owner' || user.status === 'approved';

  return (
    <div className="app">
      <div className="landing">
        <header className="home-top">
          <div className="brand">
            <img src="/favicon.svg" alt="" />
            <h1>EventCam</h1>
          </div>
          <div className="home-top-actions">
            {user.role === 'owner' && (
              <Link to="/owner" className="chip-btn" title="อนุมัติสมาชิก">
                <Icon name="shield" size={18} /> อนุมัติ
              </Link>
            )}
            <button className="chip-btn" onClick={() => logout().then(() => navigate('/login'))} title="ออกจากระบบ">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        {approved ? <CreatePanel /> : <PendingPanel onRefresh={refresh} onLogout={() => logout().then(() => navigate('/login'))} />}
      </div>
    </div>
  );
}

function CreatePanel() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ev = await api.createEvent({ name: name.trim() || 'อีเวนต์ของฉัน' });
      addMyEvent({ id: ev.id, token: ev.adminToken, name: ev.name });
      if (ev.hostName) setGuestName(ev.hostName);
      navigate(`/e/${ev.id}?invite=1`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hero">
        <h2>
          Capture <span className="serif">the moment</span>
        </h2>
        <p>สร้างกล้องรวมภาพสำหรับงานของคุณ แขกสแกน QR แล้วถ่ายรูป/วิดีโอลงอัลบั้มเดียวกันแบบเรียลไทม์ — ไม่ต้องโหลดแอป</p>
      </div>

      <form className="card glass-card" onSubmit={create}>
        <label htmlFor="ev">ชื่อเวนต์</label>
        <input id="ev" type="text" placeholder="เช่น งานแต่ง Karntida ♥ Krisada" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        {error && <p style={{ color: 'var(--danger)', fontSize: 14, margin: '10px 0 0' }}>{error}</p>}
        <button className="btn" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? 'กำลังสร้าง…' : 'สร้างกล้องอีเวนต์'}
        </button>
      </form>

      <Link to="/admin" className="card glass-card link-card">
        <div>
          <b>อีเวนต์ของฉัน</b>
          <span>ดู QR · ดาวน์โหลดรูป · เปลี่ยนชื่อ · ลบงาน</span>
        </div>
        <Icon name="chevronRight" size={22} />
      </Link>

      <div className="features">
        <Feature name="camera" title="กล้องฟิล์มดิจิทัล">ฟิลเตอร์ย้อนยุค + ถ่ายวิดีโอได้ เก็บเข้าอัลบั้มทันที</Feature>
        <Feature name="qr" title="แชร์ด้วย QR">แขกสแกนเข้าร่วมใน 2 วินาที ไม่ต้องติดตั้งอะไร</Feature>
        <Feature name="images" title="อัลบั้มรวมงาน">เห็นงานผ่านสายตาทุกคน อัปเดตสด</Feature>
      </div>
    </>
  );
}

function PendingPanel({ onRefresh, onLogout }) {
  return (
    <div className="pending glass-card">
      <div className="pending-ic">
        <Icon name="clock" size={30} />
      </div>
      <h2>บัญชีของคุณกำลังรออนุมัติ</h2>
      <p>เจ้าของเว็บจะตรวจและอนุมัติบัญชีของคุณเร็ว ๆ นี้ เมื่ออนุมัติแล้วคุณจะสร้างอีเวนต์ได้ทันที</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn secondary" onClick={onRefresh} style={{ flex: 1 }}>
          <Icon name="refresh" size={18} /> เช็กสถานะอีกครั้ง
        </button>
        <button className="btn ghost" onClick={onLogout} style={{ width: 'auto', padding: '0 18px' }}>
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

function Feature({ name, title, children }) {
  return (
    <div className="feature">
      <div className="feature-ic"><Icon name={name} size={20} /></div>
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
