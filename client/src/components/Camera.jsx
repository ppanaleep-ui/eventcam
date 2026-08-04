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
  const [showAdjust, setShowAdjust] = useState(false);
  const [visible, setVisible] = useState(true); // show this upload to everyone?

  const film = getFilm(filmId);
  const aspect = getAspect(aspectId);
  const videoSupported = pickVideoMime() !== null;
  const adjust = { temp, exposure };
  const cycleAspect = () => setAspectId((id) => {
    const i = ASPECTS.findIndex((a) => a.id === id);
    return ASPECTS[(i + 1) % ASPECTS.length].id;
  });

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
  async function saveShot() {
    if (!shot) return;
    const stamp = Date.now();
    const fn = shot.kind === 'video' ? `eventcam-${stamp}.${shot.ext || 'mp4'}` : `eventcam-${stamp}.jpg`;
    try {
      const r = await saveToDevice(shot.fullBlob, fn);
      if (r !== 'cancelled') onToast?.('บันทึกลงเครื่องแล้ว');
    } catch {
      onToast?.('บันทึกไม่สำเร็จ');
    }
  }
  async function send() {
    if (!shot) return;
    setProgress(0);
    try {
      const dto = await api.uploadMedia(eventId, {
        full: shot.fullBlob, thumb: shot.thumbBlob, guestName, kind: shot.kind,
        filter: shot.kind === 'photo' ? film.id : null, width: shot.width, height: shot.height,
        duration: shot.duration, hidden: !visible, onProgress: setProgress,
      });
      onUploaded?.(dto);
      onToast?.(visible ? (shot.kind === 'video' ? 'เพิ่มวิดีโอแล้ว ✨' : 'เพิ่มรูปแล้ว ✨') : 'เพิ่มแบบส่วนตัวแล้ว 🔒');
      retake();
    } catch (err) {
      onToast?.(err.message || 'อัปโหลดไม่สำเร็จ');
      setProgress(null);
    }
  }

  // ---- Review (full-bleed) ----
  if (shot) {
    return (
      <div className="camera ig review">
        {shot.kind === 'video'
          ? <video className="cam-feed contain" src={shot.videoUrl} controls playsInline autoPlay loop muted />
          : <img className="cam-feed contain" src={shot.previewUrl} alt="ภาพที่ถ่าย" />}
        {progress !== null && <div className="upload-bar"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <div className="cam-scrim bottom" />

        <div className="cam-bottom">
          <button className={`vis-toggle ${visible ? '' : 'off'}`} onClick={() => setVisible((v) => !v)} disabled={progress !== null}>
            <Icon name={visible ? 'user' : 'eyeOff'} size={18} />
            <span>{visible ? 'ทุกคนในงานเห็นได้' : 'ส่วนตัว (เฉพาะคุณ & เจ้าของงาน)'}</span>
            <span className={`switch ${visible ? 'on' : ''}`} aria-hidden="true"><i /></span>
          </button>
          <div className="review-actions">
            <button className="btn ghost" onClick={retake} disabled={progress !== null}>ถ่ายใหม่</button>
            <button className="round-btn light" onClick={saveShot} disabled={progress !== null} aria-label="บันทึกลงเครื่อง"><Icon name="download" size={20} /></button>
            <button className="btn" onClick={send} disabled={progress !== null}>{progress !== null ? `กำลังส่ง ${Math.round(progress * 100)}%` : 'เพิ่มลงอัลบั้ม'}</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Live (Instagram-style full-bleed camera) ----
  return (
    <div className="camera ig">
      <video ref={videoRef} className={`cam-feed ${facing === 'user' ? 'mirror' : ''}`} style={{ filter: liveFilter }} playsInline muted />
      <div className="cam-scrim top" />
      <div className="cam-scrim bottom" />

      {countdown !== null && <div className="countdown">{countdown}</div>}
      {recording && <div className="rec-badge"><span className="rec-dot" /> {String(recSecs).padStart(2, '0')}s / {MAX_VIDEO_SECS}s</div>}

      {/* Top floating bar */}
      <div className="cam-top">
        <button className="cam-pill" onClick={cycleAspect} aria-label="อัตราส่วน">
          {FORMAT_LABEL[aspectId] || '35mm'}
        </button>
        <div className="cam-top-right">
          {mode === 'photo' && (
            <button className={`cam-ico ${selfTimer ? 'on' : ''}`} onClick={() => setSelfTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0))} aria-label="ตั้งเวลา">
              <Icon name="timer" size={22} />
              {selfTimer > 0 && <em>{selfTimer}</em>}
            </button>
          )}
          {mode === 'photo' && (
            <button className={`cam-ico ${showAdjust ? 'on' : ''}`} onClick={() => setShowAdjust((s) => !s)} aria-label="ปรับแสง/สี">
              <Icon name="sliders" size={22} />
            </button>
          )}
        </div>
      </div>

      {/* Adjust popover */}
      {showAdjust && mode === 'photo' && (
        <div className="adjust-pop glass">
          <label className="adjust">
            <span>☀ แสง {exposure > 0 ? `+${exposure.toFixed(1)}` : exposure.toFixed(1)}</span>
            <input type="range" min="-2" max="2" step="0.1" value={exposure} onChange={(e) => setExposure(Number(e.target.value))} />
          </label>
          <label className="adjust">
            <span>🌡 อุ่น/เย็น {temp > 0 ? `+${temp}` : temp}</span>
            <input type="range" min="-100" max="100" step="5" value={temp} onChange={(e) => setTemp(Number(e.target.value))} />
          </label>
        </div>
      )}

      {camState !== 'live' && (
        <div className="cam-message">
          {camState === 'starting' && <><div className="spinner" /><div>กำลังเปิดกล้อง…</div></>}
          {camState === 'denied' && <><div className="big">🚫</div><div>กล้องถูกปิดกั้น เปิดสิทธิ์กล้องในเบราว์เซอร์ หรือแตะ ▢ เพื่อเลือกจากคลังภาพ</div></>}
          {camState === 'error' && <><div className="big">📷</div><div>เปิดกล้องในแอปไม่ได้ แตะ ▢ เพื่อเลือกจากคลังภาพแทน</div></>}
        </div>
      )}

      {/* Bottom floating cluster */}
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
          <button className="thumb-btn" onClick={() => fileRef.current?.click()} aria-label="อัปโหลดจากเครื่อง">
            <Icon name="imagePlus" size={24} />
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onPickFile} hidden />
          <button
            className={`shutter ${mode === 'video' ? 'video' : ''} ${recording ? 'recording' : ''}`}
            onClick={onShutter}
            disabled={camState !== 'live' || countdown !== null}
            aria-label={mode === 'video' ? (recording ? 'หยุดอัด' : 'อัดวิดีโอ') : 'ถ่ายรูป'}
          />
          <button className="flip-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} disabled={recording} aria-label="สลับกล้อง"><Icon name="refresh" size={24} /></button>
        </div>

        <div className="mode-switch">
          <button className={mode === 'photo' ? 'active' : ''} onClick={() => !recording && setMode('photo')}>รูป</button>
          {videoSupported && <button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')}>วิดีโอ</button>}
        </div>
      </div>
    </div>
  );
}
