import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + database check. Point your host's health check here. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: "down", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
