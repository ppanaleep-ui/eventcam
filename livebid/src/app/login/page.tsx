import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { signIn } from "@/app/actions/auth";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <div className="mx-auto max-w-md pt-8">
      <AuthForm mode="signin" action={signIn} />
    </div>
  );
}
