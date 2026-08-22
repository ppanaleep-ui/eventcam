import { EventEmitter } from "events";

// In-process pub/sub that pushes live-room updates (bids, chat, listing state)
// to every connected viewer over Server-Sent Events.
//
// NOTE: per-process. Perfect for a single Node server (`next start`). For a
// multi-instance deploy, swap the emitter for Redis pub/sub — publish() and
// subscribe() below are the only surface that would change.

export type RoomEvent =
  | { type: "chat"; payload: unknown }
  | { type: "bid"; payload: unknown }
  | { type: "listing"; payload: unknown }
  | { type: "show"; payload: unknown }
  | { type: "wallet"; payload: unknown };

const globalForBus = globalThis as unknown as { livebidBus: EventEmitter | undefined };

const bus =
  globalForBus.livebidBus ??
  (() => {
    const emitter = new EventEmitter();
    // Every viewer of every live room holds one listener.
    emitter.setMaxListeners(10_000);
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.livebidBus = bus;
}

const channel = (showId: string) => `show:${showId}`;

export function publish(showId: string, event: RoomEvent): void {
  bus.emit(channel(showId), event);
}

export function subscribe(showId: string, handler: (event: RoomEvent) => void): () => void {
  const ch = channel(showId);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}
