"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const items = [
  { href: "", label: "ภาพรวม", icon: "📊" },
  { href: "/wishes", label: "คำอวยพร", icon: "💌" },
  { href: "/envelopes", label: "ซองออนไลน์", icon: "🧧" },
  { href: "/qr", label: "QR & ลิงก์", icon: "🔗" },
  { href: "/photobook", label: "หนังสือที่ระลึก", icon: "📖" },
  { href: "/settings", label: "ตั้งค่า", icon: "⚙️" },
];

export default function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${eventId}`;

  return (
    <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active =
          item.href === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
            className={cx(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
              active
                ? "bg-blush-600 text-white"
                : "text-gray-600 hover:bg-blush-100 hover:text-blush-700",
            )}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
