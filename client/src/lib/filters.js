/*
 * Retro film filter engine.
 *
 * Everything here runs on the guest's device (a <canvas>), so image processing
 * never touches the server. That's what lets the backend stay flat when
 * thousands of people are snapping at once — the CPU cost is spread across
 * every phone in the room.
 *
 * Each preset is a CSS filter string plus a few hand-rolled overlays (grain,
 * vignette, warmth, light leaks, a disposable-camera date stamp) that CSS
 * filters can't express.
 */

export const FILTERS = [
  {
    id: 'original',
    name: 'Original',
    css: 'none',
    grain: 0,
    vignette: 0,
  },
  {
    id: 'classic',
    name: 'Classic',
    css: 'sepia(0.32) contrast(1.1) saturate(1.12) brightness(1.02)',
    grain: 0.06,
    vignette: 0.35,
    warmth: 0.06,
  },
  {
    id: 'retro90s',
    name: "'90s",
    css: 'sepia(0.22) saturate(1.32) contrast(1.06) brightness(1.05) hue-rotate(-8deg)',
    grain: 0.09,
    vignette: 0.3,
    warmth: 0.12,
    dateStamp: true,
  },
  {
    id: 'noir',
    name: 'Noir',
    css: 'grayscale(1) contrast(1.22) brightness(1.02)',
    grain: 0.1,
    vignette: 0.45,
  },
  {
    id: 'sunwash',
    name: 'Sunwash',
    css: 'brightness(1.1) saturate(1.18) contrast(0.94) sepia(0.12)',
    grain: 0.05,
    vignette: 0.18,
    warmth: 0.08,
    lightLeak: true,
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    css: 'sepia(0.24) contrast(1.05) brightness(1.06) saturate(1.1)',
    grain: 0.05,
    vignette: 0.25,
    warmth: 0.05,
    frame: true,
  },
];

export function getFilter(id) {
  return FILTERS.find((f) => f.id === id) || FILTERS[0];
}

let noiseCanvas = null;
function noise() {
  if (noiseCanvas) return noiseCanvas;
  const size = 160;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

/**
 * Render `source` (a video, image, or canvas) into a new canvas at the given
 * dimensions with the preset applied.
 */
export function renderFiltered(source, sw, sh, dw, dh, preset) {
  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext('2d');

  // Base image with the CSS-level filter applied.
  ctx.filter = preset.css && preset.css !== 'none' ? preset.css : 'none';
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, dw, dh);
  ctx.filter = 'none';

  // Warmth: a soft amber wash over the whole frame.
  if (preset.warmth) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = `rgba(255, 176, 92, ${preset.warmth})`;
    ctx.fillRect(0, 0, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Light leak: an orange/pink glow bleeding in from a corner.
  if (preset.lightLeak) {
    const g = ctx.createRadialGradient(dw * 0.82, dh * 0.15, 0, dw * 0.82, dh * 0.15, dw * 0.7);
    g.addColorStop(0, 'rgba(255, 120, 70, 0.42)');
    g.addColorStop(0.4, 'rgba(255, 170, 90, 0.16)');
    g.addColorStop(1, 'rgba(255, 170, 90, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Vignette: darkened corners.
  if (preset.vignette) {
    const g = ctx.createRadialGradient(
      dw / 2, dh / 2, Math.min(dw, dh) * 0.35,
      dw / 2, dh / 2, Math.max(dw, dh) * 0.72
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${preset.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dw, dh);
  }

  // Film grain: tiled noise blended in.
  if (preset.grain) {
    const n = noise();
    ctx.globalAlpha = preset.grain;
    ctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < dh; y += n.height) {
      for (let x = 0; x < dw; x += n.width) {
        ctx.drawImage(n, x, y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Disposable-camera date stamp, bottom-right, LED-orange.
  if (preset.dateStamp) {
    drawDateStamp(ctx, dw, dh);
  }

  // Polaroid frame drawn over the image edges.
  if (preset.frame) {
    drawFrame(ctx, dw, dh);
  }

  return out;
}

function drawDateStamp(ctx, dw, dh) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const text = `${mm} ${dd} '${yy}`;
  const size = Math.max(16, Math.round(dw * 0.045));
  ctx.font = `700 ${size}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(255, 90, 0, 0.9)';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = '#ff8a3d';
  ctx.fillText(text, dw - size, dh - size);
  ctx.shadowBlur = 0;
}

function drawFrame(ctx, dw, dh) {
  const b = Math.round(Math.min(dw, dh) * 0.045);
  ctx.strokeStyle = '#f6f1e7';
  ctx.lineWidth = b * 2; // half sits outside the canvas, giving a clean inner border
  ctx.strokeRect(0, 0, dw, dh);
}

/** Turn a canvas into a JPEG Blob. */
export function canvasToBlob(canvas, quality = 0.85) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}
