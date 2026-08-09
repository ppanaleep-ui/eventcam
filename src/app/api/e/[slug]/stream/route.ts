import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { subscribe, type BusMessage } from "@/lib/events-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events stream of live activity (new wishes / envelopes) for an
// event. Used by the slideshow and the couple's dashboard.
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown, eventName?: string) => {
        try {
          if (eventName) controller.enqueue(encoder.encode(`event: ${eventName}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      // Initial hello so the client knows the stream is live.
      send({ ready: true }, "hello");

      const unsubscribe = subscribe(params.slug, (msg: BusMessage) => {
        send(msg.payload, msg.type);
      });

      // Keep-alive comment every 25s so proxies don't drop idle connections.
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          /* closed */
        }
      }, 25_000);

      // Clean up when the client disconnects.
      _req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
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
