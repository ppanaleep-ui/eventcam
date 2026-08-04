import { renderFilm, canvasToBlob } from './filters.js';

const MAX_FULL = 1920; // longest edge of the stored full image (crisp, >1080p)
const MAX_THUMB = 480; // longest edge of the album thumbnail / video poster
const FULL_Q = 0.9;
const THUMB_Q = 0.72;

// Frame options the guest can pick. `ratio` is width / height; null = keep the
// camera's native frame (no crop).
export const ASPECTS = [
  { id: 'full', label: 'เต็ม', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

export function getAspect(id) {
  return ASPECTS.find((a) => a.id === id) || ASPECTS[0];
}

function cropRect(sw, sh, ratio) {
  if (!ratio) return { sx: 0, sy: 0, cw: sw, ch: sh };
  const srcRatio = sw / sh;
  let cw = sw;
  let ch = sh;
  if (srcRatio > ratio) cw = Math.round(sh * ratio);
  else ch = Math.round(sw / ratio);
  return { sx: Math.round((sw - cw) / 2), sy: Math.round((sh - ch) / 2), cw, ch };
}

function fit(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * From a source frame, produce the two uploads (crisp full + thumbnail),
 * cropped to `ratio` and graded with `film` + adjustments (temp/exposure).
 */
export async function produceImages(source, sw, sh, film, ratio, opts) {
  const { sx, sy, cw, ch } = cropRect(sw, sh, ratio);
  const outSize = fit(cw, ch, MAX_FULL);

  const cropped = document.createElement('canvas');
  cropped.width = outSize.w;
  cropped.height = outSize.h;
  cropped.getContext('2d').drawImage(source, sx, sy, cw, ch, 0, 0, outSize.w, outSize.h);

  const fullCanvas = renderFilm(cropped, outSize.w, outSize.h, film, opts);
  const fullBlob = await canvasToBlob(fullCanvas, FULL_Q);

  const t = fit(outSize.w, outSize.h, MAX_THUMB);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = t.w;
  thumbCanvas.height = t.h;
  thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, t.w, t.h);
  const thumbBlob = await canvasToBlob(thumbCanvas, THUMB_Q);

  return {
    fullBlob,
    thumbBlob,
    width: outSize.w,
    height: outSize.h,
    previewUrl: fullCanvas.toDataURL('image/jpeg', FULL_Q),
  };
}

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Build uploads from a picked photo (native camera / gallery), graded too. */
export async function produceFromImageFile(file, film, opts) {
  const img = await loadImage(file);
  const sw = img.width || img.naturalWidth;
  const sh = img.height || img.naturalHeight;
  return produceImages(img, sw, sh, film, null, opts);
}

/** Poster thumbnail + dimensions from a video Blob (first frame). */
export function videoPoster(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const done = async () => {
      const sw = video.videoWidth || 720;
      const sh = video.videoHeight || 1280;
      const t = fit(sw, sh, MAX_THUMB);
      const c = document.createElement('canvas');
      c.width = t.w;
      c.height = t.h;
      try {
        c.getContext('2d').drawImage(video, 0, 0, t.w, t.h);
      } catch {}
      const thumbBlob = await canvasToBlob(c, THUMB_Q);
      URL.revokeObjectURL(url);
      resolve({ thumbBlob, width: sw, height: sh, duration: Math.round(video.duration) || null });
    };
    video.onloadeddata = () => {
      if (video.duration && video.currentTime < 0.1) {
        video.currentTime = Math.min(0.1, video.duration / 2);
        video.onseeked = done;
      } else done();
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ thumbBlob: null, width: 0, height: 0, duration: null });
    };
  });
}

// Save a file to the guest's device. On phones (esp. iOS, where <a download>
// is ignored) the native share sheet is the reliable way to save to Photos, so
// try that first and fall back to a download link on desktop.
export async function saveToDevice(blob, filename) {
  const type = blob.type || 'application/octet-stream';
  try {
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    // otherwise fall through to download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
