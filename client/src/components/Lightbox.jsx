import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { saveToDevice } from '../lib/capture.js';
import { isFav, toggleFav } from '../lib/favorites.js';
import { getGuestName } from '../lib/guest.js';
import Icon from './Icon.jsx';

export default function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
  eventId,
  isHost,
  adminToken,
  myGuestId,
  onDeleted,
  onUpdate,
  onToast,
}) {
  const photo = photos[index];
  const isVideo = photo?.kind === 'video';
  const canDelete = !!photo && (isHost || (photo.ownerId && photo.ownerId === myGuestId));
  const ext = isVideo ? guessVideoExt(photo?.url) : 'jpg';

  const [comments, setComments] = useState([]);
  const [loadingC, setLoadingC] = useState(false);
  const [text, setText] = useState('');
  const [fav, setFav] = useState(false);
  const [pop, setPop] = useState(false); // heart pop animation on double-tap
  const touch = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!photo) return;
    setFav(isFav(eventId, photo.id));
    setComments([]);
    setLoadingC(true);
    let alive = true;
    api
      .listComments(eventId, photo.id)
      .then((r) => alive && setComments(r.items || []))
      .catch(() => {})
      .finally(() => alive && setLoadingC(false));
    return () => {
      alive = false;
    };
  }, [eventId, photo?.id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!photo) return null;

  function go(dir) {
    const n = index + dir;
    if (n >= 0 && n < photos.length) onIndex(n);
  }

  async function like(force) {
    try {
      if (force && photo.liked) return; // double-tap only adds a like
      const r = await api.toggleLike(eventId, photo.id);
      onUpdate?.(photo.id, { liked: r.liked, likeCount: r.likeCount });
    } catch {
      onToast?.('กดถูกใจไม่สำเร็จ');
    }
  }

  function onMediaTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setPop(true);
      setTimeout(() => setPop(false), 700);
      like(true);
    }
    lastTap.current = now;
  }

  function onTouchStart(e) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose();
  }

  async function postComment(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const r = await api.addComment(eventId, photo.id, { text: t, name: getGuestName() });
      setComments((c) => [...c, r.comment]);
      onUpdate?.(photo.id, { commentCount: r.commentCount });
    } catch (err) {
      onToast?.(err.message || 'ส่งคอมเมนต์ไม่สำเร็จ');
      setText(t);
    }
  }

  function onFav() {
    setFav(toggleFav(eventId, photo.id));
  }

  async function remove() {
    if (!window.confirm(isHost ? 'ลบไฟล์นี้ออกจากทุกเครื่อง?' : 'ลบไฟล์ของคุณ?')) return;
    try {
      await api.deletePhoto(eventId, photo.id, isHost ? adminToken : undefined);
      onDeleted?.(photo.id);
      onToast?.('ลบแล้ว');
      if (photos.length <= 1) onClose();
      else onIndex(Math.min(index, photos.length - 2));
    } catch (err) {
      onToast?.(err.message || 'ลบไม่สำเร็จ');
    }
  }

  async function save() {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const r = await saveToDevice(blob, `eventcam-${photo.id}.${ext}`);
      if (r !== 'cancelled') onToast?.('บันทึกแล้ว');
    } catch {
      window.open(photo.url, '_blank');
    }
  }

  return (
    <div className="lightbox">
      <div className="lb-bar">
        <div className="lb-who">
          {photo.guestName ? `${isVideo ? '🎬' : '📸'} ${photo.guestName}` : isVideo ? 'วิดีโอในงาน' : 'ภาพในงาน'}
          {photo.hidden && <span className="lb-private"><Icon name="eyeOff" size={13} /> ส่วนตัว</span>}
        </div>
        <button className="round-btn light" onClick={onClose} aria-label="ปิด"><Icon name="close" size={20} /></button>
      </div>

      <div className="lb-media" onClick={onMediaTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {index > 0 && <button className="lb-nav left" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="ก่อนหน้า">‹</button>}
        {isVideo ? (
          <video src={photo.url} controls autoPlay playsInline />
        ) : (
          <img src={photo.url} alt={photo.guestName ? `ภาพโดย ${photo.guestName}` : 'ภาพในงาน'} />
        )}
        {index < photos.length - 1 && <button className="lb-nav right" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="ถัดไป">›</button>}
        {pop && <div className="heart-pop"><Icon name="heart" size={110} filled /></div>}
        <div className="lb-counter">{index + 1} / {photos.length}</div>
      </div>

      <div className="lb-actions">
        <button className={`lb-act ${photo.liked ? 'liked' : ''}`} onClick={() => like(false)}>
          <Icon name="heart" size={26} filled={!!photo.liked} />
          {photo.likeCount > 0 && <span>{photo.likeCount}</span>}
        </button>
        <button className="lb-act" onClick={() => document.getElementById('lb-input')?.focus()}>
          <Icon name="comment" size={24} />
          {photo.commentCount > 0 && <span>{photo.commentCount}</span>}
        </button>
        <button className={`lb-act ${fav ? 'fav' : ''}`} onClick={onFav} aria-label="รายการโปรด">
          <Icon name="star" size={25} filled={fav} />
        </button>
        <div style={{ flex: 1 }} />
        {canDelete && <button className="lb-act danger" onClick={remove} aria-label="ลบ"><Icon name="trash" size={22} /></button>}
        <button className="lb-act" onClick={save} aria-label="บันทึก"><Icon name="download" size={23} /></button>
      </div>

      <div className="lb-comments">
        {loadingC && <div className="lb-cnote">กำลังโหลดคอมเมนต์…</div>}
        {!loadingC && comments.length === 0 && <div className="lb-cnote">ยังไม่มีคอมเมนต์ — เป็นคนแรกสิ!</div>}
        {comments.map((c) => (
          <div className="lb-comment" key={c.id}>
            <b>{c.name || 'ผู้ร่วมงาน'}</b> {c.text}
          </div>
        ))}
      </div>

      <form className="lb-cinput" onSubmit={postComment}>
        <input id="lb-input" type="text" placeholder="เพิ่มคอมเมนต์…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
        <button type="submit" disabled={!text.trim()} aria-label="ส่ง"><Icon name="send" size={20} /></button>
      </form>
    </div>
  );
}

function guessVideoExt(url = '') {
  const m = url.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/);
  return m ? m[1] : 'mp4';
}
