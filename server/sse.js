/*
 * Tiny per-event Server-Sent-Events hub for live album updates.
 *
 * SSE is a good fit here: it's one-way (server -> guest), rides plain HTTP/2,
 * survives proxies, and auto-reconnects in the browser. It's far cheaper than
 * websockets for a "just tell me when a new photo lands" feed.
 *
 * This hub is per-process. When you run multiple app instances behind a load
 * balancer, back it with Redis pub/sub so a photo uploaded on instance A is
 * broadcast to guests connected to instance B. See SCALING.md.
 */

const channels = new Map(); // eventId -> Set<res>

export function subscribe(eventId, res) {
  let set = channels.get(eventId);
  if (!set) {
    set = new Set();
    channels.set(eventId, set);
  }
  set.add(res);

  res.on('close', () => {
    set.delete(res);
    if (set.size === 0) channels.delete(eventId);
  });
}

export function broadcast(eventId, event, data) {
  const set = channels.get(eventId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}

// Keep intermediaries from closing idle connections.
setInterval(() => {
  for (const set of channels.values()) {
    for (const res of set) res.write(': ping\n\n');
  }
}, 25_000).unref();

export function connectionCount() {
  let n = 0;
  for (const set of channels.values()) n += set.size;
  return n;
}
