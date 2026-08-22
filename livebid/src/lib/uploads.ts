import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Uploaded files live OUTSIDE Next's `public/` dir because `next start` only
// serves public files that existed at startup — runtime uploads there would
// 404. They are streamed back through /api/files/[...path] instead.
export const STORAGE_DIR = path.join(process.cwd(), "storage", "uploads");

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

const MAX_BYTES = 12 * 1024 * 1024; // 12MB

export class UploadError extends Error {}

/** Persists an uploaded image and returns its URL (/api/files/<subdir>/<name>). */
export async function saveImage(file: File, subdir: string): Promise<string> {
  if (!file || file.size === 0) throw new UploadError("No file provided");
  if (file.size > MAX_BYTES) throw new UploadError("File is too large (max 12MB)");

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) throw new UploadError(`Unsupported image type: ${file.type || "unknown"}`);

  const safeSubdir = subdir.replace(/[^a-z0-9_-]/gi, "");
  const dir = path.join(STORAGE_DIR, safeSubdir);
  await fs.mkdir(dir, { recursive: true });

  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return `/api/files/${safeSubdir}/${name}`;
}
