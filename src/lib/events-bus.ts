import { EventEmitter } from "events";

// In-process pub/sub used to push real-time updates (new wishes, new envelopes)
// to connected slideshow screens and dashboards via Server-Sent Events.
//
// NOTE: this is per-process. It is perfect for a single Node server (the default
// `next start`). For multi-instance deployments, replace the emitter with Redis
// pub/sub or a hosted realtime service — the publish/subscribe surface below is
// the only thing that would need to change.

type EventName = "wish" | "envelope" | "media";

export type BusMessage = {
  type: EventName;
  eventId: string;
  slug: string;
  payload: unknown;
};

const globalForBus = globalThis as unknown as {
  photowishBus: EventEmitter | undefined;
};

const bus =
  globalForBus.photowishBus ??
  (() => {
    const e = new EventEmitter();
    // Slideshow + dashboard + admin can each subscribe; raise the ceiling.
    e.setMaxListeners(1000);
    return e;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.photowishBus = bus;
}

function channel(slug: string): string {
  return `event:${slug}`;
}

export function publish(message: BusMessage): void {
  bus.emit(channel(message.slug), message);
}

export function subscribe(
  slug: string,
  handler: (message: BusMessage) => void,
): () => void {
  const ch = channel(slug);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}
