import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_DIR } from "@/lib/uploads";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

// Streams uploaded files (guest photos, slips, prewedding media) from the
// storage directory. Guards against path traversal.
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const rel = (params.path || []).join("/");
  const target = path.normalize(path.join(STORAGE_DIR, rel));

  // Ensure the resolved path stays within STORAGE_DIR.
  if (!target.startsWith(STORAGE_DIR + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
