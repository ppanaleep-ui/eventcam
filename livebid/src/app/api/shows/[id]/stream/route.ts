import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { subscribe, type RoomEvent } from "@/lib/bus";
import { settleDueListings } from "@/lib/auction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The auction clock. Instead of a background worker, each live room keeps one
// shared ticker while at least one viewer is connected: it closes any auction
// whose timer has expired, which in turn publishes to everyone on the bus.
const tickers = new Map<string, { timer: NodeJS.Timeout; viewers: number }>();

function retainTicker(showId: string): () => void {
  const existing = tickers.get(showId);
  if (existing) {
    existing.viewers += 1;
  } else {
    const timer = setInterval(() => {
      settleDueListings(showId).catch(() => {
        /* a failed sweep is retried on the next tick */
      });
    }, 1_000);
    tickers.set(showId, { timer, viewers: 1 });
  }

  return () => {
    const entry = tickers.get(showId);
    if (!entry) return;
    entry.viewers -= 1;
    if (entry.viewers <= 0) {
      clearInterval(entry.timer);
      tickers.delete(showId);
    }
  };
}

/** Server-Sent Events stream of everything happening in one live room. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const show = await prisma.show.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!show) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown, eventName: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      send({ ready: true }, "hello");

      const unsubscribe = subscribe(params.id, (event: RoomEvent) => send(event.payload, event.type));
      const releaseTicker = retainTicker(params.id);

      // Keep-alive comment so proxies don't drop an idle room.
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          /* closed */
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        releaseTicker();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
