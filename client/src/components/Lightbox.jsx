import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { saveToDevice } from '../lib/capture.js';
import { isFav, toggleFav } from '../lib/favorites.js';
import { getGuestName } from '../lib/guest.js';
import { getFilm } from '../lib/filters.js';
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
  const filmName = photo?.filter && photo.filter !== 'original' ? getFilm(photo.filter).name : null;

  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [text, setText] = useState('');
  const [fav, setFav] = useState(false);
  const [pop, setPop] = useState(false);
  const touch = useRef(null);
  const lastTap = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (!photo) return;
    setFav(isFav(eventId, photo.id));
    setComments([]);
    let alive = true;
    api.listComments(eventId, photo.id).then((r) => alive && setComments(r.items || [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [eventId, photo?.id]);

  useEffect(() => {
    if (showComments && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments, showComments]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') (showComments ? setShowComments(false) : onClose());
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
      if (force && photo.liked) return;
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
  async function share() {
    try {
      if (navigator.share) {
        const res = await fetch(photo.url);
        const blob = await res.blob();
        const file = new File([blob], `eventcam-${photo.id}.${ext}`, { type: blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file] });
        return navigator.share({ url: photo.url });
      }
      save();
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="lightbox dazz">
      <button className="lb-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={20} /></button>
      {filmName && <span className="lb-filmtag">#{filmName}</span>}

      <div className="lb-media" onClick={onMediaTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {index > 0 && <button className="lb-nav left" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="ก่อนหน้า">‹</button>}
        {isVideo ? <video src={photo.url} controls autoPlay playsInline /> : <img src={photo.url} alt="" />}
        {index < photos.length - 1 && <button className="lb-nav right" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="ถัดไป">›</button>}
        {pop && <div className="heart-pop"><Icon name="heart" size={110} filled /></div>}
        <div className="lb-counter">{index + 1} / {photos.length}</div>
        {photo.guestName && <div className="lb-by">{isVideo ? '🎬' : '📸'} {photo.guestName}</div>}
      </div>

      <div className="lb-bar2">
        <button className="cbtn" onClick={share} aria-label="แชร์"><Icon name="share" size={22} /></button>
        <div className="cbtn-group">
          <button className={`cbtn ${photo.liked ? 'liked' : ''}`} onClick={() => like(false)} aria-label="ถูกใจ">
            <Icon name="heart" size={24} filled={!!photo.liked} />
            {photo.likeCount > 0 && <em>{photo.likeCount}</em>}
          </button>
          <button className={`cbtn ${showComments ? 'on' : ''}`} onClick={() => setShowComments((s) => !s)} aria-label="คอมเมนต์">
            <Icon name="comment" size={22} />
            {photo.commentCount > 0 && <em>{photo.commentCount}</em>}
          </button>
          <button className={`cbtn ${fav ? 'fav' : ''}`} onClick={onFav} aria-label="รายการโปรด"><Icon name="star" size={23} filled={fav} /></button>
          <button className="cbtn" onClick={save} aria-label="บันทึก"><Icon name="download" size={22} /></button>
        </div>
        {canDelete ? (
          <button className="cbtn danger" onClick={remove} aria-label="ลบ"><Icon name="trash" size={21} /></button>
        ) : (
          <span className="cbtn ghost" aria-hidden="true" />
        )}
      </div>

      {showComments && (
        <div className="lb-comment-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="lb-sheet-head">
            <b>คอมเมนต์ {photo.commentCount > 0 ? `(${photo.commentCount})` : ''}</b>
            <button className="link-btn" onClick={() => setShowComments(false)}>ปิด</button>
          </div>
          <div className="lb-comments" ref={listRef}>
            {comments.length === 0 && <div className="lb-cnote">ยังไม่มีคอมเมนต์ — เป็นคนแรกสิ!</div>}
            {comments.map((c) => (
              <div className="lb-comment" key={c.id}><b>{c.name || 'ผู้ร่วมงาน'}</b> {c.text}</div>
            ))}
          </div>
          <form className="lb-cinput" onSubmit={postComment}>
            <input type="text" placeholder="เพิ่มคอมเมนต์…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
            <button type="submit" disabled={!text.trim()} aria-label="ส่ง"><Icon name="send" size={20} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

function guessVideoExt(url = '') {
  const m = url.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/);
  return m ? m[1] : 'mp4';
}
