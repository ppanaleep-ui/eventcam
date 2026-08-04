/*
 * Simple burst load test for EventCam.
 *
 * Simulates N guests hitting one event concurrently: each guest opens the
 * event, then either uploads a photo or browses the album. It reports
 * throughput and error rate so you can sanity-check a deployment before a big
 * event.
 *
 *   node scripts/loadtest.mjs --url http://localhost:3000 --guests 500 --uploaders 0.5
 *
 * Flags:
 *   --url        base URL of a running server (default http://localhost:3000)
 *   --guests     number of concurrent simulated guests (default 300)
 *   --uploaders  fraction of guests that upload vs. just browse (default 0.5)
 *   --rounds     upload/browse actions per uploading guest (default 1)
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const BASE = args.url || 'http://localhost:3000';
const GUESTS = Number(args.guests || 300);
const UPLOADER_FRAC = Number(args.uploaders ?? 0.5);
const ROUNDS = Number(args.rounds || 1);

// A tiny valid JPEG (1x1). Real guests upload ~150-400KB; swap in a bigger
// buffer to stress bandwidth rather than request handling.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64'
);

const stats = { ok: 0, fail: 0, uploads: 0, reads: 0, latencies: [] };

async function timed(fn) {
  const t = performance.now();
  try {
    await fn();
    stats.ok++;
  } catch (e) {
    stats.fail++;
  } finally {
    stats.latencies.push(performance.now() - t);
  }
}

async function createEvent() {
  const res = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Load Test', hostName: 'Bot' }),
  });
  if (!res.ok) throw new Error(`create failed ${res.status}`);
  return (await res.json()).id;
}

async function guest(id, isUploader) {
  // Everyone opens the event first.
  await timed(async () => {
    const r = await fetch(`${BASE}/api/events/${id}`);
    if (!r.ok) throw new Error('open');
  });

  for (let round = 0; round < ROUNDS; round++) {
    if (isUploader) {
      await timed(async () => {
        const fd = new FormData();
        fd.append('full', new Blob([JPEG], { type: 'image/jpeg' }), 'photo.jpg');
        fd.append('thumb', new Blob([JPEG], { type: 'image/jpeg' }), 'thumb.jpg');
        fd.append('guestName', `Guest ${Math.floor(Math.random() * 1e6)}`);
        fd.append('filter', 'classic');
        const r = await fetch(`${BASE}/api/events/${id}/photos`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error(`upload ${r.status}`);
        stats.uploads++;
      });
    } else {
      await timed(async () => {
        const r = await fetch(`${BASE}/api/events/${id}/photos?limit=60`);
        if (!r.ok) throw new Error('read');
        stats.reads++;
      });
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

(async () => {
  console.log(`Load test → ${BASE}  guests=${GUESTS} uploaders=${UPLOADER_FRAC} rounds=${ROUNDS}`);
  const eventId = await createEvent();
  console.log(`Created event ${eventId}`);

  const start = performance.now();
  const tasks = [];
  for (let i = 0; i < GUESTS; i++) {
    tasks.push(guest(eventId, Math.random() < UPLOADER_FRAC));
  }
  await Promise.all(tasks);
  const secs = (performance.now() - start) / 1000;

  const total = stats.ok + stats.fail;
  console.log('\n── Results ─────────────────────────────');
  console.log(`Wall time     : ${secs.toFixed(2)}s`);
  console.log(`Requests      : ${total}  (${(total / secs).toFixed(0)}/s)`);
  console.log(`  uploads     : ${stats.uploads}`);
  console.log(`  reads       : ${stats.reads}`);
  console.log(`Success       : ${stats.ok}`);
  console.log(`Failed        : ${stats.fail}`);
  console.log(`Latency p50   : ${pct(stats.latencies, 50).toFixed(0)}ms`);
  console.log(`Latency p95   : ${pct(stats.latencies, 95).toFixed(0)}ms`);
  console.log(`Latency p99   : ${pct(stats.latencies, 99).toFixed(0)}ms`);
  console.log(`Latency max   : ${pct(stats.latencies, 100).toFixed(0)}ms`);
  process.exit(stats.fail > 0 ? 1 : 0);
})();
