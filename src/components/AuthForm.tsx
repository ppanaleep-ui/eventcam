"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import type { AuthState } from "@/app/actions/auth";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full text-base" disabled={pending}>
      {pending ? "กำลังดำเนินการ..." : label}
    </button>
  );
}

export default function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isSignup && (
        <div>
          <label className="label">ชื่อที่แสดง (ไม่บังคับ)</label>
          <input name="displayName" className="input" placeholder="ชื่อของคุณ" />
        </div>
      )}
      <div>
        <label className="label">อีเมล</label>
        <input
          name="email"
          type="email"
          required
          className="input"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="label">รหัสผ่าน</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="input"
          placeholder="อย่างน้อย 8 ตัวอักษร"
          autoComplete={isSignup ? "new-password" : "current-password"}
        />
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <SubmitButton label={isSignup ? "สร้างบัญชี" : "เข้าสู่ระบบ"} />

      <p className="text-center text-sm text-gray-500">
        {isSignup ? (
          <>
            มีบัญชีอยู่แล้ว?{" "}
            <Link href="/login" className="font-medium text-blush-600">
              เข้าสู่ระบบ
            </Link>
          </>
        ) : (
          <>
            ยังไม่มีบัญชี?{" "}
            <Link href="/signup" className="font-medium text-blush-600">
              สร้างบัญชี
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
