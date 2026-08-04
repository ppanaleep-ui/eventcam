import { useEffect } from 'react';

export default function Lightbox({ photos, index, onClose, onIndex }) {
  const photo = photos[index];

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
      // Fetch as a blob so mobile browsers actually save rather than navigate.
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eventcam-${photo.id}.jpg`;
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
        const file = new File([blob], `eventcam-${photo.id}.jpg`, { type: 'image/jpeg' });
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
          {photo.guestName ? `📸 ${photo.guestName}` : 'Event photo'}
        </div>
        <button className="round-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="img-wrap" onClick={(e) => e.stopPropagation()}>
        <img src={photo.url} alt={photo.guestName ? `Photo by ${photo.guestName}` : 'Event photo'} />
      </div>
      <div className="lb-foot" onClick={(e) => e.stopPropagation()}>
        <button className="btn secondary" onClick={download}>
          ⬇ Save
        </button>
        <button className="btn" onClick={share}>
          Share
        </button>
      </div>
    </div>
  );
}
