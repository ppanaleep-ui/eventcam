import "server-only";
import { prisma } from "./db";

export function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug } });
}

export function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  return `${base}${path}`;
}
