import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getGuestId } from '../lib/guest.js';
import { favSet } from '../lib/favorites.js';
import { saveToDevice } from '../lib/capture.js';
import Lightbox from './Lightbox.jsx';
import Icon from './Icon.jsx';

const FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'photo', label: 'รูป' },
  { id: 'video', label: 'วิดีโอ' },
];

export default function Album({ eventId, photos, setPhotos, count, isHost, adminToken, onDeleted, onUpdate, onToast }) {
  const [active, setActive] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const sentinel = useRef(null);
  const pressTimer = useRef(null);
  const suppressClick = useRef(false);

  const favs = favSet(eventId);
  const shown = photos.filter(
    (p) => (typeFilter === 'all' || p.kind === typeFilter || (typeFilter === 'photo' && !p.kind)) && (!favOnly || favs.has(p.id))
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || done || photos.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = photos[photos.length - 1].createdAt;
      const { items } = await api.listPhotos(eventId, { before: oldest, limit: 60, token: adminToken });
      if (items.length === 0) setDone(true);
      else
        setPhotos((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...items.filter((p) => !ids.has(p.id))];
        });
    } catch {
      /* keep the button to retry */
    } finally {
      setLoadingMore(false);
    }
  }, [eventId, photos, loadingMore, done, setPhotos, adminToken]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || favOnly || typeFilter !== 'all') return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, favOnly, typeFilter]);

  // ---- selection ----
  function toggleSel(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function pressStart(id) {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setSelectMode(true);
      toggleSel(id);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 420);
  }
  function pressCancel() {
    clearTimeout(pressTimer.current);
  }
  function onTileClick(i, id) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (selectMode) toggleSel(id);
    else setActive(i);
  }

  async function downloadSelected() {
    const items = photos.filter((p) => selected.has(p.id));
    if (!items.length) return;
    setSaving(true);
    onToast?.('กำลังเตรียมไฟล์…');
    const files = [];
    for (const p of items) {
      try {
        const b = await (await fetch(p.url)).blob();
        const ext = p.kind === 'video' ? guessExt(p.url) : 'jpg';
        files.push(new File([b], `eventcam-${p.id}.${ext}`, { type: b.type || 'application/octet-stream' }));
      } catch {
        /* skip */
      }
    }
    setSaving(false);
    if (!files.length) return onToast?.('ดาวน์โหลดไม่สำเร็จ');
    try {
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files });
      } else {
        for (const f of files) await saveToDevice(f, f.name);
      }
      onToast?.(`บันทึก ${files.length} ไฟล์ลงเครื่อง`);
      exitSelect();
    } catch (e) {
      if (e && e.name !== 'AbortError') onToast?.('บันทึกไม่สำเร็จ');
    }
  }

  if (photos.length === 0) {
    return (
      <div className="album">
        <div className="empty">
          <div className="empty-ic"><Icon name="images" size={30} /></div>
          <b>ยังไม่มีรูป</b>
          <span style={{ color: 'var(--muted)' }}>เป็นคนแรก — ไปที่แท็บกล้องแล้วถ่ายเลย</span>
        </div>
      </div>
    );
  }

  return (
    <div className="album">
      {selectMode ? (
        <div className="album-head select">
          <button className="link-btn" onClick={exitSelect}>ยกเลิก</button>
          <span className="album-count">เลือก {selected.size}</span>
          <button className="link-btn" onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>เลือกทั้งหมด</button>
        </div>
      ) : (
        <div className="album-head">
          <div className="seg-filter">
            {FILTERS.map((f) => (
              <button key={f.id} className={typeFilter === f.id ? 'on' : ''} onClick={() => setTypeFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <button className={`fav-filter ${favOnly ? 'on' : ''}`} onClick={() => setFavOnly((v) => !v)} aria-label="รายการโปรด">
            <Icon name="star" size={16} filled={favOnly} />
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty" style={{ padding: '48px 20px' }}>
          <div className="empty-ic"><Icon name={favOnly ? 'star' : typeFilter === 'video' ? 'video' : 'images'} size={28} /></div>
          <b>{favOnly ? 'ยังไม่มีรายการโปรด' : 'ยังไม่มีรายการ'}</b>
          <span style={{ color: 'var(--muted)' }}>
            {favOnly ? 'แตะรูป แล้วกด ⭐ เพื่อเก็บไว้' : 'ลองเปลี่ยนตัวกรองด้านบน'}
          </span>
        </div>
      ) : (
        <div className={`grid ${selectMode ? 'selecting' : ''}`}>
          {shown.map((p, i) => {
            const sel = selected.has(p.id);
            return (
              <button
                key={p.id}
                className={`tile ${sel ? 'sel' : ''}`}
                onClick={() => onTileClick(i, p.id)}
                onPointerDown={() => pressStart(p.id)}
                onPointerUp={pressCancel}
                onPointerLeave={pressCancel}
                onPointerMove={pressCancel}
                onContextMenu={(e) => e.preventDefault()}
              >
                {p.kind === 'video' && !p.thumbUrl ? (
                  <div className="vid-holder" />
                ) : (
                  <img
                    src={p.thumbUrl || p.url}
                    alt={p.guestName ? `ภาพโดย ${p.guestName}` : 'ภาพในงาน'}
                    loading="lazy"
                    onLoad={(e) => e.currentTarget.classList.add('loaded')}
                  />
                )}
                {p.kind === 'video' && (
                  <>
                    <span className="vid-play"><Icon name="play" size={18} /></span>
                    {p.duration ? <span className="vid-badge">{fmtDur(p.duration)}</span> : null}
                  </>
                )}
                {favs.has(p.id) && !selectMode && <span className="fav-badge"><Icon name="star" size={12} filled /></span>}
                {p.hidden && !selectMode && <span className="hidden-badge"><Icon name="eyeOff" size={12} /></span>}
                {p.likeCount > 0 && !selectMode && (
                  <span className="tile-like"><Icon name="heart" size={11} filled /> {p.likeCount}</span>
                )}
                {selectMode && <span className={`sel-ring ${sel ? 'on' : ''}`}>{sel && <Icon name="check" size={14} strokeWidth={3} />}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div ref={sentinel} style={{ height: 1 }} />
      {!favOnly && typeFilter === 'all' && !done && photos.length < count && (
        <button className="btn secondary" style={{ margin: '14px auto', maxWidth: 240 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
        </button>
      )}

      {selectMode && selected.size > 0 && (
        <div className="select-bar">
          <button className="btn" onClick={downloadSelected} disabled={saving}>
            <Icon name="download" size={20} /> {saving ? 'กำลังบันทึก…' : `ดาวน์โหลด ${selected.size} รายการ`}
          </button>
        </div>
      )}

      {active !== null && shown[active] && (
        <Lightbox
          photos={shown}
          index={active}
          onClose={() => setActive(null)}
          onIndex={setActive}
          eventId={eventId}
          isHost={isHost}
          adminToken={adminToken}
          myGuestId={getGuestId()}
          onDeleted={onDeleted}
          onUpdate={onUpdate}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function fmtDur(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function guessExt(url = '') {
  const m = url.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/);
  return m ? m[1] : 'mp4';
}
