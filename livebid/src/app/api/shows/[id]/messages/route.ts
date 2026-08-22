import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { publish } from "@/lib/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LENGTH = 300;

/** Posts a chat message into a live room. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, MAX_LENGTH);
  if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  const show = await prisma.show.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!show) return NextResponse.json({ error: "Show not found" }, { status: 404 });
  if (show.status === "ENDED") {
    return NextResponse.json({ error: "This show has ended" }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: { showId: params.id, userId: user.id, text },
  });

  const payload = {
    id: message.id,
    kind: "CHAT" as const,
    text,
    handle: user.handle,
    displayName: user.displayName,
    avatarEmoji: user.avatarEmoji,
    createdAt: message.createdAt.toISOString(),
  };
  publish(params.id, { type: "chat", payload });

  return NextResponse.json({ ok: true, message: payload });
}
