import { useEffect, useRef, useState } from 'react';
import { FILTERS, getFilter } from '../lib/filters.js';
import { ASPECTS, getAspect, produceImages, produceFromImageFile, videoPoster, saveToDevice } from '../lib/capture.js';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const MAX_VIDEO_SECS = 20;

function pickVideoMime() {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of candidates) {
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
  const fileRef = useRef(null);

  const [mode, setMode] = useState('photo'); // photo | video
  const [facing, setFacing] = useState('environment');
  const [filterId, setFilterId] = useState('classic');
  const [aspectId, setAspectId] = useState('9:16');
  const [camState, setCamState] = useState('starting'); // starting | live | denied | error
  const [shot, setShot] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const preset = getFilter(filterId);
  const aspect = getAspect(aspectId);
  const videoSupported = pickVideoMime() !== null;

  // (Re)start the camera when facing/mode changes (video mode also needs audio).
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

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // ---- Photo capture ----
  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const result = await produceImages(video, video.videoWidth, video.videoHeight, preset, aspect.ratio);
    stopStream();
    setShot({ kind: 'photo', ...result });
  }

  // ---- Video record ----
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
      setShot({
        kind: 'video',
        fullBlob: blob,
        thumbBlob: poster.thumbBlob,
        width: poster.width,
        height: poster.height,
        duration: poster.duration,
        ext,
        base,
        videoUrl: URL.createObjectURL(blob),
      });
      setRecording(false);
      setRecSecs(0);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setRecSecs(0);
    timerRef.current = setInterval(() => {
      setRecSecs((s) => {
        if (s + 1 >= MAX_VIDEO_SECS) stopRecording();
        return s + 1;
      });
    }, 1000);
  }
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
    }
  }

  // ---- Native camera / gallery import ----
  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.type.startsWith('video/')) {
        const poster = await videoPoster(file);
        const base = file.type.split(';')[0] || 'video/mp4';
        const ext = base.includes('webm') ? 'webm' : base.includes('quicktime') ? 'mov' : 'mp4';
        setShot({
          kind: 'video',
          fullBlob: file,
          thumbBlob: poster.thumbBlob,
          width: poster.width,
          height: poster.height,
          duration: poster.duration,
          ext,
          base,
          videoUrl: URL.createObjectURL(file),
        });
      } else {
        // Native photo — keep its own frame, apply the chosen filter.
        const result = await produceFromImageFile(file, preset);
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
    if (shot.kind === 'video') saveToDevice(shot.fullBlob, `eventcam-${stamp}.${shot.ext || 'webm'}`);
    else saveToDevice(shot.fullBlob, `eventcam-${stamp}.jpg`);
    onToast?.('บันทึกลงเครื่องแล้ว');
  }

  async function send() {
    if (!shot) return;
    setProgress(0);
    try {
      const dto = await api.uploadMedia(eventId, {
        full: shot.fullBlob,
        thumb: shot.thumbBlob,
        guestName,
        kind: shot.kind,
        filter: shot.kind === 'photo' ? preset.id : null,
        width: shot.width,
        height: shot.height,
        duration: shot.duration,
        onProgress: setProgress,
      });
      onUploaded?.(dto);
      onToast?.(shot.kind === 'video' ? 'เพิ่มวิดีโอแล้ว ✨' : 'เพิ่มรูปแล้ว ✨');
      retake();
    } catch (err) {
      onToast?.(err.message || 'อัปโหลดไม่สำเร็จ');
      setProgress(null);
    }
  }

  // ---- Review screen ----
  if (shot) {
    return (
      <div className="camera">
        <div className="viewport">
          {progress !== null && (
            <div className="upload-bar">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {shot.kind === 'video' ? (
            <video className="review-media" src={shot.videoUrl} controls playsInline autoPlay loop muted />
          ) : (
            <img className="review-media" src={shot.previewUrl} alt="ภาพที่ถ่าย" />
          )}
        </div>
        <div className="review-actions">
          <button className="btn ghost" onClick={retake} disabled={progress !== null}>
            ถ่ายใหม่
          </button>
          <button className="round-btn" onClick={saveShot} disabled={progress !== null} title="บันทึกลงเครื่อง" aria-label="บันทึกลงเครื่อง">
            <Icon name="download" size={20} />
          </button>
          <button className="btn" onClick={send} disabled={progress !== null}>
            {progress !== null ? `กำลังส่ง ${Math.round(progress * 100)}%` : 'เพิ่มลงอัลบั้ม'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Live camera ----
  return (
    <div className="camera">
      <div className="viewport">
        <video
          ref={videoRef}
          className={facing === 'user' ? 'mirror' : ''}
          style={{ filter: mode === 'photo' && preset.css !== 'none' ? preset.css : 'none' }}
          playsInline
          muted
        />
        <div className="cam-overlay" />

        {/* aspect framing guide (photo mode) */}
        {camState === 'live' && mode === 'photo' && aspect.ratio && (
          <div className="frame-guide" style={{ aspectRatio: String(aspect.ratio) }} />
        )}

        {recording && (
          <div className="rec-badge">
            <span className="rec-dot" /> {String(recSecs).padStart(2, '0')}s / {MAX_VIDEO_SECS}s
          </div>
        )}

        {camState !== 'live' && (
          <div className="cam-message">
            {camState === 'starting' && (
              <>
                <div className="spinner" />
                <div>กำลังเปิดกล้อง…</div>
              </>
            )}
            {camState === 'denied' && (
              <>
                <div className="big">🚫</div>
                <div>กล้องถูกปิดกั้น เปิดสิทธิ์กล้องในเบราว์เซอร์แล้วรีเฟรช หรือใช้ปุ่ม “กล้องมือถือ” ด้านล่าง</div>
              </>
            )}
            {camState === 'error' && (
              <>
                <div className="big">📷</div>
                <div>เปิดกล้องในแอปไม่ได้ ลองใช้ปุ่ม “กล้องมือถือ” ด้านล่างแทน</div>
              </>
            )}
          </div>
        )}

        {/* filter strip (photo mode only) */}
        {camState === 'live' && mode === 'photo' && (
          <div className="filter-strip">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`filter-chip ${f.id === filterId ? 'active' : ''}`}
                onClick={() => setFilterId(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* aspect selector (photo mode) */}
      {mode === 'photo' && (
        <div className="aspect-row">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              className={`aspect-chip ${a.id === aspectId ? 'active' : ''}`}
              onClick={() => setAspectId(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* mode toggle */}
      <div className="mode-row">
        <button className={`mode-tab ${mode === 'photo' ? 'active' : ''}`} onClick={() => !recording && setMode('photo')}>
          <Icon name="camera" size={17} /> รูป
        </button>
        {videoSupported && (
          <button className={`mode-tab ${mode === 'video' ? 'active' : ''}`} onClick={() => setMode('video')}>
            <Icon name="video" size={17} /> วิดีโอ
          </button>
        )}
      </div>

      <div className="cam-controls">
        <button className="round-btn" onClick={() => fileRef.current?.click()} title="กล้องมือถือ / คลังภาพ" aria-label="กล้องมือถือหรือคลังภาพ">
          <Icon name="images" size={22} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" onChange={onPickFile} hidden />

        {mode === 'photo' ? (
          <button className="shutter" onClick={capturePhoto} disabled={camState !== 'live'} aria-label="ถ่ายรูป" />
        ) : (
          <button
            className={`shutter video ${recording ? 'recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
            disabled={camState !== 'live'}
            aria-label={recording ? 'หยุดอัด' : 'เริ่มอัดวิดีโอ'}
          />
        )}

        <button
          className="round-btn"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          disabled={recording}
          aria-label="สลับกล้อง"
        >
          <Icon name="refresh" size={22} />
        </button>
      </div>
    </div>
  );
}
