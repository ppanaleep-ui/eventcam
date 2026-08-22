"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/auth";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? "One moment…" : label}
    </button>
  );
}

export function AuthForm({
  mode,
  action,
}: {
  mode: "signin" | "signup";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const isSignUp = mode === "signup";

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black">{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isSignUp
            ? "Bid in live shows, sell your own, and keep it all in one wallet."
            : "Sign in to bid, sell and manage your wallet."}
        </p>
      </div>

      {state?.error && (
        <p className="rounded-xl border border-hot-500/40 bg-hot-500/10 px-3 py-2 text-sm text-hot-400">
          {state.error}
        </p>
      )}

      {isSignUp && (
        <>
          <div>
            <label className="label" htmlFor="displayName">
              Display name
            </label>
            <input className="input" id="displayName" name="displayName" placeholder="Ploy S." required />
          </div>
          <div>
            <label className="label" htmlFor="handle">
              Handle
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">@</span>
              <input className="input" id="handle" name="handle" placeholder="ploy_collects" required />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
        />
      </div>

      <Submit label={isSignUp ? "Create account" : "Sign in"} />

      <p className="text-center text-sm text-slate-400">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link className="text-neon-400 hover:underline" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="text-neon-400 hover:underline" href="/signup">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
