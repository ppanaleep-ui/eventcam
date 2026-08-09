import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoWish — สมุดอวยพรงานแต่งงานยุคใหม่",
  description:
    "แพลตฟอร์มสมุดอวยพรงานแต่งงานดิจิทัล: แขกส่งรูป + คำอวยพรผ่านมือถือ, ใส่ซองออนไลน์, สไลด์โชว์เรียลไทม์ และหนังสือที่ระลึกเล่มจริง",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-blush-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
