/*
 * On-device face search. Everything runs in the guest's browser — face
 * descriptors are computed locally and never leave the device, so no biometric
 * data is sent to the server. The (heavy) model + library load lazily, only
 * when the guest actually opens face search.
 */

let apiPromise = null;

// Lazy-load face-api + the three models we need (detector, tiny landmarks,
// recognition). Memoized so it only ever happens once per session. Picks a
// working tfjs backend: WebGL (fast, phones) with a CPU fallback (pure JS —
// always works, just slower) so it never hard-fails on odd devices.
export function loadFaceApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tf = faceapi.tf;
      try {
        await tf.setBackend('webgl');
        await tf.ready();
        tf.zeros([1]).dispose(); // force a GPU op — throws here if WebGL is broken
      } catch {
        await tf.setBackend('cpu');
        await tf.ready();
      }
      const url = '/models';
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
      return faceapi;
    })().catch((e) => {
      apiPromise = null; // allow a retry on failure
      throw e;
    });
  }
  return apiPromise;
}

// Load an image URL and draw it onto a canvas capped at `max` px on the long
// edge — smaller inputs make detection much faster (especially on the CPU
// backend) without hurting accuracy for album-sized faces.
function loadInput(url, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// All face descriptors found in an image URL (128-float vectors). A larger
// input + lower score threshold catches smaller, angled and partly-covered
// faces (e.g. a hand near the eyes) instead of missing them.
export async function descriptorsForUrl(url) {
  const faceapi = await loadFaceApi();
  const input = await loadInput(url, 1280);
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });
  const res = await faceapi.detectAllFaces(input, opts).withFaceLandmarks(true).withFaceDescriptors();
  return res.map((r) => r.descriptor);
}

// The single most prominent face in an image (used for the reference selfie).
export async function primaryDescriptorForUrl(url) {
  const faceapi = await loadFaceApi();
  const input = await loadInput(url, 1024);
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 });
  const res = await faceapi.detectAllFaces(input, opts).withFaceLandmarks(true).withFaceDescriptors();
  if (!res.length) return null;
  res.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return res[0].descriptor;
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// Lower = stricter. face-api descriptors match the same person below ~0.6; we
// lean lenient (0.62) so lookalikes / close-ups / partly-covered faces still
// surface, per the "show near-matches too" ask.
export const MATCH_THRESHOLD = 0.62;

// Per-photo descriptor cache so repeat searches in a session don't recompute.
const cache = new Map();
export async function cachedDescriptors(photoId, url) {
  if (cache.has(photoId)) return cache.get(photoId);
  const d = await descriptorsForUrl(url);
  cache.set(photoId, d);
  return d;
}
