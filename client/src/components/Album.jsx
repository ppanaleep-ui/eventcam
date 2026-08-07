import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getGuestId } from '../lib/guest.js';
import { favSet } from '../lib/favorites.js';
import { saveToDevice, produceFromImageFile } from '../lib/capture.js';
import { getFilm, FILMS } from '../lib/filters.js';
import { primaryDescriptorForUrl, cachedDescriptors, distance, MATCH_THRESHOLD } from '../lib/faces.js';
import Lightbox from './Lightbox.jsx';
import Icon from './Icon.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'video', label: 'Videos' },
];

export default function Album({ eventId, photos, setPhotos, count, isHost, adminToken, guestName, locked, revealAt, onDeleted, onUpdate, onUploaded, onToast }) {
  const [active, setActive] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [pendingFiles, setPendingFiles] = useState(null); // files picked, awaiting confirm
  const [uploadVisible, setUploadVisible] = useState(true); // let others see this upload?
  const [uploadFilter, setUploadFilter] = useState('original'); // film to apply to uploads
  const [faceScan, setFaceScan] = useState(null); // {done,total} while searching
  const [faceMatchIds, setFaceMatchIds] = useState(null); // Set of matching ids | null
  const faceRef = useRef(null);
  const sentinel = useRef(null);
  const pressTimer = useRef(null);
  const suppressClick = useRef(false);
  const fileRef = useRef(null);
  const albumRef = useRef(null);
  const drag = useRef({ active: false, intent: 'add', seen: new Set(), x: 0, y: 0 });
  const edgeTimer = useRef(null);
  const startPt = useRef({ x: 0, y: 0 });
  const touchBlock = useRef(null);

  const myGuestId = getGuestId();
  const favs = favSet(eventId);
  const shown = photos.filter(
    (p) =>
      (typeFilter === 'all' || p.kind === typeFilter || (typeFilter === 'photo' && !p.kind)) &&
      (!favOnly || favs.has(p.id)) &&
      (!mineOnly || (p.ownerId && p.ownerId === myGuestId)) &&
      (!faceMatchIds || faceMatchIds.has(p.id))
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || done || photos.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = photos[photos.length - 1].createdAt;
      const { items } = await api.listPhotos(eventId, { before: oldest, limit: 60, token: adminToken });
      if (items.length === 0) setDone(true);
      else setPhotos((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...items.filter((p) => !ids.has(p.id))];
      });
    } catch {
      /* retry via button */
    } finally {
      setLoadingMore(false);
    }
  }, [eventId, photos, loadingMore, done, setPhotos, adminToken]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || favOnly || mineOnly || typeFilter !== 'all') return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, favOnly, mineOnly, typeFilter]);

  useEffect(() => () => clearInterval(edgeTimer.current), []);

  // ---- selection ----
  function applySel(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      drag.current.intent === 'add' ? n.add(id) : n.delete(id);
      return n;
    });
  }
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
    endDrag();
  }
  // Selection gestures:
  //  • Not in select mode: press-and-hold a photo to enter select mode (and
  //    start painting). A normal swipe just scrolls / browses.
  //  • In select mode: a mostly-HORIZONTAL swipe paints across photos; a
  //    mostly-VERTICAL swipe scrolls as usual — so you can always scroll up,
  //    and drag-select "just works" without holding.
  function tilePointerDown(e, id, curSel) {
    startPt.current = { x: e.clientX, y: e.clientY, id, sel: curSel };
    drag.current.decided = false;
    clearTimeout(pressTimer.current);
    if (selectMode) return; // decide paint-vs-scroll on first move
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setSelectMode(true);
      armDrag(id, curSel);
      if (navigator.vibrate) navigator.vibrate(12);
    }, 300);
  }
  function armDrag(id, curSel) {
    drag.current = { active: true, decided: true, intent: curSel ? 'remove' : 'add', seen: new Set([id]), x: startPt.current.x, y: startPt.current.y };
    applySel(id);
    suppressClick.current = true;
    startEdgeScroll();
    const a = albumRef.current;
    if (a) {
      touchBlock.current = (ev) => ev.preventDefault();
      a.addEventListener('touchmove', touchBlock.current, { passive: false });
    }
  }
  function selectUnderPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const tile = el && el.closest && el.closest('.tile');
    const id = tile && tile.dataset.id;
    if (id && !drag.current.seen.has(id)) {
      drag.current.seen.add(id);
      applySel(id);
    }
  }
  function gridPointerMove(e) {
    const dx = e.clientX - startPt.current.x;
    const dy = e.clientY - startPt.current.y;
    if (!selectMode) {
      // A real move before the hold fires = a scroll gesture → cancel the arm.
      if (pressTimer.current && Math.hypot(dx, dy) > 12) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    } else if (!drag.current.active && !drag.current.decided && Math.hypot(dx, dy) > 12) {
      // First real move in select mode decides the gesture.
      drag.current.decided = true;
      if (Math.abs(dx) >= Math.abs(dy)) armDrag(startPt.current.id, startPt.current.sel); // horizontal → paint
      // vertical → leave it: native scroll runs
    }
    if (!drag.current.active) return;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    selectUnderPoint(e.clientX, e.clientY);
  }
  function endDrag() {
    clearTimeout(pressTimer.current);
    pressTimer.current = null;
    drag.current.active = false;
    drag.current.decided = false;
    clearInterval(edgeTimer.current);
    const a = albumRef.current;
    if (a && touchBlock.current) {
      a.removeEventListener('touchmove', touchBlock.current, { passive: false });
      touchBlock.current = null;
    }
  }
  function startEdgeScroll() {
    clearInterval(edgeTimer.current);
    edgeTimer.current = setInterval(() => {
      const a = albumRef.current;
      if (!a || !drag.current.active) return;
      const r = a.getBoundingClientRect();
      const y = drag.current.y;
      let d = 0;
      if (y < r.top + 80) d = -16;
      else if (y > r.bottom - 90) d = 16;
      if (d) {
        a.scrollTop += d;
        selectUnderPoint(drag.current.x, drag.current.y);
      }
    }, 16);
  }
  function onTileClick(i, id) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!selectMode) setActive(i);
    else toggleSel(id);
  }

  async function downloadSelected() {
    const items = photos.filter((p) => selected.has(p.id));
    if (!items.length) return;
    setSaving(true);
    onToast?.('Preparing files…');
    const files = [];
    for (const p of items) {
      try {
        const b = await (await fetch(p.url)).blob();
        const ext = p.kind === 'video' ? guessExt(p.url) : 'jpg';
        files.push(new File([b], `eventcam-${p.id}.${ext}`, { type: b.type || 'application/octet-stream' }));
      } catch {}
    }
    setSaving(false);
    if (!files.length) return onToast?.('Download failed');
    try {
      if (navigator.canShare && navigator.canShare({ files })) await navigator.share({ files });
      else for (const f of files) await saveToDevice(f, f.name);
      onToast?.(`Saved ${files.length} files to your device`);
      exitSelect();
    } catch (e) {
      if (e && e.name !== 'AbortError') onToast?.('Save failed');
    }
  }

  // Delete the selected items the viewer is allowed to remove (own uploads, or
  // anything if host). Others in the selection are skipped.
  async function deleteSelected() {
    const items = photos.filter((p) => selected.has(p.id) && (isHost || (p.ownerId && p.ownerId === myGuestId)));
    if (!items.length) return onToast?.('You can only delete photos you uploaded');
    if (!window.confirm(`Permanently delete these ${items.length} items?`)) return;
    setSaving(true);
    let ok = 0;
    for (const p of items) {
      try {
        await api.deletePhoto(eventId, p.id, isHost ? adminToken : undefined);
        onDeleted?.(p.id);
        ok++;
      } catch {}
    }
    setSaving(false);
    onToast?.(`Deleted ${ok}/${items.length} items`);
    exitSelect();
  }

  // Count of the current selection the viewer can delete (drives the button).
  const deletableCount = photos.reduce(
    (n, p) => n + (selected.has(p.id) && (isHost || (p.ownerId && p.ownerId === myGuestId)) ? 1 : 0),
    0
  );

  // ---- face search (all on-device) ----
  // Load every page of the album so the whole event is searched, not just what
  // has scrolled into view.
  async function loadAllPhotos() {
    let all = [...photos];
    const ids = new Set(all.map((p) => p.id));
    let before = all.length ? all[all.length - 1].createdAt : undefined;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { items } = await api.listPhotos(eventId, { before, limit: 60, token: adminToken });
      const fresh = items.filter((p) => !ids.has(p.id));
      fresh.forEach((p) => ids.add(p.id));
      all = all.concat(fresh);
      if (items.length < 60) break;
      before = items[items.length - 1].createdAt;
    }
    setPhotos(all);
    setDone(true);
    return all;
  }

  async function onFacePick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const refUrl = URL.createObjectURL(file);
    setFaceScan({ done: 0, total: 0, phase: 'model' });
    onToast?.('Setting up face search…');
    let ref;
    try {
      ref = await primaryDescriptorForUrl(refUrl);
    } catch {
      setFaceScan(null);
      URL.revokeObjectURL(refUrl);
      return onToast?.('Couldn’t load face search');
    }
    URL.revokeObjectURL(refUrl);
    if (!ref) {
      setFaceScan(null);
      return onToast?.('No face found in this photo — try one with a clear face');
    }

    const all = await loadAllPhotos();
    const targets = all.filter((p) => p.kind !== 'video' && p.url);
    const matches = new Set();
    for (let i = 0; i < targets.length; i++) {
      setFaceScan({ done: i, total: targets.length, phase: 'scan' });
      try {
        const descs = await cachedDescriptors(targets[i].id, targets[i].url);
        if (descs.some((d) => distance(d, ref) < MATCH_THRESHOLD)) matches.add(targets[i].id);
      } catch { /* skip unreadable image */ }
    }
    setFaceScan(null);
    setFaceMatchIds(matches);
    // Clear conflicting filters so the matches actually show.
    setMineOnly(false);
    setFavOnly(false);
    setTypeFilter('all');
    onToast?.(matches.size ? `Found ${matches.size} photos with this face ✨` : 'No photos with this face');
  }

  // ---- upload from album ----
  // Step 1: pick files, then show a confirm sheet where the uploader chooses
  // (at the moment of confirming, per upload) whether others may see them.
  function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploadVisible(true); // default: everyone can see (can turn off each time)
    setUploadFilter('original');
    setPendingFiles(files);
  }

  // Step 2: confirm — do the actual uploads with the chosen visibility.
  async function confirmUpload() {
    const files = pendingFiles || [];
    setPendingFiles(null);
    if (!files.length) return;
    const visible = uploadVisible;
    const film = getFilm(uploadFilter);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploading(`${i + 1}/${files.length}`);
      try {
        if (f.type.startsWith('video/')) {
          const dto = await api.uploadMedia(eventId, { full: f, guestName, kind: 'video', hidden: !visible });
          onUploaded?.(dto);
        } else {
          const r = await produceFromImageFile(f, film, { temp: 0, exposure: 0 });
          const dto = await api.uploadMedia(eventId, { full: r.fullBlob, thumb: r.thumbBlob, guestName, kind: 'photo', filter: film.id, width: r.width, height: r.height, hidden: !visible });
          onUploaded?.(dto);
        }
        ok++;
      } catch {}
    }
    setUploading('');
    onToast?.(visible ? `Added ${ok}/${files.length} to the album ✨` : `Added ${ok}/${files.length} privately 🔒`);
  }

  const uploadFab = (
    <>
      <button className="album-fab" onClick={() => fileRef.current?.click()} aria-label="Upload photos">
        {uploading ? <span className="fab-count">{uploading}</span> : <Icon name="imagePlus" size={26} />}
      </button>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onPickFiles} hidden />
    </>
  );

  const uploadSheet = pendingFiles && (
    <div className="up-sheet-scrim" onClick={() => setPendingFiles(null)}>
      <div className="up-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="up-sheet-grip" />
        <h3>Upload {pendingFiles.length} items</h3>
        <p>Pick a film and choose whether others can see them.</p>
        <div className="up-films">
          {FILMS.map((f) => (
            <button
              key={f.id}
              className={`film-chip ${uploadFilter === f.id ? 'active' : ''}`}
              onClick={() => setUploadFilter(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <button className={`vis-toggle ${uploadVisible ? '' : 'off'}`} onClick={() => setUploadVisible((v) => !v)}>
          <Icon name={uploadVisible ? 'user' : 'eyeOff'} size={18} />
          <span>{uploadVisible ? 'Everyone can see' : 'Private (only you & the host)'}</span>
          <span className={`switch ${uploadVisible ? 'on' : ''}`} aria-hidden="true"><i /></span>
        </button>
        <div className="up-sheet-actions">
          <button className="btn ghost" onClick={() => setPendingFiles(null)}>Cancel</button>
          <button className="btn" onClick={confirmUpload}>Upload</button>
        </div>
      </div>
    </div>
  );

  // Gallery locked for guests (reveal-after not yet reached).
  if (locked) {
    return (
      <div className="album" ref={albumRef}>
        <div className="empty">
          <div className="empty-ic"><Icon name="clock" size={30} /></div>
          <b>Photos revealed after the event</b>
          <span style={{ color: 'var(--muted)' }}>
            {revealAt
              ? `The album unlocks on ${new Date(revealAt).toLocaleString()}. Keep shooting — your photos are safe!`
              : 'The host will reveal the album once the event ends. Keep shooting!'}
          </span>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="album" ref={albumRef}>
        <div className="empty">
          <div className="empty-ic"><Icon name="images" size={30} /></div>
          <b>No photos yet</b>
          <span style={{ color: 'var(--muted)' }}>Be the first — shoot from the Camera tab, or tap ＋ to upload</span>
        </div>
        {uploadFab}
        {uploadSheet}
      </div>
    );
  }

  return (
    <div className="album" ref={albumRef}>
      {selectMode ? (
        <div className="album-head select">
          <button className="link-btn" onClick={exitSelect}>Cancel</button>
          <span className="album-count">{selected.size ? `${selected.size} selected` : 'Swipe to select'}</span>
          <button className="link-btn" onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>Select all</button>
        </div>
      ) : (
        <div className="album-head">
          <div className="seg-filter">
            {FILTERS.map((f) => (
              <button key={f.id} className={typeFilter === f.id ? 'on' : ''} onClick={() => setTypeFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          <div className="album-head-tools">
            <button className="fav-filter" onClick={() => faceRef.current?.click()} aria-label="Search by face">
              <Icon name="scanface" size={16} /> Faces
            </button>
            <button className={`fav-filter ${mineOnly ? 'on' : ''}`} onClick={() => setMineOnly((v) => !v)} aria-label="Only my photos">
              <Icon name="user" size={16} /> Mine
            </button>
            <button className={`fav-filter ${favOnly ? 'on' : ''}`} onClick={() => setFavOnly((v) => !v)} aria-label="Favorites">
              <Icon name="star" size={16} filled={favOnly} />
            </button>
          </div>
        </div>
      )}
      <input ref={faceRef} type="file" accept="image/*" onChange={onFacePick} hidden />

      {faceMatchIds && !selectMode && (
        <div className="face-banner">
          <span><Icon name="scanface" size={16} /> Photos with this face · {faceMatchIds.size}</span>
          <button className="link-btn" onClick={() => setFaceMatchIds(null)}>Clear</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty" style={{ padding: '48px 20px' }}>
          <div className="empty-ic"><Icon name={favOnly ? 'star' : typeFilter === 'video' ? 'video' : 'images'} size={28} /></div>
          <b>{favOnly ? 'No favorites yet' : 'Nothing here yet'}</b>
          <span style={{ color: 'var(--muted)' }}>{favOnly ? 'Tap a photo, then ⭐ to save it' : 'Try a different filter above'}</span>
        </div>
      ) : (
        <div
          className={`grid ${selectMode ? 'selecting' : ''}`}
          onPointerMove={gridPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {shown.map((p, i) => {
            const sel = selected.has(p.id);
            return (
              <button
                key={p.id}
                data-id={p.id}
                className={`tile ${sel ? 'sel' : ''}`}
                onClick={() => onTileClick(i, p.id)}
                onPointerDown={(e) => tilePointerDown(e, p.id, sel)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {p.kind === 'video' && !p.thumbUrl ? (
                  <div className="vid-holder" />
                ) : (
                  <img src={p.thumbUrl || p.url} alt="" loading="lazy" draggable={false} onLoad={(e) => e.currentTarget.classList.add('loaded')} />
                )}
                {p.kind === 'video' && (
                  <>
                    <span className="vid-play"><Icon name="play" size={18} /></span>
                    {p.duration ? <span className="vid-badge">{fmtDur(p.duration)}</span> : null}
                  </>
                )}
                {favs.has(p.id) && !selectMode && <span className="fav-badge"><Icon name="star" size={12} filled /></span>}
                {p.hidden && !selectMode && <span className="hidden-badge"><Icon name="eyeOff" size={12} /></span>}
                {p.likeCount > 0 && !selectMode && <span className="tile-like"><Icon name="heart" size={11} filled /> {p.likeCount}</span>}
                {selectMode && <span className={`sel-ring ${sel ? 'on' : ''}`}>{sel && <Icon name="check" size={14} strokeWidth={3} />}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div ref={sentinel} style={{ height: 1 }} />
      {!favOnly && !mineOnly && typeFilter === 'all' && !done && photos.length < count && (
        <button className="btn secondary" style={{ margin: '14px auto', maxWidth: 240 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}

      {!selectMode && uploadFab}
      {uploadSheet}

      {selectMode && selected.size > 0 && (
        <div className="select-bar">
          <button className="btn" onClick={downloadSelected} disabled={saving}>
            <Icon name="download" size={20} /> {saving ? 'Saving…' : `Download ${selected.size}`}
          </button>
          {deletableCount > 0 && (
            <button className="btn danger" onClick={deleteSelected} disabled={saving}>
              <Icon name="trash" size={19} /> Delete {deletableCount}
            </button>
          )}
        </div>
      )}

      {faceScan && (
        <div className="face-scan-overlay">
          <div className="face-scan-card">
            <div className="spinner" />
            <b>{faceScan.phase === 'model' ? 'Setting up face search…' : 'Searching faces…'}</b>
            {faceScan.phase === 'model' && (
              <span className="face-scan-hint">The first time takes a little longer — we download the face model to your device once. After that it's quick.</span>
            )}
            {faceScan.phase === 'scan' && faceScan.total > 0 && (
              <>
                <span>{faceScan.done} / {faceScan.total} photos</span>
                <div className="face-scan-bar"><div style={{ width: `${Math.round((faceScan.done / faceScan.total) * 100)}%` }} /></div>
              </>
            )}
            <span className="face-scan-note">Runs entirely on your device — face data never leaves your phone.</span>
          </div>
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
