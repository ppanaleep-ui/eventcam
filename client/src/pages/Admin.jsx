import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getMyEvents, updateMyEvent, removeMyEvent } from '../lib/admin.js';

export default function Admin() {
  const [events, setEvents] = useState(() => getMyEvents());
  const [stats, setStats] = useState({}); // id -> { name, photoCount, missing }
  const [qrFor, setQrFor] = useState(null);
  const [toast, setToast] = useState('');

  function flash(m) {
    setToast(m);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setToast(''), 2000);
  }

  // Refresh live info for each hosted event.
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const e of events) {
        try {
          const info = await api.getEvent(e.id, e.token);
          if (info?.name && info.name !== e.name) updateMyEvent(e.id, { name: info.name });
          next[e.id] = { name: info.name, photoCount: info.photoCount };
        } catch {
          next[e.id] = { missing: true };
        }
      }
      if (alive) setStats(next);
    })();
    return () => {
      alive = false;
    };
  }, [events]);

  async function rename(e) {
    const name = window.prompt('ชื่อใหม่ของงาน', stats[e.id]?.name || e.name);
    if (!name || !name.trim()) return;
    try {
      const r = await api.renameEvent(e.id, name.trim(), e.token);
      updateMyEvent(e.id, { name: r.name });
      setEvents(getMyEvents());
      setStats((s) => ({ ...s, [e.id]: { ...s[e.id], name: r.name } }));
      flash('เปลี่ยนชื่อแล้ว');
    } catch (err) {
      flash(err.message || 'เปลี่ยนชื่อไม่สำเร็จ');
    }
  }

  async function del(e) {
    if (!window.confirm('ลบงานนี้และรูป/วิดีโอทั้งหมดถาวร?')) return;
    try {
      await api.deleteEvent(e.id, e.token);
    } catch {
      /* even if the server 404s, drop it from our device list */
    }
    removeMyEvent(e.id);
    setEvents(getMyEvents());
    flash('ลบงานแล้ว');
  }

  function forget(e) {
    if (!window.confirm('เอางานนี้ออกจากรายการในเครื่องนี้? (ไม่ลบข้อมูลบนเซิร์ฟเวอร์)')) return;
    removeMyEvent(e.id);
    setEvents(getMyEvents());
  }

  return (
    <div className="app">
      <div className="landing">
        <div className="brand" style={{ justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/favicon.svg" alt="" />
            <h1>จัดการอีเวนต์</h1>
          </div>
          <Link to="/" className="btn" style={{ width: 'auto', padding: '8px 14px', textDecoration: 'none' }}>
            + สร้างงานใหม่
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="empty" style={{ padding: '40px 10px' }}>
            <div className="big">🗂️</div>
            <b>ยังไม่มีงานในเครื่องนี้</b>
            <span style={{ color: 'var(--muted)' }}>งานที่คุณสร้างจากเครื่องนี้จะมาแสดงที่นี่</span>
            <Link to="/" className="btn" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none', maxWidth: 220 }}>
              สร้างงานแรก
            </Link>
          </div>
        ) : (
          <div className="admin-list">
            {events.map((e) => {
              const st = stats[e.id] || {};
              const name = st.name || e.name;
              return (
                <div className="admin-card" key={e.id}>
                  <div className="admin-head">
                    <div style={{ minWidth: 0 }}>
                      <b title={name}>{name}</b>
                      <span className="admin-sub">
                        {st.missing ? 'ไม่พบบนเซิร์ฟเวอร์ (อาจถูกลบแล้ว)' : `${st.photoCount ?? '—'} รายการ · /e/${e.id}`}
                      </span>
                    </div>
                  </div>
                  <div className="admin-actions">
                    <Link className="btn secondary" to={`/e/${e.id}`}>เปิดงาน</Link>
                    <button className="btn secondary" onClick={() => setQrFor(qrFor === e.id ? null : e.id)}>QR</button>
                    <a className="btn secondary" href={api.downloadAllUrl(e.id, e.token)}>⬇ ZIP</a>
                    <button className="btn secondary" onClick={() => rename(e)}>เปลี่ยนชื่อ</button>
                    {st.missing ? (
                      <button className="btn ghost" onClick={() => forget(e)}>เอาออกจากรายการ</button>
                    ) : (
                      <button className="btn danger" onClick={() => del(e)}>ลบงาน</button>
                    )}
                  </div>
                  {qrFor === e.id && (
                    <div className="admin-qr">
                      <img src={api.qrUrl(e.id)} alt={`QR สำหรับ ${name}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
