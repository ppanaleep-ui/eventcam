import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginAction } from "@/app/actions/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-center text-xl font-bold text-blush-700">
        💐 PhotoWish
      </Link>
      <div className="card">
        <h1 className="mb-6 text-center font-serif text-2xl font-bold text-gray-900">
          เข้าสู่ระบบ
        </h1>
        <AuthForm mode="login" action={loginAction} />
      </div>
    </main>
  );
}
