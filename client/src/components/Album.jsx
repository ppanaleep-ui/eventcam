import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getGuestId } from '../lib/guest.js';
import { favSet } from '../lib/favorites.js';
import { saveToDevice, produceFromImageFile } from '../lib/capture.js';
import { getFilm } from '../lib/filters.js';
import Lightbox from './Lightbox.jsx';
import Icon from './Icon.jsx';

const FILTERS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'photo', label: 'รูป' },
  { id: 'video', label: 'วิดีโอ' },
];

export default function Album({ eventId, photos, setPhotos, count, isHost, adminToken, guestName, onDeleted, onUpdate, onUploaded, onToast }) {
  const [active, setActive] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const sentinel = useRef(null);
  const pressTimer = useRef(null);
  const suppressClick = useRef(false);
  const fileRef = useRef(null);
  const albumRef = useRef(null);
  const drag = useRef({ active: false, intent: 'add', seen: new Set(), x: 0, y: 0 });
  const edgeTimer = useRef(null);

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
    if (!el || favOnly || typeFilter !== 'all') return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, favOnly, typeFilter]);

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
  function pressStart(id) {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setSelectMode(true);
      toggleSel(id);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 380);
  }
  function pressCancel() {
    clearTimeout(pressTimer.current);
  }
  function tilePointerDown(e, id, curSel) {
    if (selectMode) {
      drag.current = { active: true, intent: curSel ? 'remove' : 'add', seen: new Set([id]), x: e.clientX, y: e.clientY };
      applySel(id);
      suppressClick.current = true;
      startEdgeScroll();
    } else {
      pressStart(id);
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
    pressCancel();
    if (!drag.current.active) return;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    selectUnderPoint(e.clientX, e.clientY);
  }
  function endDrag() {
    pressCancel();
    drag.current.active = false;
    clearInterval(edgeTimer.current);
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
    onToast?.('กำลังเตรียมไฟล์…');
    const files = [];
    for (const p of items) {
      try {
        const b = await (await fetch(p.url)).blob();
        const ext = p.kind === 'video' ? guessExt(p.url) : 'jpg';
        files.push(new File([b], `eventcam-${p.id}.${ext}`, { type: b.type || 'application/octet-stream' }));
      } catch {}
    }
    setSaving(false);
    if (!files.length) return onToast?.('ดาวน์โหลดไม่สำเร็จ');
    try {
      if (navigator.canShare && navigator.canShare({ files })) await navigator.share({ files });
      else for (const f of files) await saveToDevice(f, f.name);
      onToast?.(`บันทึก ${files.length} ไฟล์ลงเครื่อง`);
      exitSelect();
    } catch (e) {
      if (e && e.name !== 'AbortError') onToast?.('บันทึกไม่สำเร็จ');
    }
  }

  // ---- upload from album ----
  async function onAlbumUpload(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const orig = getFilm('original');
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploading(`${i + 1}/${files.length}`);
      try {
        if (f.type.startsWith('video/')) {
          const dto = await api.uploadMedia(eventId, { full: f, guestName, kind: 'video' });
          onUploaded?.(dto);
        } else {
          const r = await produceFromImageFile(f, orig, { temp: 0, exposure: 0 });
          const dto = await api.uploadMedia(eventId, { full: r.fullBlob, thumb: r.thumbBlob, guestName, kind: 'photo', filter: 'original', width: r.width, height: r.height });
          onUploaded?.(dto);
        }
        ok++;
      } catch {}
    }
    setUploading('');
    onToast?.(`เพิ่ม ${ok}/${files.length} รูปลงอัลบั้มแล้ว ✨`);
  }

  const uploadFab = (
    <>
      <button className="album-fab" onClick={() => fileRef.current?.click()} aria-label="อัปโหลดรูป">
        {uploading ? <span className="fab-count">{uploading}</span> : <Icon name="imagePlus" size={26} />}
      </button>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onAlbumUpload} hidden />
    </>
  );

  if (photos.length === 0) {
    return (
      <div className="album" ref={albumRef}>
        <div className="empty">
          <div className="empty-ic"><Icon name="images" size={30} /></div>
          <b>ยังไม่มีรูป</b>
          <span style={{ color: 'var(--muted)' }}>เป็นคนแรก — ถ่ายจากแท็บกล้อง หรือกดปุ่ม ＋ อัปโหลด</span>
        </div>
        {uploadFab}
      </div>
    );
  }

  return (
    <div className="album" ref={albumRef}>
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
              <button key={f.id} className={typeFilter === f.id ? 'on' : ''} onClick={() => setTypeFilter(f.id)}>{f.label}</button>
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
          <span style={{ color: 'var(--muted)' }}>{favOnly ? 'แตะรูป แล้วกด ⭐ เพื่อเก็บไว้' : 'ลองเปลี่ยนตัวกรองด้านบน'}</span>
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
                onPointerUp={pressCancel}
                onPointerLeave={pressCancel}
                onContextMenu={(e) => e.preventDefault()}
              >
                {p.kind === 'video' && !p.thumbUrl ? (
                  <div className="vid-holder" />
                ) : (
                  <img src={p.thumbUrl || p.url} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add('loaded')} />
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
      {!favOnly && typeFilter === 'all' && !done && photos.length < count && (
        <button className="btn secondary" style={{ margin: '14px auto', maxWidth: 240 }} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
        </button>
      )}

      {!selectMode && uploadFab}

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
