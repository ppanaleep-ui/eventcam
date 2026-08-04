/*
 * Film camera engine — DAZZ-style.
 *
 * Each "film" is a real photographic grade applied per-pixel on a <canvas>:
 * a tone curve (contrast / black-lift / gamma), colour balance + split-tone,
 * saturation, then halation (highlight bloom), fine grain, a vignette, and
 * optional light leak / date stamp / scanlines. All of it runs on the guest's
 * device, so the server never processes an image.
 *
 * Live preview uses a cheap CSS approximation (`css`); the real grade is baked
 * in at capture time by renderFilm().
 */

export const FILMS = [
  { id: 'original', name: 'Original', css: 'none',
    grade: { contrast: 1, lift: 0, gamma: 1, sat: 1, gain: [1, 1, 1], shadow: [0, 0, 0], highlight: [0, 0, 0] },
    grain: 0, halation: 0, vignette: 0 },

  { id: 'classic', name: 'Classic', css: 'contrast(1.08) saturate(1.06) sepia(0.06)',
    grade: { contrast: 1.12, lift: 0.03, gamma: 1.0, sat: 1.08, gain: [1.04, 1.0, 0.96], shadow: [4, 2, -6], highlight: [8, 4, -4] },
    grain: 0.07, halation: 0.28, vignette: 0.28 },

  { id: 'golden', name: 'Golden', css: 'brightness(1.03) saturate(1.1) sepia(0.12)',
    grade: { contrast: 1.05, lift: 0.06, gamma: 0.98, sat: 1.12, gain: [1.08, 1.02, 0.9], shadow: [6, 2, -8], highlight: [16, 9, -6] },
    grain: 0.06, halation: 0.4, vignette: 0.3 },

  { id: 'portra', name: 'Portra', css: 'brightness(1.03) saturate(0.98) contrast(0.97)',
    grade: { contrast: 0.98, lift: 0.05, gamma: 1.0, sat: 1.0, gain: [1.03, 1.0, 0.99], shadow: [4, 2, 2], highlight: [7, 3, -2] },
    grain: 0.05, halation: 0.3, vignette: 0.22 },

  { id: 'frost', name: 'Frost', css: 'contrast(1.12) saturate(1.15) hue-rotate(-6deg)',
    grade: { contrast: 1.15, lift: 0.02, gamma: 1.0, sat: 1.15, gain: [0.98, 1.04, 1.0], shadow: [-4, 4, 2], highlight: [4, 6, -2] },
    grain: 0.07, halation: 0.2, vignette: 0.3 },

  { id: 'fade', name: 'Fade', css: 'contrast(0.9) saturate(0.85) brightness(1.05)',
    grade: { contrast: 0.9, lift: 0.13, gamma: 1.0, sat: 0.85, gain: [1.0, 1.0, 1.0], shadow: [8, 5, 3], highlight: [2, 0, -2] },
    grain: 0.06, halation: 0.16, vignette: 0.18 },

  { id: 'retro80', name: "'80s", css: 'saturate(1.2) sepia(0.15) contrast(1.06)',
    grade: { contrast: 1.1, lift: 0.05, gamma: 0.98, sat: 1.2, gain: [1.08, 1.0, 0.9], shadow: [8, 2, -6], highlight: [14, 7, -8] },
    grain: 0.12, halation: 0.32, vignette: 0.32, dateStamp: true },

  { id: 'slide', name: 'Slide', css: 'contrast(1.18) saturate(1.3)',
    grade: { contrast: 1.22, lift: 0.0, gamma: 1.0, sat: 1.3, gain: [1.05, 1.0, 1.02], shadow: [-2, 2, -2], highlight: [5, 2, 2] },
    grain: 0.05, halation: 0.24, vignette: 0.34 },

  { id: 'sunwash', name: 'Sunwash', css: 'brightness(1.06) saturate(1.12) sepia(0.1)',
    grade: { contrast: 1.0, lift: 0.06, gamma: 0.97, sat: 1.1, gain: [1.08, 1.02, 0.92], shadow: [4, 2, -4], highlight: [18, 9, -6] },
    grain: 0.05, halation: 0.42, vignette: 0.2, leak: true },

  { id: 'vhs', name: 'VHS', css: 'saturate(1.15) contrast(1.05) hue-rotate(-8deg)',
    grade: { contrast: 1.05, lift: 0.08, gamma: 1.0, sat: 1.15, gain: [1.0, 1.03, 1.0], shadow: [-6, 6, 4], highlight: [6, 8, -2] },
    grain: 0.1, halation: 0.15, vignette: 0.28, dateStamp: true, scan: true },

  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.2)',
    grade: { contrast: 1.26, lift: 0.03, gamma: 1.0, sat: 1, gain: [1, 1, 1], shadow: [2, 2, 4], highlight: [4, 4, 2], bw: true },
    grain: 0.1, halation: 0.2, vignette: 0.4 },
];

