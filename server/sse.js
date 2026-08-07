import { config } from './config.js';

/*
 * Per-event Server-Sent-Events hub for live album updates.
 *
 * Single instance: photos broadcast directly to locally-connected guests.
 * Multiple instances (REDIS_URL set): each broadcast is published to Redis and
 * every instance fans it out to its own connected guests — so a photo uploaded
 * on instance A reaches guests on instance B. `ioredis` is imported dynamically
 * so it's only loaded when Redis is configured.
 */

const CHANNEL = 'eventcam:sse';
const channels = new Map(); // eventId -> Set<res>

let publisher = null;

export async function initSse() {
  if (!config.useRedis()) return;
  const { default: Redis } = await import('ioredis');
  publisher = new Redis(config.redisUrl);
  const subscriber = new Redis(config.redisUrl);
  await subscriber.subscribe(CHANNEL);
  subscriber.on('message', (_ch, msg) => {
    try {
      const { eventId, event, data } = JSON.parse(msg);
      localBroadcast(eventId, event, data);
    } catch {}
  });
  console.log('SSE fan-out: redis');
}

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

function localBroadcast(eventId, event, data) {
  const set = channels.get(eventId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

export function broadcast(eventId, event, data) {
  if (publisher) {
    // Published message comes back to us via the subscriber, which fans it out
    // locally — so we don't also broadcast here (avoids duplicates).
    publisher.publish(CHANNEL, JSON.stringify({ eventId, event, data }));
  } else {
    localBroadcast(eventId, event, data);
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
