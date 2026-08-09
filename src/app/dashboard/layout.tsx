import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-blush-50">
      <header className="border-b border-blush-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-bold text-blush-700">
            💐 PhotoWish
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-gray-500 sm:inline">
              {user.displayName || user.email}
            </span>
            <form action={logoutAction}>
              <button className="text-sm text-gray-500 hover:text-blush-600">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
