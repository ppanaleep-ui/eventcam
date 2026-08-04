import { useEffect, useRef, useState } from 'react';
import { FILTERS, getFilter } from '../lib/filters.js';
import { produceImages } from '../lib/capture.js';
import { api } from '../lib/api.js';

export default function Camera({ eventId, guestName, onUploaded, onToast }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [filterId, setFilterId] = useState('classic');
  const [camState, setCamState] = useState('starting'); // starting | live | denied | error
  const [shot, setShot] = useState(null); // { blobs, previewUrl }
  const [progress, setProgress] = useState(null); // 0..1 while uploading

  const preset = getFilter(filterId);

  // (Re)start the camera stream when the facing direction changes.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      stop();
      setCamState('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamState('live');
      } catch (err) {
        if (cancelled) return;
        setCamState(err?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    }
    // Only run the live camera when we're not reviewing a shot.
    if (!shot) start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, shot]);

  useEffect(() => () => stop(), []);

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const result = await produceImages(video, vw, vh, preset);
    stop(); // free the camera while the guest reviews
    setShot({
      ...result,
      previewUrl: result.previewCanvas.toDataURL('image/jpeg', 0.85),
    });
  }

  function retake() {
    setShot(null);
    setProgress(null);
  }

  async function send() {
    if (!shot) return;
    setProgress(0);
    try {
      const dto = await api.uploadPhoto(eventId, {
        full: shot.fullBlob,
        thumb: shot.thumbBlob,
        guestName,
        filter: preset.id,
        width: shot.width,
        height: shot.height,
        onProgress: setProgress,
      });
      onUploaded?.(dto);
      onToast?.('Added to the album ✨');
      setShot(null);
      setProgress(null);
    } catch (err) {
      onToast?.(err.message || 'Upload failed');
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
          <img className="preview" src={shot.previewUrl} alt="Your shot" />
        </div>
        <div className="review-actions">
          <button className="btn ghost" onClick={retake} disabled={progress !== null}>
            Retake
          </button>
          <button className="btn" onClick={send} disabled={progress !== null}>
            {progress !== null ? `Sending ${Math.round(progress * 100)}%` : 'Add to album'}
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
          style={{ filter: preset.css !== 'none' ? preset.css : 'none' }}
          playsInline
          muted
        />
        <div className="cam-overlay" />

        {camState !== 'live' && (
          <div className="cam-message">
            {camState === 'starting' && (
              <>
                <div className="spinner" />
                <div>Starting camera…</div>
              </>
            )}
            {camState === 'denied' && (
              <>
                <div className="big">🚫</div>
                <div>
                  Camera access was blocked. Enable it in your browser settings, then reload to
                  start snapping.
                </div>
              </>
            )}
            {camState === 'error' && (
              <>
                <div className="big">📷</div>
                <div>Couldn't open the camera on this device.</div>
              </>
            )}
          </div>
        )}

        {camState === 'live' && (
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

      <div className="cam-controls">
        <div style={{ width: 48 }} />
        <button className="shutter" onClick={capture} disabled={camState !== 'live'} aria-label="Take photo" />
        <button
          className="round-btn"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Switch camera"
        >
          🔄
        </button>
      </div>
    </div>
  );
}
