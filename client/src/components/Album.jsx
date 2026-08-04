import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Lightbox from './Lightbox.jsx';

export default function Album({ eventId, photos, setPhotos, count }) {
  const [active, setActive] = useState(null); // index into photos for lightbox
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || done || photos.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = photos[photos.length - 1].createdAt;
      const { items } = await api.listPhotos(eventId, { before: oldest, limit: 60 });
      if (items.length === 0) {
        setDone(true);
      } else {
        setPhotos((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const fresh = items.filter((p) => !ids.has(p.id));
          return [...prev, ...fresh];
        });
      }
    } catch {
      /* keep the button available to retry */
    } finally {
      setLoadingMore(false);
    }
  }, [eventId, photos, loadingMore, done, setPhotos]);

  // Auto-load older photos as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (photos.length === 0) {
    return (
      <div className="album">
        <div className="empty">
          <div className="big">🖼️</div>
          <b>No photos yet</b>
          <span style={{ color: 'var(--muted)' }}>
            Be the first — head to the Camera tab and snap something.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="album">
      <div className="grid">
        {photos.map((p, i) => (
          <button key={p.id} className="tile" onClick={() => setActive(i)}>
            <img
              src={p.thumbUrl || p.url}
              alt={p.guestName ? `Photo by ${p.guestName}` : 'Event photo'}
              loading="lazy"
              width={p.width || undefined}
              height={p.height || undefined}
            />
            {p.guestName && <div className="who">{p.guestName}</div>}
          </button>
        ))}
      </div>

      <div ref={sentinel} style={{ height: 1 }} />
      {!done && photos.length < count && (
        <button
          className="btn secondary"
          style={{ margin: '14px auto', maxWidth: 240 }}
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {active !== null && (
        <Lightbox
          photos={photos}
          index={active}
          onClose={() => setActive(null)}
          onIndex={setActive}
        />
      )}
    </div>
  );
}
