import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "LiveBid — live shopping & auctions",
  description:
    "Watch live shows, bid in real time and pay straight from your LiveBid wallet.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <NavBar
          user={
            user
              ? {
                  handle: user.handle,
                  avatarEmoji: user.avatarEmoji,
                  isSeller: user.isSeller,
                  isAdmin: user.isAdmin,
                  available: user.wallet?.available ?? 0,
                }
              : null
          }
        />
        <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6">{children}</main>
      </body>
    </html>
  );
}
