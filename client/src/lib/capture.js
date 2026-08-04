import { renderFiltered, canvasToBlob } from './filters.js';

const MAX_FULL = 1600; // longest edge of the stored full-size image
const MAX_THUMB = 420; // longest edge of the album thumbnail

function fit(sw, sh, max) {
  const scale = Math.min(1, max / Math.max(sw, sh));
  return { w: Math.round(sw * scale), h: Math.round(sh * scale) };
}

/**
 * From a source frame (video/image/canvas) at natural size sw x sh, produce
 * the two JPEGs we upload: a full-size filtered image and a small thumbnail.
 * Both are rendered on-device so the server just stores bytes.
 */
export async function produceImages(source, sw, sh, preset) {
  const full = fit(sw, sh, MAX_FULL);
  const fullCanvas = renderFiltered(source, sw, sh, full.w, full.h, preset);
  const fullBlob = await canvasToBlob(fullCanvas, 0.85);

  const thumb = fit(sw, sh, MAX_THUMB);
  // Rendering the thumbnail from the already-filtered full canvas keeps the
  // look identical and is cheaper than re-running overlays at a new size.
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumb.w;
  thumbCanvas.height = thumb.h;
  thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, thumb.w, thumb.h);
  const thumbBlob = await canvasToBlob(thumbCanvas, 0.72);

  return { fullBlob, thumbBlob, width: full.w, height: full.h, previewCanvas: fullCanvas };
}
