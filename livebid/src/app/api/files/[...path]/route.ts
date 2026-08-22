import { NextRequest } from "next/server";
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

/** Streams back a runtime upload (product photos, top-up slips). */
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const relative = params.path.join("/");
  const target = path.join(STORAGE_DIR, relative);

  // Refuse anything that escapes the storage root.
  if (!target.startsWith(STORAGE_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await fs.readFile(target);
    return new Response(file, {
      headers: {
        "Content-Type": CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
