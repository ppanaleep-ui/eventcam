import { useEffect } from 'react';
import { api } from '../lib/api.js';

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
  onToast,
}) {
  const photo = photos[index];
  const isVideo = photo?.kind === 'video';
  const canDelete = !!photo && (isHost || (photo.ownerId && photo.ownerId === myGuestId));
  const ext = isVideo ? guessVideoExt(photo?.url) : 'jpg';

  async function remove() {
    if (!photo) return;
    const msg = isHost ? 'ลบไฟล์นี้ออกจากทุกเครื่อง?' : 'ลบไฟล์ของคุณ?';
    if (!window.confirm(msg)) return;
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

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(index + 1, photos.length - 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;

  async function download() {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eventcam-${photo.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(photo.url, '_blank');
    }
  }

  async function share() {
    try {
      if (navigator.share && navigator.canShare) {
        const res = await fetch(photo.url);
        const blob = await res.blob();
        const file = new File([blob], `eventcam-${photo.id}.${ext}`, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
      download();
    } catch {
      /* user cancelled share sheet */
    }
  }

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {photo.guestName ? `${isVideo ? '🎬' : '📸'} ${photo.guestName}` : isVideo ? 'วิดีโอในงาน' : 'ภาพในงาน'}
        </div>
        <button className="round-btn" onClick={onClose} aria-label="ปิด">
          ✕
        </button>
      </div>
      <div className="img-wrap" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video src={photo.url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        ) : (
          <img src={photo.url} alt={photo.guestName ? `ภาพโดย ${photo.guestName}` : 'ภาพในงาน'} />
        )}
      </div>
      <div className="lb-foot" onClick={(e) => e.stopPropagation()}>
        {canDelete && (
          <button className="btn danger" onClick={remove} aria-label="ลบ">
            🗑
          </button>
        )}
        <button className="btn secondary" onClick={download}>
          ⬇ บันทึก
        </button>
        <button className="btn" onClick={share}>
          แชร์
        </button>
      </div>
    </div>
  );
}

function guessVideoExt(url = '') {
  const m = url.toLowerCase().match(/\.(mp4|webm|mov)(\?|$)/);
  return m ? m[1] : 'mp4';
}
