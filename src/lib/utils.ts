import crypto from "crypto";

/** Formats a THB amount for display. */
export function formatTHB(amount: number): string {
  return amount.toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** A short, URL-safe, reasonably-unguessable slug for public event links. */
export function generateSlug(): string {
  return crypto.randomBytes(6).toString("hex"); // 12 hex chars
}

/** Human-friendly relative time, in Thai-ish short form. */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "เมื่อสักครู่";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

/** Join class names, dropping falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