export function getFilm(id) {
  return FILMS.find((f) => f.id === id) || FILMS[0];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

let noiseCanvas = null;
function noise() {
  if (noiseCanvas) return noiseCanvas;
  const size = 180;
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

// Build a 256-entry lookup table folding exposure, gamma, contrast, black-lift
// and a per-channel gain — the tone curve of the film.
function buildLut(g, expMul, chGain) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let n = (i / 255) * expMul;
    n = clamp(n, 0, 1);
    n = Math.pow(n, g.gamma);
    n = (n - 0.5) * g.contrast + 0.5;
    n = g.lift + n * (1 - g.lift);
    n = n * chGain;
    lut[i] = clamp(n * 255, 0, 255);
  }
  return lut;
}

/**
 * Grade `src` (canvas/image) into a new w×h canvas using `film`.
 * opts: { temp: -100..100 (warm+/cool-), exposure: -2..2 stops }
 */
export function renderFilm(src, w, h, film, opts = {}) {
  const temp = opts.temp || 0;
  const exposure = opts.exposure || 0;
  const g = film.grade;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);

  const expMul = Math.pow(2, exposure);
  const tempR = 1 + temp / 260;
  const tempB = 1 - temp / 260;
  const lutR = buildLut(g, expMul, (g.gain[0] || 1) * tempR);
  const lutG = buildLut(g, expMul, g.gain[1] || 1);
  const lutB = buildLut(g, expMul, (g.gain[2] || 1) * tempB);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [shR, shG, shB] = g.shadow;
  const [hiR, hiG, hiB] = g.highlight;
  const sat = g.sat;
  const bw = g.bw;

  for (let i = 0; i < d.length; i += 4) {
    let r = lutR[d[i]];
    let gg = lutG[d[i + 1]];
    let b = lutB[d[i + 2]];

    const L = 0.299 * r + 0.587 * gg + 0.114 * b;
    const sw = 1 - L / 255;
    const hw = L / 255;
    r += shR * sw + hiR * hw;
    gg += shG * sw + hiG * hw;
    b += shB * sw + hiB * hw;

    if (bw) {
      const y = 0.299 * r + 0.587 * gg + 0.114 * b;
      r = y + shR;
      gg = y + shG;
      b = y + shB;
    } else if (sat !== 1) {
      r = L + (r - L) * sat;
      gg = L + (gg - L) * sat;
      b = L + (b - L) * sat;
    }

    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(gg, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }
  ctx.putImageData(img, 0, 0);

  // Halation: soft glow bleeding out of the highlights (that film "breath").
  if (film.halation) {
    const t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    const tc = t.getContext('2d');
    tc.filter = `blur(${Math.max(2, w * 0.012)}px) brightness(1.5) contrast(1.5)`;
    tc.drawImage(out, 0, 0);
    tc.filter = 'none';
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = film.halation;
    ctx.drawImage(t, 0, 0);
    ctx.restore();
  }

  // Light leak from a corner.
  if (film.leak) {
    const grd = ctx.createRadialGradient(w * 0.85, h * 0.12, 0, w * 0.85, h * 0.12, w * 0.75);
    grd.addColorStop(0, 'rgba(255,120,70,0.45)');
    grd.addColorStop(0.4, 'rgba(255,170,90,0.16)');
    grd.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Vignette.
  if (film.vignette) {
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${film.vignette})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  // Fine film grain.
  if (film.grain) {
    const n = noise();
    ctx.globalAlpha = film.grain;
    ctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < h; y += n.height) for (let x = 0; x < w; x += n.width) ctx.drawImage(n, x, y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // VHS scanlines.
  if (film.scan) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
  }

  if (film.dateStamp) drawDateStamp(ctx, w, h);

  return out;
}

function drawDateStamp(ctx, w, h) {
  const dt = new Date();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(2);
  const text = `${mm} ${dd} '${yy}`;
  const size = Math.max(16, Math.round(w * 0.045));
  ctx.font = `700 ${size}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(255,90,0,0.9)';
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = '#ff8a3d';
  ctx.fillText(text, w - size, h - size);
  ctx.shadowBlur = 0;
}

export function canvasToBlob(canvas, quality = 0.9) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

// Back-compat aliases (older imports).
export const FILTERS = FILMS;
export const getFilter = getFilm;
