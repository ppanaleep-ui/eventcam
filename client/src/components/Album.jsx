import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getGuestId } from '../lib/guest.js';
import { favSet } from '../lib/favorites.js';
import Lightbox from './Lightbox.jsx';
import Icon from './Icon.jsx';

export default function Album({ eventId, photos, setPhotos, count, isHost, adminToken, onDeleted, onUpdate, onToast }) {
  const [active, setActive] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const sentinel = useRef(null);

  const favs = favSet(eventId);
  const shown = favOnly ? photos.filter((p) => favs.has(p.id)) : photos;

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
    if (!el || favOnly) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, favOnly]);

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
      <div className="album-head">
        <span className="album-count">{count} รายการ</span>
        <button className={`fav-filter ${favOnly ? 'on' : ''}`} onClick={() => setFavOnly((v) => !v)}>
          <Icon name="star" size={16} filled={favOnly} /> รายการโปรด
        </button>
      </div>

      {favOnly && shown.length === 0 ? (
        <div className="empty" style={{ padding: '48px 20px' }}>
          <div className="empty-ic"><Icon name="star" size={28} /></div>
          <b>ยังไม่มีรายการโปรด</b>
          <span style={{ color: 'var(--muted)' }}>แตะรูป แล้วกด ⭐ เพื่อเก็บไว้ดาวน์โหลดทีหลัง</span>
        </div>
      ) : (
        <div className="grid">
          {shown.map((p, i) => (
            <button key={p.id} className="tile" onClick={() => setActive(i)}>
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
              {favs.has(p.id) && <span className="fav-badge"><Icon name="star" size={12} filled /></span>}
              {p.hidden && <span className="hidden-badge"><Icon name="eyeOff" size={12} /></span>}
              {p.likeCount > 0 && (
                <span className="tile-like"><Icon name="heart" size={11} filled /> {p.likeCount}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div ref={sentinel} style={{ height: 1 }} />
      {!favOnly && !done && photos.length < count && (
        <button className="btn secondary" style={{ margin: '14px auto', maxWidth: 240 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
        </button>
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
