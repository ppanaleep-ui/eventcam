import { useEffect, useRef, useState } from 'react';
import { FILMS, getFilm } from '../lib/filters.js';
import { ASPECTS, getAspect, produceImages, produceFromImageFile, regrade, videoPoster, saveToDevice } from '../lib/capture.js';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const MAX_VIDEO_SECS = 20;

function pickVideoMime() {
  const c = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of c) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return '';
}

export default function Camera({ eventId, guestName, defaultFilter, onUploaded, onToast }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const fileRef = useRef(null);

  const [mode, setMode] = useState('photo');
  const [facing, setFacing] = useState('environment');
  const [filmId, setFilmId] = useState(defaultFilter || 'kodak'); // host's default; guests can change
  const [aspectId, setAspectId] = useState('2:3'); // default: 35mm portrait
  const [temp, setTemp] = useState(0);
  const [exposure, setExposure] = useState(0);
  const [selfTimer, setSelfTimer] = useState(0); // 0 | 3 | 10
  const [countdown, setCountdown] = useState(null);
  const [camState, setCamState] = useState('starting');
  const [shot, setShot] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [showAdjust, setShowAdjust] = useState(false);
  const [visible, setVisible] = useState(true); // show this upload to everyone?
  const [leak, setLeak] = useState(0); // random light-leak amount 0..100
  const [timestamp, setTimestamp] = useState('auto'); // auto | on | off
  const [grid, setGrid] = useState(false); // extra grid in full-screen view
  const [lowLight, setLowLight] = useState(false);
  const [viewMode, setViewMode] = useState('framed'); // framed (viewfinder) | full
  const [fs, setFs] = useState(false); // immersive full-screen (no browser chrome)
  const [zoom, setZoom] = useState(1);
  const [zoomStops, setZoomStops] = useState([1, 2]);
  const [regrading, setRegrading] = useState(false); // re-applying a film in review
  const [batch, setBatch] = useState(null); // files picked for bulk upload, awaiting confirm
  const [batchFilter, setBatchFilter] = useState('original');
  const [batchVisible, setBatchVisible] = useState(true);
  const hwZoomRef = useRef(false); // camera exposes an optical/HW zoom track

  const film = getFilm(filmId);
  const aspect = getAspect(aspectId);
  const videoSupported = pickVideoMime() !== null;
  const adjust = { temp, exposure, leak: leak / 100, stamp: timestamp };
  const cycleAspect = () => setAspectId((id) => {
    const i = ASPECTS.findIndex((a) => a.id === id);
    return ASPECTS[(i + 1) % ASPECTS.length].id;
  });
  const cycleZoom = () => setZoom((z) => {
    const i = zoomStops.indexOf(z);
    return zoomStops[(i + 1) % zoomStops.length] ?? 1;
  });
  // Mirror the front-camera *preview* only, so it feels like a mirror (what you
  // see when you look at yourself) — the natural selfie experience. The captured
  // photo is drawn from the raw video frame, so the saved image is NOT mirrored.
  const digitalScale = !hwZoomRef.current && zoom > 1 ? zoom : 1;
  const camTransform =
    `${facing === 'user' ? 'scaleX(-1) ' : ''}${digitalScale > 1 ? `scale(${digitalScale})` : ''}`.trim() || undefined;

  // Drive the real lens when we have a HW zoom track.
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!hwZoomRef.current || !track) return;
    const caps = track.getCapabilities?.() || {};
    const z = Math.min(caps.zoom?.max ?? zoom, Math.max(caps.zoom?.min ?? 1, zoom));
    track.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
  }, [zoom, camState]);

  // Immersive full-screen — hides the app header + tab bar (via body.immersive)
  // so the camera fills the whole screen, and also asks the browser to drop its
  // own chrome. The Fullscreen API works on Android/desktop; iOS Safari blocks
  // it on non-video elements, but the app-chrome still collapses so it still
  // "goes full-screen" from the guest's point of view.
  async function toggleFullscreen() {
    const next = !fs;
    setFs(next);
    try {
      if (next) {
        if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      /* iOS: no Fullscreen API — the immersive app-chrome collapse is enough. */
    }
  }

  function resetAdjust() {
    setExposure(0);
    setTemp(0);
    setLeak(0);
    setTimestamp('auto');
    setGrid(false);
    setSelfTimer(0);
    setViewMode('framed');
    setAspectId('2:3');
    onToast?.('Reset to defaults');
  }

  // Reflect the immersive state onto <body> so Event.jsx's header + tab bar hide.
  useEffect(() => {
    document.body.classList.toggle('immersive', fs);
    return () => document.body.classList.remove('immersive');
  }, [fs]);

  // If the browser leaves real full-screen (Android back / system gesture),
  // drop our immersive state too so the UI comes back in sync.
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFs(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      stopStream();
      setCamState('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: mode === 'video',
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // Detect hardware zoom so the zoom pill can drive the real lens; else we
        // fall back to a centre-crop digital zoom (applied on capture).
        try {
          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities?.() || {};
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            hwZoomRef.current = true;
            const stops = [];
            if (caps.zoom.min <= 0.6) stops.push(0.5);
            stops.push(1);
            if (caps.zoom.max >= 2) stops.push(2);
            setZoomStops(stops.length > 1 ? stops : [1, 2]);
          } else {
            hwZoomRef.current = false;
            setZoomStops([1, 2]);
          }
        } catch {
          hwZoomRef.current = false;
          setZoomStops([1, 2]);
        }
        setZoom(1);
        setCamState('live');
      } catch (err) {
        if (!cancelled) setCamState(err?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    }
    if (!shot) start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, mode, shot]);

  useEffect(() => () => {
    stopStream();
    clearInterval(countRef.current);
    document.body.classList.remove('immersive');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }, []);

  // Low-light hint: sample the frame's average brightness periodically.
  useEffect(() => {
    if (camState !== 'live' || shot) return;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const cx = c.getContext('2d');
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      try {
        cx.drawImage(v, 0, 0, 16, 16);
        const d = cx.getImageData(0, 0, 16, 16).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        setLowLight(sum / (d.length / 4) < 42);
      } catch {}
    }, 900);
    return () => clearInterval(id);
  }, [camState, shot]);

  function stopStream() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Live preview filter approximation (real grade is baked in on capture).
  const liveFilter = mode === 'photo' && film.css !== 'none'
    ? `${film.css} brightness(${Math.pow(2, exposure * 0.6).toFixed(3)})`
    : 'none';

  async function doCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const captureAdjust = { ...adjust, zoom: hwZoomRef.current ? 1 : zoom, mirror: facing === 'user' };
    const result = await produceImages(video, video.videoWidth, video.videoHeight, film, aspect.ratio, captureAdjust);
    stopStream();
    setShot({ kind: 'photo', ...result, filter: film.id });
  }

  function onShutter() {
    if (mode === 'video') return recording ? stopRecording() : startRecording();
    if (selfTimer > 0) return runCountdown();
    doCapture();
  }

  function runCountdown() {
    setCountdown(selfTimer);
    countRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(countRef.current);
          setCountdown(null);
          doCapture();
          return null;
        }
        return n - 1;
      });
    }, 1000);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickVideoMime() || '';
    let rec;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      onToast?.('This device can’t record video');
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      clearInterval(timerRef.current);
      const base = (rec.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: base });
      const ext = base.includes('mp4') ? 'mp4' : base.includes('quicktime') ? 'mov' : 'webm';
      showVideoShot(blob, ext); // shows review instantly; poster fills in async
      setRecording(false);
      setRecSecs(0);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setRecSecs(0);
    timerRef.current = setInterval(() => setRecSecs((s) => { if (s + 1 >= MAX_VIDEO_SECS) stopRecording(); return s + 1; }), 1000);
  }
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
  }

  // Show a video in review immediately; generate its poster in the background
  // so importing/recording a clip feels instant (poster decode can be slow).
  function showVideoShot(blob, ext) {
    const videoUrl = URL.createObjectURL(blob);
    stopStream();
    setShot({ kind: 'video', fullBlob: blob, thumbBlob: null, width: 0, height: 0, duration: null, ext, videoUrl });
    videoPoster(blob)
      .then((poster) =>
        setShot((prev) =>
          prev && prev.videoUrl === videoUrl
            ? { ...prev, thumbBlob: poster.thumbBlob, width: poster.width, height: poster.height, duration: poster.duration }
            : prev
        )
      )
      .catch(() => {});
  }

  function videoExt(type) {
    const base = (type || '').split(';')[0];
    return base.includes('webm') ? 'webm' : base.includes('quicktime') ? 'mov' : 'mp4';
  }

  // Upload many files at once (picked from the gallery), applying the chosen
  // film + visibility from the confirm sheet.
  async function batchUpload(files, filmId, vis) {
    const chosen = getFilm(filmId || 'original');
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress((i) / files.length);
      onToast?.(`Uploading ${i + 1}/${files.length}…`);
      try {
        if (f.type.startsWith('video/')) {
          const dto = await api.uploadMedia(eventId, { full: f, guestName, kind: 'video', hidden: !vis });
          onUploaded?.(dto);
        } else {
          const r = await produceFromImageFile(f, chosen, { temp: 0, exposure: 0 });
          const dto = await api.uploadMedia(eventId, { full: r.fullBlob, thumb: r.thumbBlob, guestName, kind: 'photo', filter: chosen.id, width: r.width, height: r.height, hidden: !vis });
          onUploaded?.(dto);
        }
        ok++;
      } catch {
        /* skip the failed file */
      }
    }
    setProgress(null);
    onToast?.(vis ? `Added ${ok}/${files.length} to the album ✨` : `Added ${ok}/${files.length} privately 🔒`);
  }

  async function confirmBatch() {
    const files = batch;
    setBatch(null);
    if (files && files.length) await batchUpload(files, batchFilter, batchVisible);
  }

  async function onPickFile(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;

    // Multiple files → confirm sheet (film + visibility) before uploading.
    if (files.length > 1) {
      setBatchFilter('original');
      setBatchVisible(true);
      setBatch(files);
      return;
    }

    const file = files[0];
    try {
      if (file.type.startsWith('video/')) {
        showVideoShot(file, videoExt(file.type));
      } else {
        const result = await produceFromImageFile(file, film, adjust);
        stopStream();
        setShot({ kind: 'photo', ...result, filter: film.id });
      }
    } catch {
      onToast?.('Couldn’t open this file');
    }
  }

  function retake() {
    if (shot?.videoUrl) URL.revokeObjectURL(shot.videoUrl);
    setShot(null);
    setProgress(null);
  }
  // Re-apply a different film to the photo in review (uses the kept raw frame).
  async function chooseReviewFilm(id) {
    if (!shot?.rawCanvas || shot.filter === id || regrading) return;
    setRegrading(true);
    try {
      const r = await regrade(shot.rawCanvas, getFilm(id), adjust);
      setShot((prev) => (prev ? { ...prev, ...r, filter: id } : prev));
    } catch {
      onToast?.('Could not apply that film');
    } finally {
      setRegrading(false);
    }
  }
  async function saveShot() {
    if (!shot) return;
    const stamp = Date.now();
    const fn = shot.kind === 'video' ? `eventcam-${stamp}.${shot.ext || 'mp4'}` : `eventcam-${stamp}.jpg`;
    try {
      const r = await saveToDevice(shot.fullBlob, fn);
      if (r !== 'cancelled') onToast?.('Saved to your device');
    } catch {
      onToast?.('Save failed');
    }
  }
  async function send() {
    if (!shot) return;
    setProgress(0);
    try {
      const dto = await api.uploadMedia(eventId, {
        full: shot.fullBlob, thumb: shot.thumbBlob, guestName, kind: shot.kind,
        filter: shot.kind === 'photo' ? (shot.filter || film.id) : null, width: shot.width, height: shot.height,
        duration: shot.duration, hidden: !visible, onProgress: setProgress,
      });
      onUploaded?.(dto);
      onToast?.(visible ? (shot.kind === 'video' ? 'Video added ✨' : 'Photo added ✨') : 'Added privately 🔒');
      retake();
    } catch (err) {
      onToast?.(err.message || 'Upload failed');
      setProgress(null);
    }
  }

  // ---- Review (full-bleed) ----
  if (shot) {
    return (
      <div className="camera ig review">
        {shot.kind === 'video'
          ? <video className="cam-feed contain" src={shot.videoUrl} controls playsInline autoPlay loop muted />
          : <img className="cam-feed contain" src={shot.previewUrl} alt="Captured photo" />}
        {progress !== null && <div className="upload-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <div className="cam-scrim bottom" />

        <div className="cam-bottom">
          {shot.kind === 'photo' && shot.rawCanvas && (
            <div className={`film-strip review-films ${regrading ? 'busy' : ''}`}>
              {FILMS.map((f) => (
                <button
                  key={f.id}
                  className={`film-chip ${f.id === shot.filter ? 'active' : ''}`}
                  onClick={() => chooseReviewFilm(f.id)}
                  disabled={progress !== null || regrading}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
          <button className={`vis-toggle ${visible ? '' : 'off'}`} onClick={() => setVisible((v) => !v)} disabled={progress !== null}>
            <Icon name={visible ? 'user' : 'eyeOff'} size={18} />
            <span>{visible ? 'Everyone can see' : 'Private (only you & the host)'}</span>
            <span className={`switch ${visible ? 'on' : ''}`} aria-hidden="true"><i /></span>
          </button>
          <div className="review-actions">
            <button className="btn ghost" onClick={retake} disabled={progress !== null}>Retake</button>
            <button className="round-btn light" onClick={saveShot} disabled={progress !== null} aria-label="Save to device"><Icon name="download" size={20} /></button>
            <button className="btn" onClick={send} disabled={progress !== null}>{progress !== null ? `Sending ${Math.round(progress * 100)}%` : 'Add to album'}</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Live (Instagram-style full-bleed camera) ----
  const showZoom = camState === 'live' && zoomStops.length > 1 && !countdown;
  return (
    <div className={`camera ig ${mode === 'video' ? 'mode-video' : ''} ${recording ? 'is-recording' : ''}`}>
      <video ref={videoRef} className="cam-feed" style={{ filter: liveFilter, transform: camTransform }} playsInline muted />
      <div className="cam-scrim top" />
      <div className="cam-scrim bottom" />

      {countdown !== null && <div className="countdown">{countdown}</div>}
      {recording && (
        <div className="rec-badge">
          <span className="rec-dot" /> REC {String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}
        </div>
      )}
      {grid && camState === 'live' && viewMode !== 'framed' && !recording && <div className="cam-grid" aria-hidden="true" />}
      {viewMode === 'framed' && camState === 'live' && mode === 'photo' && (
        <div className="cam-frame-wrap" aria-hidden="true">
          <div className="cam-frame" style={{ aspectRatio: String(aspect.ratio || 2 / 3) }}>
            <span className="frame-label">{aspect.label}</span>
            <div className="frame-grid" />
          </div>
        </div>
      )}
      {lowLight && camState === 'live' && mode === 'photo' && !countdown && !recording && (
        <div className="lowlight-pill"><span /> Low Light</div>
      )}

      {showZoom && (
        <button className="cam-zoom" onClick={cycleZoom} aria-label="Zoom">
          {zoom === 0.5 ? '.5' : zoom}<span>×</span>
        </button>
      )}

      {/* Top floating bar (hidden while recording for a clean frame) */}
      {!recording && (
      <div className="cam-top">
        <button className="cam-pill" onClick={cycleAspect} aria-label="Aspect ratio">
          {aspect.label}
        </button>
        <div className="cam-top-right">
          <button className="cam-ico" onClick={toggleFullscreen} aria-label={fs ? 'Exit full screen' : 'Full screen'}>
            <Icon name={fs ? 'shrink' : 'expand'} size={21} />
          </button>
          {mode === 'photo' && (
            <button className={`cam-ico ${selfTimer ? 'on' : ''}`} onClick={() => setSelfTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))} aria-label="Self-timer">
              <Icon name="timer" size={22} />
              {selfTimer > 0 && <em>{selfTimer}</em>}
            </button>
          )}
          {mode === 'photo' && (
            <button className={`cam-ico ${showAdjust ? 'on' : ''}`} onClick={() => setShowAdjust((s) => !s)} aria-label="Adjust exposure/color">
              <Icon name="sliders" size={22} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Adjust popover */}
      {showAdjust && mode === 'photo' && (
        <>
          <div className="adjust-scrim" onClick={() => setShowAdjust(false)} aria-hidden="true" />
          <div className="adjust-pop glass" role="dialog">
            <div className="adjust-head">
              <b>Camera settings</b>
              <button className="adjust-reset" onClick={resetAdjust}><Icon name="reset" size={15} /> Reset</button>
            </div>

            <label className="adjust">
              <span><Icon name="sun" size={16} /> Exposure <em>{exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)}</em></span>
              <input type="range" min="-2" max="2" step="0.1" value={exposure} onChange={(e) => setExposure(Number(e.target.value))} />
            </label>
            <label className="adjust">
              <span><Icon name="thermo" size={16} /> Warmth <em>{temp > 0 ? `+${temp}` : temp}</em></span>
              <input className="temp-slider" type="range" min="-100" max="100" step="5" value={temp} onChange={(e) => setTemp(Number(e.target.value))} />
            </label>
            <label className="adjust">
              <span><Icon name="sparkles" size={16} /> Light leak <em>{leak}%</em></span>
              <input type="range" min="0" max="100" step="5" value={leak} onChange={(e) => setLeak(Number(e.target.value))} />
            </label>

            <div className="set-row">
              <span><Icon name="frame" size={16} /> View</span>
              <div className="mini-seg">
                {[['framed', 'Framed'], ['full', 'Full']].map(([v, l]) => (
                  <button key={v} className={viewMode === v ? 'on' : ''} onClick={() => setViewMode(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <span><Icon name="calendar" size={16} /> Date</span>
              <div className="mini-seg">
                {[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => (
                  <button key={v} className={timestamp === v ? 'on' : ''} onClick={() => setTimestamp(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <span><Icon name="grid" size={16} /> Grid</span>
              <button className={`mini-toggle ${grid ? 'on' : ''}`} onClick={() => setGrid((g) => !g)} aria-label="Grid"><i /></button>
            </div>
          </div>
        </>
      )}

      {camState !== 'live' && (
        <div className="cam-message">
          {camState === 'starting' && <><div className="spinner" /><div>Starting camera…</div></>}
          {camState === 'denied' && <><div className="big">🚫</div><div>Camera is blocked. Enable camera access in your browser, or tap ▢ to pick from your gallery.</div></>}
          {camState === 'error' && <><div className="big">📷</div><div>Couldn’t open the camera. Tap ▢ to pick from your gallery instead.</div></>}
        </div>
      )}

      {/* Bottom cluster — clean stop button while recording, full controls otherwise */}
      {recording ? (
        <div className="cam-bottom recording">
          <button className="rec-stop" onClick={stopRecording} aria-label="Stop recording">
            <RecRing progress={Math.min(1, recSecs / MAX_VIDEO_SECS)} />
            <span className="rec-stop-sq" />
          </button>
        </div>
      ) : (
        <div className="cam-bottom">
          {camState === 'live' && mode === 'photo' && (
            <div className="film-strip">
              {FILMS.map((f) => (
                <button key={f.id} className={`film-chip ${f.id === filmId ? 'active' : ''}`} onClick={() => setFilmId(f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
          )}

          <div className="shutter-row">
            <button className="thumb-btn" onClick={() => fileRef.current?.click()} aria-label="Upload from device">
              <Icon name="imagePlus" size={24} />
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onPickFile} hidden />
            <button
              className={`shutter ${mode === 'video' ? 'video' : ''}`}
              onClick={onShutter}
              disabled={camState !== 'live' || countdown !== null}
              aria-label={mode === 'video' ? 'Record video' : 'Take photo'}
            />
            <button className="flip-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Flip camera"><Icon name="refresh" size={24} /></button>
          </div>

          <div className="mode-switch">
            <button className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')}>Photo</button>
            {videoSupported && <button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')}>Video</button>}
          </div>
        </div>
      )}

      {batch && (
        <div className="up-sheet-scrim" onClick={() => setBatch(null)}>
          <div className="up-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="up-sheet-grip" />
            <h3>Upload {batch.length} items</h3>
            <p>Pick a film and choose whether others can see them.</p>
            <div className="up-films">
              {FILMS.map((f) => (
                <button key={f.id} className={`film-chip ${batchFilter === f.id ? 'active' : ''}`} onClick={() => setBatchFilter(f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
            <button className={`vis-toggle ${batchVisible ? '' : 'off'}`} onClick={() => setBatchVisible((v) => !v)}>
              <Icon name={batchVisible ? 'user' : 'eyeOff'} size={18} />
              <span>{batchVisible ? 'Everyone can see' : 'Private (only you & the host)'}</span>
              <span className={`switch ${batchVisible ? 'on' : ''}`} aria-hidden="true"><i /></span>
            </button>
            <div className="up-sheet-actions">
              <button className="btn ghost" onClick={() => setBatch(null)}>Cancel</button>
              <button className="btn" onClick={confirmBatch}>Upload</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rose circular progress ring around the video stop button.
function RecRing({ progress }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rec-ring" width="78" height="78" viewBox="0 0 78 78" aria-hidden="true">
      <circle cx="39" cy="39" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3.5" />
      <circle
        cx="39" cy="39" r={r} fill="none" stroke="#f2a9c0" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 39 39)"
      />
    </svg>
  );
}
