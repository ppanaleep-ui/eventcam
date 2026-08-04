import { renderFiltered, canvasToBlob } from './filters.js';

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

// Centre-crop rectangle of a sw×sh source to the target ratio.
function cropRect(sw, sh, ratio) {
  if (!ratio) return { sx: 0, sy: 0, cw: sw, ch: sh };
  const srcRatio = sw / sh;
  let cw = sw;
  let ch = sh;
  if (srcRatio > ratio) {
    cw = Math.round(sh * ratio); // too wide → trim sides
  } else {
    ch = Math.round(sw / ratio); // too tall → trim top/bottom
  }
  return { sx: Math.round((sw - cw) / 2), sy: Math.round((sh - ch) / 2), cw, ch };
}

function fit(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Render a source frame (video/image/canvas) into the two uploads: a crisp
 * full image and a small thumbnail. Crops to `ratio` (null = native frame) and
 * applies the retro `preset`. All on-device.
 */
export async function produceImages(source, sw, sh, preset, ratio) {
  const { sx, sy, cw, ch } = cropRect(sw, sh, ratio);
  const out = fit(cw, ch, MAX_FULL);

  // 1) crop + scale to a plain canvas
  const cropped = document.createElement('canvas');
  cropped.width = out.w;
  cropped.height = out.h;
  cropped.getContext('2d').drawImage(source, sx, sy, cw, ch, 0, 0, out.w, out.h);

  // 2) apply filter + overlays
  const fullCanvas = renderFiltered(cropped, out.w, out.h, out.w, out.h, preset);
  const fullBlob = await canvasToBlob(fullCanvas, FULL_Q);

  // 3) thumbnail from the finished full canvas (same look, cheaper)
  const t = fit(out.w, out.h, MAX_THUMB);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = t.w;
  thumbCanvas.height = t.h;
  thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, t.w, t.h);
  const thumbBlob = await canvasToBlob(thumbCanvas, THUMB_Q);

  return {
    fullBlob,
    thumbBlob,
    width: out.w,
    height: out.h,
    previewUrl: fullCanvas.toDataURL('image/jpeg', FULL_Q),
  };
}

// Load an image File/Blob into something drawable.
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

/**
 * Build uploads from a photo the guest picked with their native camera / gallery.
 * Keeps the native frame, just downscales for delivery and makes a thumbnail.
 */
export async function produceFromImageFile(file, preset) {
  const img = await loadImage(file);
  const sw = img.width || img.naturalWidth;
  const sh = img.height || img.naturalHeight;
  return produceImages(img, sw, sh, preset, null);
}

/**
 * Build a poster thumbnail + dimensions from a video Blob (first frame).
 */
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
      // Seek a hair in so the frame isn't black.
      if (video.duration && video.currentTime < 0.1) {
        video.currentTime = Math.min(0.1, video.duration / 2);
        video.onseeked = done;
      } else {
        done();
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ thumbBlob: null, width: 0, height: 0, duration: null });
    };
  });
}

// Trigger a browser download so the guest keeps a copy on their own device.
export function saveToDevice(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
