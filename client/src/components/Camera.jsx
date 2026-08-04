import { useEffect, useRef, useState } from 'react';
import { FILMS, getFilm } from '../lib/filters.js';
import { ASPECTS, getAspect, produceImages, produceFromImageFile, videoPoster, saveToDevice } from '../lib/capture.js';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const MAX_VIDEO_SECS = 20;
const FORMAT_LABEL = { full: '35mm', '1:1': '6×6', '4:5': '645', '9:16': 'CINE' };

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

export default function Camera({ eventId, guestName, onUploaded, onToast }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countRef = useRef(null);
  const fileRef = useRef(null);

  const [mode, setMode] = useState('photo');
  const [facing, setFacing] = useState('environment');
  const [filmId, setFilmId] = useState('classic');
  const [aspectId, setAspectId] = useState('9:16');
  const [temp, setTemp] = useState(0);
  const [exposure, setExposure] = useState(0);
  const [selfTimer, setSelfTimer] = useState(0); // 0 | 3 | 10
  const [countdown, setCountdown] = useState(null);
  const [camState, setCamState] = useState('starting');
  const [shot, setShot] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const film = getFilm(filmId);
  const aspect = getAspect(aspectId);
  const videoSupported = pickVideoMime() !== null;
  const adjust = { temp, exposure };

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

  useEffect(() => () => { stopStream(); clearInterval(countRef.current); }, []);

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
    const result = await produceImages(video, video.videoWidth, video.videoHeight, film, aspect.ratio, adjust);
    stopStream();
    setShot({ kind: 'photo', ...result });
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
      onToast?.('อุปกรณ์นี้อัดวิดีโอไม่ได้');
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      clearInterval(timerRef.current);
      const base = (rec.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: base });
      const ext = base.includes('mp4') ? 'mp4' : base.includes('quicktime') ? 'mov' : 'webm';
      const poster = await videoPoster(blob);
      stopStream();
      setShot({ kind: 'video', fullBlob: blob, thumbBlob: poster.thumbBlob, width: poster.width, height: poster.height, duration: poster.duration, ext, videoUrl: URL.createObjectURL(blob) });
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

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.type.startsWith('video/')) {
        const poster = await videoPoster(file);
        const base = file.type.split(';')[0] || 'video/mp4';
        const ext = base.includes('webm') ? 'webm' : base.includes('quicktime') ? 'mov' : 'mp4';
        setShot({ kind: 'video', fullBlob: file, thumbBlob: poster.thumbBlob, width: poster.width, height: poster.height, duration: poster.duration, ext, videoUrl: URL.createObjectURL(file) });
      } else {
        const result = await produceFromImageFile(file, film, adjust);
        setShot({ kind: 'photo', ...result });
      }
      stopStream();
    } catch {
      onToast?.('เปิดไฟล์นี้ไม่ได้');
    }
  }

  function retake() {
    if (shot?.videoUrl) URL.revokeObjectURL(shot.videoUrl);
    setShot(null);
    setProgress(null);
  }
  function saveShot() {
    if (!shot) return;
    const stamp = Date.now();
    saveToDevice(shot.fullBlob, shot.kind === 'video' ? `eventcam-${stamp}.${shot.ext || 'webm'}` : `eventcam-${stamp}.jpg`);
    onToast?.('บันทึกลงเครื่องแล้ว');
  }
  async function send() {
    if (!shot) return;
    setProgress(0);
    try {
      const dto = await api.uploadMedia(eventId, {
        full: shot.fullBlob, thumb: shot.thumbBlob, guestName, kind: shot.kind,
        filter: shot.kind === 'photo' ? film.id : null, width: shot.width, height: shot.height,
        duration: shot.duration, onProgress: setProgress,
      });
      onUploaded?.(dto);
      onToast?.(shot.kind === 'video' ? 'เพิ่มวิดีโอแล้ว ✨' : 'เพิ่มรูปแล้ว ✨');
      retake();
    } catch (err) {
      onToast?.(err.message || 'อัปโหลดไม่สำเร็จ');
      setProgress(null);
    }
  }

  // ---- Review ----
  if (shot) {
    return (
      <div className="camera">
        <div className="viewport">
          {progress !== null && <div className="upload-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          {shot.kind === 'video'
            ? <video className="review-media" src={shot.videoUrl} controls playsInline autoPlay loop muted />
            : <img className="review-media" src={shot.previewUrl} alt="ภาพที่ถ่าย" />}
        </div>
        <div className="review-actions">
          <button className="btn ghost" onClick={retake} disabled={progress !== null}>ถ่ายใหม่</button>
          <button className="round-btn" onClick={saveShot} disabled={progress !== null} aria-label="บันทึกลงเครื่อง"><Icon name="download" size={20} /></button>
          <button className="btn" onClick={send} disabled={progress !== null}>{progress !== null ? `กำลังส่ง ${Math.round(progress * 100)}%` : 'เพิ่มลงอัลบั้ม'}</button>
        </div>
      </div>
    );
  }

  // ---- Live ----
  return (
    <div className="camera">
      <div className="viewport">
        <video ref={videoRef} className={facing === 'user' ? 'mirror' : ''} style={{ filter: liveFilter }} playsInline muted />
        <div className="cam-overlay" />

        {camState === 'live' && mode === 'photo' && (
          <>
            <div className="format-label">{FORMAT_LABEL[aspectId] || '35mm'}</div>
            {aspect.ratio && <div className="frame-guide" style={{ aspectRatio: String(aspect.ratio) }} />}
          </>
        )}

        {countdown !== null && <div className="countdown">{countdown}</div>}
        {recording && <div className="rec-badge"><span className="rec-dot" /> {String(recSecs).padStart(2, '0')}s / {MAX_VIDEO_SECS}s</div>}

        {camState !== 'live' && (
          <div className="cam-message">
            {camState === 'starting' && <><div className="spinner" /><div>กำลังเปิดกล้อง…</div></>}
            {camState === 'denied' && <><div className="big">🚫</div><div>กล้องถูกปิดกั้น เปิดสิทธิ์กล้องในเบราว์เซอร์ หรือใช้ปุ่มคลังภาพด้านล่าง</div></>}
            {camState === 'error' && <><div className="big">📷</div><div>เปิดกล้องในแอปไม่ได้ ลองใช้ปุ่มคลังภาพด้านล่างแทน</div></>}
          </div>
        )}

        {/* Film picker */}
        {camState === 'live' && mode === 'photo' && (
          <div className="film-strip">
            {FILMS.map((f) => (
              <button key={f.id} className={`film-chip ${f.id === filmId ? 'active' : ''}`} onClick={() => setFilmId(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Adjustments (photo mode) */}
      {mode === 'photo' && (
        <div className="adjust-row">
          <label className="adjust">
            <span>☀ แสง</span>
            <input type="range" min="-2" max="2" step="0.1" value={exposure} onChange={(e) => setExposure(Number(e.target.value))} />
          </label>
          <label className="adjust">
            <span>🌡 อุ่น/เย็น</span>
            <input type="range" min="-100" max="100" step="5" value={temp} onChange={(e) => setTemp(Number(e.target.value))} />
          </label>
        </div>
      )}

      {/* aspect + timer + mode */}
      <div className="opt-row">
        {mode === 'photo' &&
          ASPECTS.map((a) => (
            <button key={a.id} className={`aspect-chip ${a.id === aspectId ? 'active' : ''}`} onClick={() => setAspectId(a.id)}>{a.label}</button>
          ))}
        {mode === 'photo' && (
          <button className={`aspect-chip ${selfTimer ? 'active' : ''}`} onClick={() => setSelfTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))}>
            ⏱ {selfTimer ? `${selfTimer}s` : 'OFF'}
          </button>
        )}
      </div>

      <div className="mode-row">
        <button className={`mode-tab ${mode === 'photo' ? 'active' : ''}`} onClick={() => !recording && setMode('photo')}><Icon name="camera" size={17} /> รูป</button>
        {videoSupported && <button className={`mode-tab ${mode === 'video' ? 'active' : ''}`} onClick={() => setMode('video')}><Icon name="video" size={17} /> วิดีโอ</button>}
      </div>

      <div className="cam-controls">
        <button className="round-btn" onClick={() => fileRef.current?.click()} aria-label="กล้องมือถือหรือคลังภาพ"><Icon name="images" size={22} /></button>
        <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" onChange={onPickFile} hidden />
        <button
          className={`shutter ${mode === 'video' ? 'video' : ''} ${recording ? 'recording' : ''}`}
          onClick={onShutter}
          disabled={camState !== 'live' || countdown !== null}
          aria-label={mode === 'video' ? (recording ? 'หยุดอัด' : 'อัดวิดีโอ') : 'ถ่ายรูป'}
        />
        <button className="round-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} disabled={recording} aria-label="สลับกล้อง"><Icon name="refresh" size={22} /></button>
      </div>
    </div>
  );
}
