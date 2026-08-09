import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signupAction } from "@/app/actions/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 text-center text-xl font-bold text-blush-700">
        💐 PhotoWish
      </Link>
      <div className="card">
        <h1 className="mb-2 text-center font-serif text-2xl font-bold text-gray-900">
          สร้างบัญชีบ่าวสาว
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          เริ่มสร้างสมุดอวยพรงานแต่งงานของคุณ
        </p>
        <AuthForm mode="signup" action={signupAction} />
      </div>
    </main>
  );
}
